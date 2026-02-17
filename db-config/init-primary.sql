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
CREATE TABLE IF NOT EXISTS request_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    node_used VARCHAR(255) NOT NULL,
    request_type VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Configure Replication User (MySQL 8 compatibility)
ALTER USER 'root'@'%' IDENTIFIED WITH mysql_native_password BY 'production_secure_password';
FLUSH PRIVILEGES;
