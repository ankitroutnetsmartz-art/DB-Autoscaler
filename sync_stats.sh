#!/bin/bash
while true; do
  # Count replicas using the host's working docker command
  COUNT=$(docker ps --filter "name=replica-db" --filter "status=running" -q | wc -l)
  # Update a shared file that the backend can read
  echo $COUNT > replica_count.txt
  sleep 2
done
