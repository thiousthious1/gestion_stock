const db = require('../models/db');
const pdf = require('html-pdf-node'); // déjà utilisé ?
const ejs = require('ejs');
const fs = require('fs');
const path = require('path');

exports.list = async (req, res) => {
  try {
    const { status } = req.query;
    const statusFilter = status ? 'WHERE po.status = ?' : '';
    const params = status ? [status] : [];

    const [orders] = await db.query(`
      SELECT po.*, s.name AS supplier_name
      FROM purchase_orders po
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      ${statusFilter}
      ORDER BY po.id DESC
    `, params);

    res.render('purchase_orders/index', { orders, selectedStatus: status || '' });
  } catch (err) {
    console.error('Erreur affichage liste bons de commande :', err);
    res.status(500).send('Erreur serveur');
  }
};

exports.showCreateForm = async (req, res) => {
  const [suppliers] = await db.query('SELECT * FROM suppliers');
  const [products] = await db.query('SELECT * FROM products');
  res.render('purchase_orders/add', { suppliers, products });
};

exports.create = async (req, res) => {
  try {
    const { supplier_id, order_date, note, products } = req.body;

    const [result] = await db.query(
      `INSERT INTO purchase_orders (supplier_id, order_date, note) VALUES (?, ?, ?)`,
      [supplier_id, order_date, note]
    );
    const orderId = result.insertId;

    for (const item of products) {
      await db.query(
        `INSERT INTO purchase_order_details (purchase_order_id, product_id, quantity, unit_price, discount, tax)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId, item.product_id, item.quantity, item.unit_price, item.discount, item.tax]
      );
    }

    res.redirect('/purchase-orders'); // ou afficher un message de succès
  } catch (err) {
    console.error('Erreur création bon de commande :', err);
    res.status(500).send('Erreur serveur');
  }
};

exports.view = async (req, res) => {
  const orderId = req.params.id;

  try {
    const [[order]] = await db.query(`
      SELECT po.*, s.name AS supplier_name, s.phone, s.email
      FROM purchase_orders po
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      WHERE po.id = ?
    `, [orderId]);

    if (!order) return res.status(404).send('Bon de commande introuvable');

    const [details] = await db.query(`
      SELECT pod.*, p.nom AS product_name
      FROM purchase_order_details pod
      LEFT JOIN products p ON pod.product_id = p.id
      WHERE pod.purchase_order_id = ?
    `, [orderId]);

    res.render('purchase_orders/view', { order, details });

  } catch (err) {
    console.error('Erreur affichage bon de commande :', err);
    res.status(500).send('Erreur serveur');
  }
};

exports.print = async (req, res) => {
  const orderId = req.params.id;

  try {
    const [[order]] = await db.query(`
      SELECT po.*, s.name AS supplier_name, s.phone, s.email
      FROM purchase_orders po
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      WHERE po.id = ?
    `, [orderId]);

    if (!order) return res.status(404).send('Bon de commande introuvable');

    const [details] = await db.query(`
      SELECT pod.*, p.nom AS product_name
      FROM purchase_order_details pod
      LEFT JOIN products p ON pod.product_id = p.id
      WHERE pod.purchase_order_id = ?
    `, [orderId]);
    
    const [settingsRows] = await db.query("SELECT `key`, value FROM settings");
    const settings = Object.fromEntries(settingsRows.map(s => [s.key, s.value]));

    let logoBase64 = '';
        if (settings.logo) {
        const logoPath = path.resolve(__dirname, `../public/uploads/${settings.logo}`);
        if (fs.existsSync(logoPath)) {
            const logoBuffer = fs.readFileSync(logoPath);
            logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
        }
    }

    const html = await ejs.renderFile(
      path.join(__dirname, '../views/purchase_orders/print.ejs'),
      { order, details,logoBase64 }
    );

    const file = { content: html };
    const options = { format: 'A4', printBackground: true };

    const pdfBuffer = await pdf.generatePdf(file, options);

    res.setHeader('Content-Disposition', `attachment; filename=bon_commande_${orderId}.pdf`);
    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdfBuffer);

  } catch (err) {
    console.error('Erreur impression bon de commande :', err);
    res.status(500).send('Erreur serveur');
  }
};

exports.updateStatus = async (req, res) => {
  const orderId = req.params.id;
  const { status } = req.body;

  try {
    await db.query(`UPDATE purchase_orders SET status = ? WHERE id = ?`, [status, orderId]);
    res.redirect(`/purchase-orders/${orderId}`);
  } catch (err) {
    console.error('Erreur mise à jour statut :', err);
    res.status(500).send('Erreur serveur');
  }
};

exports.delete = async (req, res) => {
  const orderId = req.params.id;

  try {
    // Supprimer les lignes d'abord pour respecter les contraintes FK
    await db.query('DELETE FROM purchase_order_details WHERE purchase_order_id = ?', [orderId]);
    await db.query('DELETE FROM purchase_orders WHERE id = ?', [orderId]);

    res.redirect('/purchase-orders');
  } catch (err) {
    console.error('Erreur suppression bon de commande :', err);
    res.status(500).send('Erreur serveur');
  }
};

