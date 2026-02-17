#!/bin/bash
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
for i in {1..60}; do
    if docker exec primary-db mysqladmin ping -pproduction_secure_password --silent; then
        echo "   ✅ primary-db is ready"
        break
    fi
    if [ $i -eq 60 ]; then
        echo "   ❌ primary-db failed to become ready"
        exit 1
    fi
    sleep 2
done

# Get primary binlog position
echo "📌 Getting primary binlog position..."
BINLOG_INFO=$(docker exec primary-db mysql -uroot -pproduction_secure_password \
    -e "SHOW MASTER STATUS\G" | grep -E "File:|Position:")

BINLOG_FILE=$(echo "$BINLOG_INFO" | grep "File:" | awk '{print $2}')
BINLOG_POS=$(echo "$BINLOG_INFO" | grep "Position:" | awk '{print $2}')

echo "   Primary at: $BINLOG_FILE, Position: $BINLOG_POS"

# Configure each replica
docker ps --filter "name=replica-db" --format "{{.Names}}" | while read REPLICA; do
    echo "🔧 Checking readiness of $REPLICA..."
    
    # Wait for MySQL to be ready (up to 60 seconds)
    for i in {1..60}; do
        if docker exec $REPLICA mysqladmin ping -pproduction_secure_password --silent; then
            echo "   ✅ $REPLICA is ready"
            break
        fi
        if [ $i -eq 30 ]; then
            echo "   ❌ $REPLICA failed to become ready"
            continue 2
        fi
        sleep 1
    done

    echo "⚙️  Configuring replication on $REPLICA..."
    
    # Dynamically assign server-id based on the last octet of the container IP
    REPLICA_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $REPLICA)
    SERVER_ID=$(echo $REPLICA_IP | awk -F. '{print $4 + 100}')
    
    echo "   Assigning server-id=$SERVER_ID to $REPLICA (IP: $REPLICA_IP)"
    
    docker exec $REPLICA mysql -uroot -pproduction_secure_password -e "
        STOP SLAVE;
        RESET SLAVE ALL;
        RESET MASTER;
        SET GLOBAL server_id=$SERVER_ID;
        CHANGE MASTER TO 
            MASTER_HOST='primary-db',
            MASTER_USER='root',
            MASTER_PASSWORD='production_secure_password',
            MASTER_AUTO_POSITION=1;
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
echo "💡 Verify with: docker exec <replica-name> mysql -uroot -pproduction_secure_password -e 'SHOW SLAVE STATUS\G'"
