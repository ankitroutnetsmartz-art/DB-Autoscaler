const mysql = require('mysql2');
const dbConfig = {
    host: 'replica-db',
    user: 'root',
    password: 'production_secure_password',
    database: 'app_db'
};

const connection = mysql.createConnection(dbConfig);

connection.connect(err => {
    if (err) {
        console.error('Connection error:', err);
        process.exit(1);
    }
    console.log('Connected to replica-db');
    connection.query('SHOW TABLES', (err, results) => {
        if (err) {
            console.error('Query error:', err);
        } else {
            console.log('Tables:', results);
        }
        connection.end();
    });
});
