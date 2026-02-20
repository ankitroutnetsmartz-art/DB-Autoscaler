#!/bin/bash
# PRODUCTION-GRADE AUTOSCALER v4.1
REQ_THRESHOLD=15
CPU_THRESHOLD=40
MAX_NODES=10
MIN_NODES=1

while true; do
    # 1. Fetch metrics (Note: Using 125 for GID-related tasks if needed)
    REQ_LOAD=$(docker exec -e MYSQL_PWD=production_secure_password primary-db mysql -u root app_db -N -e \
    "SELECT COUNT(*) FROM request_logs WHERE timestamp > NOW() - INTERVAL 10 SECOND;")
    
    CPU_LOAD=$(docker stats --no-stream --format "{{.CPUPerc}}" | sed 's/%//' | awk '{sum+=$1; count++} END {if (count > 0) print sum/count; else print 0}' | cut -d. -f1)
    
    REPLICA_COUNT=$(docker ps --filter "label=com.docker.compose.service=replica-db" --filter "status=running" -q | wc -l)
    TOTAL_NODES=$((REPLICA_COUNT + 1))
    
    echo "📊 Status -> Req_Load: ${REQ_LOAD} | Avg_CPU: ${CPU_LOAD}% | Nodes: ${TOTAL_NODES}"

    # 2. Scaling Logic
    if ([ "$REQ_LOAD" -gt "$REQ_THRESHOLD" ] || [ "$CPU_LOAD" -gt "$CPU_THRESHOLD" ]) && [ "$TOTAL_NODES" -lt "$MAX_NODES" ]; then
        NEW_REPLICA_COUNT=$((REPLICA_COUNT + 1))
        echo "🚀 SCALE UP -> ${NEW_REPLICA_COUNT} replicas"
        docker compose up -d --scale replica-db=${NEW_REPLICA_COUNT} --no-recreate
    
    # 3. Downscaling Logic (Triggers when load is low AND we have more than MIN_NODES)
    elif [ "$REQ_LOAD" -lt 5 ] && [ "$CPU_LOAD" -lt 20 ] && [ "$TOTAL_NODES" -gt "$MIN_NODES" ]; then
        NEW_REPLICA_COUNT=$((REPLICA_COUNT - 1))
        echo "📉 SCALE DOWN -> ${NEW_REPLICA_COUNT} replicas"
        # We use --remove-orphans to ensure Docker cleans up the stopped container
        docker compose up -d --scale replica-db=${NEW_REPLICA_COUNT} --remove-orphans
    fi

    sleep 5
done