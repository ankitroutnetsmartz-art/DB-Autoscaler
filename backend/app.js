const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const { exec } = require('child_process');
const util = require('util');

const app = express();
const execPromise = util.promisify(exec);
app.use(cors());
app.use(express.json());

// Optimization: Reduced connection limit to save RAM; 
// Added promise-based wrapper for cleaner async/await performance
const dbConfig = {
    host: process.env.DB_HOST || 'primary-db',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'production_secure_password',
    database: process.env.DB_NAME || 'app_db',
    waitForConnections: true,
    connectionLimit: 20, // Optimized: Lowered from 100 to prevent memory bloating
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
};

const pool = mysql.createPool(dbConfig).promise();
const replicaPool = mysql.createPool({ ...dbConfig, host: process.env.REPLICA_HOST || 'replica-db' }).promise();

// --- OPTIMIZATION 1: LOG BATCHING ---
// Instead of 100 writes/sec, we do 1 write every 5 seconds.
let logBuffer = [];
const FLUSH_INTERVAL = 5000; 

const flushLogs = async () => {
    if (logBuffer.length === 0) return;
    const batch = [...logBuffer];
    logBuffer = [];
    
    try {
        // Bulk insert syntax: INSERT INTO table (cols) VALUES (?,?,?), (?,?,?)...
        await pool.query(
            'INSERT INTO request_logs (endpoint, method, node_used) VALUES ?',
            [batch]
        );
    } catch (err) {
        console.error("Critical: Batch Log Flush Failed:", err.message);
    }
};
setInterval(flushLogs, FLUSH_INTERVAL);

// --- TELEMETRY MIDDLEWARE (BUFFERED) ---
app.use((req, res, next) => {
    const internalRoutes = ['/api/stats', '/api/logs', '/health', '/api/scale'];
    if (internalRoutes.includes(req.path)) return next();

    // Push to memory buffer instead of immediate DB write
    logBuffer.push([req.path, req.method, process.env.HOSTNAME || 'primary-node']);
    next();
});

// --- MANUAL SCALING ENDPOINT ---
app.post('/api/scale', (req, res) => {
    const { replicas } = req.body;
    if (!replicas || replicas < 1 || replicas > 10) {
        return res.status(400).json({ error: "Invalid count (1-10)" });
    }

    // FIX: Target the 'replica-db' service for scaling, not the 'backend'.
    exec(`docker compose up -d --scale replica-db=${replicas} --no-recreate`, (error) => {
        if (error) return res.status(500).json({ error: "Scale failed" });
        res.json({ status: "Success", message: `Scaling to ${replicas} nodes` });
    });
});

// --- API ENDPOINTS ---

app.get('/api/data', async (req, res) => {
    try {
        const [results] = await replicaPool.query('SELECT * FROM site_entries ORDER BY id DESC LIMIT 1');
        res.json({ source: 'REPLICA', data: results });
    } catch (err) {
        try {
            const [pResults] = await pool.query('SELECT * FROM site_entries ORDER BY id DESC LIMIT 1');
            res.json({ source: 'PRIMARY_FALLBACK', data: pResults });
        } catch (pErr) {
            res.status(500).json({ error: 'DB Unavailable' });
        }
    }
});

app.post('/api/data', async (req, res) => {
    try {
        await pool.execute(
            'INSERT INTO site_entries (title, description) VALUES (?, ?)',
            [req.body.message || "Locust Hit", "Automated Entry"]
        );
        res.status(201).json({ status: "Persisted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.get('/api/stats', async (req, res) => {
    // We bypass the docker CLI and talk to the Unix Socket directly via curl
    const countCmd = 'curl --unix-socket /var/run/docker.sock http://localhost/containers/json?filters=%7B%22name%22%3A%5B%22replica-db%22%5D%7D';

    try {
        const [countRes, logsRes] = await Promise.all([
            execPromise(countCmd),
            pool.query('SELECT COUNT(*) as count FROM request_logs').catch(() => [[{count: 0}]])
        ]);

        // Parse the JSON array returned by Docker Engine API
        const containers = JSON.parse(countRes.stdout);
        const replicas = containers.filter(c => c.State === 'running').length;
        const totalNodes = replicas + 1; // Primary + Replicas

        res.json({
            active_replicas: totalNodes,
            total_logs: logsRes[0][0].count,
            cluster_load: 0, // Simplified for immediate fix
            distribution: containers.map(c => ({
                node: c.Names[0].split('-').pop(),
                cpu: 0
            }))
        });
    } catch (err) {
        console.error("DOCKER API ERROR:", err.message);
        res.json({ active_replicas: 1, error: "API_TIMEOUT" });
    }
});

app.get('/api/logs', async (req, res) => {
    try {
        // STRICT LIMIT 10 - No matter what
        const [results] = await pool.query(
            'SELECT id, endpoint, method, timestamp, node_used FROM request_logs ORDER BY id DESC LIMIT 10'
        );
        res.json(results);
    } catch (err) {
        res.json([]);
    }
});

app.get('/health', (req, res) => res.status(200).send('OK'));

app.listen(5000, '0.0.0.0', () => {
    console.log('Optimized Backend Engine Online | Port 5000 | Batch Logging Active');
});