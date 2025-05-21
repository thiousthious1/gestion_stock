const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'localhost',          // ou IP du serveur MySQL
  user: 'root',               // ton utilisateur MySQL
  password: '',               // ton mot de passe MySQL
  database: 'stock_manager',  // le nom de ta base de données
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool; // pas besoin de .promise() ici
