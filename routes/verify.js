const express = require('express');
const router = express.Router();
const db = require('../models/db');

router.get('/facture/:id', async (req, res) => {
  const saleId = req.params.id;

  try {
    const [sales] = await db.query(`
      SELECT s.*, c.name AS customer_name
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.id = ?
    `, [saleId]);

    if (sales.length === 0) {
      return res.status(404).send('Facture non trouvée.');
    }

    const sale = sales[0];

    const [details] = await db.query(`
      SELECT sd.*, p.nom AS product_name
      FROM sale_details sd
      LEFT JOIN products p ON sd.product_id = p.id
      WHERE sd.sale_id = ?
    `, [saleId]);

    res.render('invoices/verify', { sale, details });

  } catch (err) {
    console.error('Erreur vérification facture :', err);
    res.status(500).send('Erreur serveur');
  }
});

module.exports = router;
