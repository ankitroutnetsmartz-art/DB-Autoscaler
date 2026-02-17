#!/bin/bash
BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BOLD}🚀 Starting 3-Tier Architecture Production Audit...${NC}\n"

# Identify all replicas dynamically
REPLICAS=$(docker ps --filter "name=replica-db" --format "{{.Names}}")

check_node() {
    local name=$1
    echo -n "Checking $name... "
    if docker exec $name mysqladmin ping -u root -pproduction_secure_password > /dev/null 2>&1; then
        echo -e "${GREEN}PASSED (Ready)${NC}"
        return 0
    else
        echo -e "${RED}FAILED (Engine Down)${NC}"
        return 1
    fi
}

# 1. Container Presence
echo -e "${BOLD}[1/4] Container Lifecycle${NC}"
docker compose ps

# 2. Database Health (Dynamic Loop)
echo -e "\n${BOLD}[2/4] Database Engine Status${NC}"
check_node "primary-db"
for R in $REPLICAS; do
    check_node "$R"
done

# 3. Network Discovery
echo -e "\n${BOLD}[3/4] Internal Network Discovery (Backend -> DBs)${NC}"
for target in primary-db $REPLICAS; do
    echo -n "Can Backend reach $target? "
    if docker exec app-backend ping -c 1 $target > /dev/null 2>&1; then
        echo -e "${GREEN}YES${NC}"
    else
        echo -e "${RED}NO (DNS Failure)${NC}"
    fi
done

# 4. Auth & Replication Check
echo -e "\n${BOLD}[4/4] Production Integrity Check${NC}"
# Check Auth
AUTH_METHOD=$(docker exec primary-db mysql -u root -pproduction_secure_password -N -s -e "SELECT plugin FROM mysql.user WHERE user='root' AND host='%' LIMIT 1;" 2>/dev/null)
echo -e "Primary Auth: ${GREEN}$AUTH_METHOD${NC}"

# Check Replication IO on all replicas
for R in $REPLICAS; do
    IO=$(docker exec $R mysql -u root -pproduction_secure_password -e "SHOW SLAVE STATUS\G" | grep "Slave_IO_Running:" | awk '{print $2}')
    if [ "$IO" == "Yes" ]; then
        echo -e "Replication $R: ${GREEN}SYNCED${NC}"
    else
        echo -e "Replication $R: ${RED}BROKEN/NOT CONFIGURED${NC}"
    fi
done

echo -e "\n${BOLD}Audit Complete.${NC}"