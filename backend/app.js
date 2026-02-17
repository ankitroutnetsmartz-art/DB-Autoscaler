const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const { exec } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json());

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 50,
    connectTimeout: 10000
};

// Primary for Writes
const primaryPool = mysql.createPool({ ...dbConfig, host: process.env.DB_HOST_PRIMARY });
// FIXED: Pointing to the 'replica-db' service name for automatic Load Balancing
const replicaPool = mysql.createPool({ ...dbConfig, host: 'replica-db' });

// --- Manual Scaling Endpoint ---
app.post('/api/scale', (req, res) => {
    const count = req.body.count;
    if (count < 1 || count > 5) return res.status(400).json({ error: "Invalid count" });

    const scaleCommand = `cd /host_root && DOCKER_API_VERSION=1.44 /usr/bin/docker compose up -d --scale replica-db=${count}`;

    exec(scaleCommand, (err, stdout, stderr) => {
        if (err) return res.status(500).json({ error: "Scaling failed", details: stderr });
        res.json({ message: `Scaled to ${count} nodes` });
    });
});

// --- Data Fetching (READ) - Fixed for History Tracking ---
app.get('/api/data', (req, res) => {
    replicaPool.query('SELECT * FROM site_entries ORDER BY id DESC LIMIT 1', (err, results) => {
        if (err) {
            console.error('Replica query error:', err && err.message);
            // Fallback to primary for reads
            return primaryPool.query('SELECT * FROM site_entries ORDER BY id DESC LIMIT 1', (pErr, pResults) => {
                if (pErr) {
                    console.error('Primary fallback query error:', pErr && pErr.message);
                    return res.status(500).json({ error: 'No DB available' });
                }
                primaryPool.query('INSERT INTO request_logs (node_used, request_type) VALUES (?, ?)', ['primary-fallback', 'READ'], (logErr) => {
                    if (logErr) console.error('Primary log insert error:', logErr && logErr.message);
                    // determine active nodes from request_logs (best-effort)
                    primaryPool.query("SELECT COUNT(DISTINCT node_used) AS replicas FROM request_logs WHERE node_used LIKE 'replica%'", (cErr, cRes) => {
                        let replicas = 0;
                        if (!cErr && cRes && cRes[0] && cRes[0].replicas) replicas = cRes[0].replicas;
                        const active_nodes = 1 + replicas; // primary + replicas
                        res.json({ source: 'READ-PRIMARY-FALLBACK', active_nodes, data: pResults });
                    });
                });
            });
        }

        // Record the event in the history table and return active_nodes
        primaryPool.query('INSERT INTO request_logs (node_used, request_type) VALUES (?, ?)', ['replica-pool', 'READ'], (logErr) => {
            if (logErr) console.error('Primary log insert error:', logErr && logErr.message);
            primaryPool.query("SELECT COUNT(DISTINCT node_used) AS replicas FROM request_logs WHERE node_used LIKE 'replica%'", (cErr, cRes) => {
                let replicas = 0;
                if (!cErr && cRes && cRes[0] && cRes[0].replicas) replicas = cRes[0].replicas;
                const active_nodes = 1 + replicas;
                res.json({ source: "READ-REPLICA", active_nodes, data: results });
            });
        });
    });
});

// --- Data Entry (WRITE) ---
app.post('/api/data', (req, res) => {
    const title = req.body.message || "Locust Load Test";
    primaryPool.query('INSERT INTO site_entries (title, description) VALUES (?, ?)', [title, "Manual Entry"], (err) => {
        if (err) {
            console.error('Primary insert error:', err && err.message);
            return res.status(500).json({ error: err.message });
        }
        primaryPool.query('INSERT INTO request_logs (node_used, request_type) VALUES (?, ?)', ['primary-db', 'WRITE'], (logErr) => {
            if (logErr) console.error('Primary log insert error:', logErr && logErr.message);
            res.status(201).json({ status: "Written" });
        });
    });
});

// --- History API (Powers the Dashboard Table) ---
app.get('/api/logs', (req, res) => {
    replicaPool.query('SELECT * FROM request_logs ORDER BY timestamp DESC LIMIT 10', (err, results) => {
        if (err) return res.json([]);
        res.json(results);
    });
});

app.listen(5000, () => console.log('Backend listening on port 5000'));