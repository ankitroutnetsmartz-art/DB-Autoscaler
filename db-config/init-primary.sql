-- Create Database
CREATE DATABASE IF NOT EXISTS app_db;
USE app_db;

-- Create Schema expected by app.js
CREATE TABLE IF NOT EXISTS site_entries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed Data
INSERT INTO site_entries (title, description) VALUES ('System Initialized', 'Cluster is online.');

-- Create request logs table for auditing
-- FIX: Columns renamed/added to match app.js INSERT (endpoint, method, node_used)
CREATE TABLE IF NOT EXISTS request_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    node_used VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Configure root to support mysql_native_password for replication
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'production_secure_password';
GRANT ALL PRIVILEGES ON *.* TO 'root'@'localhost' WITH GRANT OPTION;
FLUSH PRIVILEGES;
