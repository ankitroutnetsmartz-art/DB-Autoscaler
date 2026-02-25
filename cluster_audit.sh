#!/bin/sh
# PORTABLE AUDIT SCRIPT
BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "🚀 Starting 3-Tier Architecture Production Audit...\n"

# Identify all replicas dynamically
REPLICAS=$(docker ps --filter "name=replica-db" --format "{{.Names}}")

check_node() {
    node_name=$1
    printf "Checking $node_name... "
    if docker exec $node_name mysqladmin ping -u root -pproduction_secure_password > /dev/null 2>&1; then
        echo "PASSED (Ready)"
        return 0
    else
        echo "FAILED (Engine Down)"
        return 1
    fi
}

echo "[1/4] Container Lifecycle"
docker compose ps

echo "\n[2/4] Database Engine Status"
check_node "primary-db"
for R in $REPLICAS; do
    check_node "$R"
done

echo "\n[3/4] Internal Network Discovery (Backend -> DBs)"
for target in primary-db $REPLICAS; do
    printf "Can Backend reach $target? "
    if docker exec backend ping -c 1 $target > /dev/null 2>&1; then
        echo "YES"
    else
        echo "NO (DNS Failure)"
    fi
done

echo "\n[4/4] Production Integrity Check"
AUTH_METHOD=$(docker exec primary-db mysql -u root -pproduction_secure_password -N -s -e "SELECT plugin FROM mysql.user WHERE user='root' AND host='%' LIMIT 1;" 2>/dev/null)
echo "Primary Auth: $AUTH_METHOD"

for R in $REPLICAS; do
    IO=$(docker exec $R mysql -u root -pproduction_secure_password -e "SHOW SLAVE STATUS\G" | grep "Slave_IO_Running:" | awk '{print $2}')
    if [ "$IO" = "Yes" ]; then
        echo "Replication $R: SYNCED"
    else
        echo "Replication $R: BROKEN/NOT CONFIGURED"
    fi
done

echo "\nAudit Complete."