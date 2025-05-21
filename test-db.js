const db = require('./config/db');

db.query('SELECT 1 + 1 AS result')
  .then(([rows]) => {
    console.log('✅ Connexion réussie ! Résultat :', rows);
  })
  .catch((err) => {
    console.error('❌ Erreur de connexion :', err);
  });
