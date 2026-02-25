#!/bin/sh
# PORTABLE REPLICA SYNC
set -e

echo "🔍 Discovering replica containers..."
REPLICA_COUNT=$(docker ps --filter "name=replica-db" --format "{{.Names}}" | wc -l)

if [ "$REPLICA_COUNT" -eq 0 ]; then
    echo "❌ No replica containers found. Start the stack with: docker compose up -d"
    exit 1
fi

echo "📊 Found $REPLICA_COUNT replica(s)"

# Wait for Primary to be ready
echo "⏳ Waiting for primary-db to be ready..."
i=1
while [ $i -le 60 ]; do
    if docker exec primary-db mysqladmin ping -pproduction_secure_password --silent; then
        echo "   ✅ primary-db is ready"
        break
    fi
    if [ $i -eq 60 ]; then
        echo "   ❌ primary-db failed to become ready"
        exit 1
    fi
    sleep 2
    i=$((i + 1))
done

# Get primary binlog position
echo "📌 Getting primary binlog position..."
BINLOG_INFO=$(docker exec primary-db mysql -uroot -pproduction_secure_password \
    -e "SHOW MASTER STATUS\G")

BINLOG_FILE=$(echo "$BINLOG_INFO" | grep "File:" | awk '{print $2}')
BINLOG_POS=$(echo "$BINLOG_INFO" | grep "Position:" | awk '{print $2}')

echo "   Primary at: $BINLOG_FILE, Position: $BINLOG_POS"

# Ensure a replication user exists
echo "🔐 Ensuring replication user exists on primary..."
docker exec primary-db mysql -uroot -pproduction_secure_password -e "\
    CREATE USER IF NOT EXISTS 'repl'@'%' IDENTIFIED WITH mysql_native_password BY 'production_secure_password'; \
    GRANT REPLICATION SLAVE ON *.* TO 'repl'@'%'; FLUSH PRIVILEGES;" 2>/dev/null || true

# Get primary IP
PRIMARY_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' primary-db)
echo "   Primary IP: $PRIMARY_IP"

# Configure each replica
for REPLICA in $(docker ps --filter "name=replica-db" --format "{{.Names}}"); do
    echo "🔧 Checking readiness of $REPLICA..."
    
    j=1
    while [ $j -le 60 ]; do
        if docker exec $REPLICA mysqladmin ping -pproduction_secure_password --silent; then
            echo "   ✅ $REPLICA is ready"
            break
        fi
        if [ $j -eq 60 ]; then
            echo "   ❌ $REPLICA failed to become ready"
            continue 2
        fi
        sleep 1
        j=$((j + 1))
    done

    echo "⚙️  Configuring replication on $REPLICA..."
    
    REPLICA_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $REPLICA)
    SERVER_ID=$(echo $REPLICA_IP | awk -F. '{print $4 + 100}')
    
    echo "   Assigning server-id=$SERVER_ID to $REPLICA (IP: $REPLICA_IP)"
    
    docker exec $REPLICA mysql -uroot -pproduction_secure_password -e "
        STOP SLAVE;
        RESET SLAVE ALL;
        RESET MASTER;
        SET GLOBAL server_id=$SERVER_ID;
        CHANGE MASTER TO 
            MASTER_HOST='${PRIMARY_IP}',
            MASTER_USER='repl',
            MASTER_PASSWORD='production_secure_password',
            MASTER_LOG_FILE='${BINLOG_FILE}',
            MASTER_LOG_POS=${BINLOG_POS},
            MASTER_SSL=0;
        START SLAVE;
    " 2>/dev/null || echo "   ⚠️  $REPLICA configuration issue"
    
    # Verify replication status
    SLAVE_STATUS=$(docker exec $REPLICA mysql -uroot -pproduction_secure_password \
        -e "SHOW SLAVE STATUS\G" 2>/dev/null | grep "Slave_IO_Running:" | awk '{print $2}')
    
    if [ "$SLAVE_STATUS" = "Yes" ]; then
        echo "   ✅ $REPLICA replication active"
    else
        echo "   ❌ $REPLICA replication issue - check logs"
    fi
done

echo ""
echo "🎉 Replication sync complete!"
