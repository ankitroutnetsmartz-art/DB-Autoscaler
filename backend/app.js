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
app.post('/api/scale', async (req, res) => {
    const { replicas } = req.body;
    if (!replicas || replicas < 1 || replicas > 10) {
        return res.status(400).json({ error: "Invalid count (1-10)" });
    }

    try {
        // FIX: Target the 'replica-db' service for scaling, not the 'backend'.
        await execPromise(`docker compose up -d --scale replica-db=${replicas} --no-recreate`);
        res.json({ status: "Success", message: `Scaling to ${replicas} nodes` });
    } catch (error) {
        res.status(500).json({ error: "Scale failed", details: error.message });
    }
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
const fs = require('fs');

// Example Topology Data Generator
const generateTopology = (count) => {
    const nodes = [{ id: 'Primary', type: 'master', status: 'healthy' }];
    const links = [];

    for (let i = 1; i < count; i++) {
        const replicaId = `Replica-${i}`;
        nodes.push({ id: replicaId, type: 'slave', status: 'healthy' });
        links.push({ source: 'Primary', target: replicaId });
    }
    return { nodes, links };
};

app.get('/api/stats', async (req, res) => {
    try {
        // 1. Get Replica Count from your sync file
        let replicas = 0;
        if (fs.existsSync('/app/replica_count.txt')) {
            const countData = fs.readFileSync('/app/replica_count.txt', 'utf8');
            replicas = parseInt(countData.trim()) || 0;
        }

        // 2. Query for Stats with NULL protection (COALESCE)
        const [[{ total_logs }]] = await pool.query('SELECT COALESCE(COUNT(*), 0) as total_logs FROM request_logs');
        
        // 3. Query for TPS (Requests in the last 10 seconds)
        const [[{ tps_count }]] = await pool.query(
            'SELECT COALESCE(COUNT(*), 0) as tps_count FROM request_logs WHERE timestamp > NOW() - INTERVAL 10 SECOND'
        );

        // 4. Send clean JSON back to the UI
        res.json({
            active_replicas: replicas + 1,
            total_logs: total_logs + logBuffer.length,
            current_tps: (tps_count / 10).toFixed(1) // This removes "undefined%"
        });
    } catch (err) {
        console.error("Stats Query Failed:", err.message);
        res.json({ active_replicas: 1, total_logs: 0, current_tps: "0.0" });
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

const server = app.listen(5000, '0.0.0.0', () => {
    console.log('Optimized Backend Engine Online | Port 5000 | Batch Logging Active');
});

// --- GRACEFUL SHUTDOWN ---
const gracefulShutdown = (signal) => {
    console.log(`\nReceived ${signal}. Starting graceful shutdown...`);
    server.close(async () => {
        await flushLogs();
        console.log('All connections closed and logs flushed. Exiting.');
        process.exit(0);
    });
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));