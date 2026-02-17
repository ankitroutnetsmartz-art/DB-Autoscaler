#!/bin/bash
# Autoscale Engine for 3-Tier App - DEMO MODE
set -e

# Configuration
THRESHOLD=15     # Scale up if CPU > 15%
MIN_REPLICAS=1
MAX_REPLICAS=5
PROJECT_NAME="autoscale-3tier-app"

echo "⚙️ Autoscaling engine started (DEMO MODE)..."
echo "📊 Monitoring project: $PROJECT_NAME"
echo "📈 Threshold: $THRESHOLD% | Limits: $MIN_REPLICAS-$MAX_REPLICAS nodes"

while true; do
    REPLICA_IDS=$(docker ps --filter "name=replica-db" --filter "label=com.docker.compose.project=$PROJECT_NAME" -q)
    CURRENT_COUNT=$(echo "$REPLICA_IDS" | wc -w)
    
    if [ "$CURRENT_COUNT" -gt 0 ]; then
        CPU_LOAD=$(docker stats --no-stream --format "{{.CPUPerc}}" $REPLICA_IDS | sed 's/%//' | awk '{sum+=$1; n++} END {if (n > 0) print sum/n; else print 0}')
        CPU_LOAD_INT=${CPU_LOAD%.*}
        [ -z "$CPU_LOAD_INT" ] && CPU_LOAD_INT=0
    else
        CPU_LOAD_INT=0
        CURRENT_COUNT=0
    fi

    echo "📊 DB Tier Load: $CPU_LOAD_INT% | Active Nodes: $CURRENT_COUNT"

    if [ "$CPU_LOAD_INT" -ge "$THRESHOLD" ] && [ "$CURRENT_COUNT" -lt "$MAX_REPLICAS" ]; then
        NEW_COUNT=$((CURRENT_COUNT + 1))
        echo "🚀 LOAD DETECTED ($CPU_LOAD_INT%). Scaling UP to $NEW_COUNT nodes..."
        docker compose -p $PROJECT_NAME up -d --no-recreate --scale replica-db=$NEW_COUNT
        
        echo "🔄 Triggering replication sync..."
        ./sync_slaves.sh
        
        echo "⏳ Cooling down for 30s..."
        sleep 30
        
    elif [ "$CPU_LOAD_INT" -eq 0 ] && [ "$CURRENT_COUNT" -gt "$MIN_REPLICAS" ]; then
        # In demo mode, only scale down if load is EXACTLY 0%
        # Adding a sleep to slow down scale-down for visibility
        sleep 20
        echo "📉 IDLE detected. Scaling DOWN to $MIN_REPLICAS node for demo..."
        docker compose -p $PROJECT_NAME up -d --no-recreate --scale replica-db=1
    fi

    sleep 5
done
