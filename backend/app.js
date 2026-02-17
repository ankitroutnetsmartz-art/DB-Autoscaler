const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const { exec } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json());

// Database Configuration from Environment Variables
const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 50
};

// Primary for Writes, Replica Service for Reads
const primaryPool = mysql.createPool({ ...dbConfig, host: process.env.DB_HOST_PRIMARY });
// FIXED: Using 'replica-db' as the hostname allows Docker's internal DNS to load balance
const replicaPool = mysql.createPool({ ...dbConfig, host: 'replica-db' });

// --- Manual Scaling Endpoint ---
app.post('/api/scale', (req, res) => {
    const count = req.body.count;
    if (count < 1 || count > 5) return res.status(400).json({ error: "Invalid count" });

    console.log(`Manual scale request: ${count} replicas`);

    // Using absolute path and API version negotiation to ensure host communication
    const scaleCommand = `cd /host_root && DOCKER_API_VERSION=1.44 /usr/bin/docker compose -p autoscale-3tier-app up -d --no-recreate --scale replica-db=${count} && ./sync_slaves.sh`;

    exec(scaleCommand, (err, stdout, stderr) => {
        if (err) {
            console.error("Scale Operation Failed:", stderr);
            return res.status(500).json({ error: "Scaling failed", details: stderr });
        }
        console.log("Scale Operation Success:", stdout);
        res.json({ message: `Scaled to ${count} nodes`, details: stdout });
    });
});

// --- Data Fetching (READ) ---
app.get('/api/data', (req, res) => {
    // Get detailed metrics for all replicas
    const metricsCmd = "DOCKER_API_VERSION=1.44 docker stats --no-stream --format '{{.Name}}:{{.CPUPerc}}' $(docker ps --filter 'name=replica-db' --filter 'status=running' -q)";

    exec(metricsCmd, (err, stdout) => {
        const replicaMetrics = [];
        if (!err && stdout) {
            stdout.trim().split('\n').forEach(line => {
                const [name, cpu] = line.split(':');
                if (name && cpu) {
                    replicaMetrics.push({
                        name: name.replace('autoscale-3tier-app-', ''),
                        cpu: cpu.replace('%', '')
                    });
                }
            });
        }

        replicaPool.query('SELECT * FROM site_entries ORDER BY id DESC LIMIT 1', (err, results) => {
            if (err) {
                console.error("Read Error:", err.message);
                return res.status(500).json({ error: "Replica connection error" });
            }

            // Fire-and-forget logging to Primary for performance
            primaryPool.query('INSERT INTO request_logs (node_used, request_type) VALUES (?, ?)',
                ['replica-load-balanced', 'READ'], (logErr) => {
                    if (logErr) console.error("Log Write Error:", logErr.message);
                });

            res.json({
                source: "READ-REPLICA",
                replicas: replicaMetrics,
                active_nodes: replicaMetrics.length,
                node: "load-balanced-pool",
                data: results
            });
        });
    });
});

// --- Data Entry (WRITE) ---
app.post('/api/data', (req, res) => {
    const title = req.body.message || "Locust Write Task";
    primaryPool.query('INSERT INTO site_entries (title, description) VALUES (?, ?)',
        [title, "Manual Entry"], (err) => {
            if (err) return res.status(500).json({ error: err.message });

            // Fire-and-forget logging to Primary for performance
            primaryPool.query('INSERT INTO request_logs (node_used, request_type) VALUES (?, ?)',
                ['primary-db', 'WRITE'], (logErr) => {
                    if (logErr) console.error("Log Write Error:", logErr.message);
                });

            res.status(201).json({ status: "Written to Primary" });
        });
});

// --- Log Retrieval ---
app.get('/api/logs', (req, res) => {
    // Fetch logs from Primary to ensure accuracy in dashboard even if replicas are syncing
    primaryPool.query('SELECT * FROM request_logs ORDER BY id DESC LIMIT 50', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });

        // Convert to ISO strings to ensure the dashboard can handle timezones correctly
        const formattedResults = (results || []).map(row => ({
            ...row,
            timestamp: row.timestamp ? new Date(row.timestamp).toISOString() : null
        }));

        res.json(formattedResults);
    });
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Backend listening on port ${PORT}`));