DB-Autoscale: High-Availability 3-Tier Cluster
An automated, self-scaling infrastructure project featuring a Node.js backend fleet, a MySQL Master-Slave replication cluster, and a Python-driven orchestration engine. This project demonstrates real-time horizontal scaling triggered by simulated heavy traffic.

🏗 System Architecture
The project is divided into three distinct logical tiers:
Traffic Tier: Nginx acts as a Reverse Proxy and Load Balancer, distributing incoming traffic across a dynamic pool of backend containers.
Compute Tier: Node.js containers handle business logic and write logs to the Primary DB. This tier also houses the Autoscale Controller, which manages the cluster size via the Docker Socket.
Data Tier: A MySQL 8.0 cluster.
Primary DB: Handles all INSERT and UPDATE operations.
Replica DB: Mirrored via Binary Logs; serves all SELECT queries for the Dashboard to maintain high performance.

🚀 Key Features
Dynamic Scaling: The system automatically scales from 1 to 10 replicas based on real-time CPU telemetry.
DooD (Docker-out-of-Docker): The backend container communicates directly with the host's /var/run/docker.sock to manage infrastructure.
Load Testing: Integrated Locust environment to simulate 1,000+ concurrent users and stress-test the scaling logic.
Data Consistency: Automated Master-Slave replication setup ensures zero-downtime data availability for the monitoring dashboard.

🛠 Tech Stack
Infrastructure: Docker, Docker Compose
Backend: Node.js (Express), Python (Scaling Engine)
Database: MySQL 8.0 (Master-Slave)
Proxy: Nginx
Load Testing: Locust
