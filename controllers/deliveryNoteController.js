const db = require('../models/db');
const moment = require('moment');
const path = require('path');
const fs = require('fs');
const ejs = require('ejs');
const pdf = require('html-pdf-node'); // si tu utilises html-pdf-node

exports.list = async (req, res) => {
  try {
    const selectedStatus = req.query.status || '';
    let query = `
      SELECT dn.*, s.name AS customer_name
      FROM delivery_notes dn
      LEFT JOIN sales sa ON dn.sale_id = sa.id
      LEFT JOIN customers s ON sa.customer_id = s.id
    `;

    const params = [];
    if (selectedStatus) {
      query += ' WHERE dn.status = ?';
      params.push(selectedStatus);
    }

    query += ' ORDER BY dn.id DESC';
    const [notes] = await db.query(query, params);

    res.render('delivery_notes/index', { notes, selectedStatus });
  } catch (err) {
    console.error('Erreur affichage bons de livraison :', err);
    res.status(500).send('Erreur serveur');
  }
};


exports.addForm = async (req, res) => {
  const saleId = req.params.saleId;
  try {
    const [[sale]] = await db.query(`
      SELECT sa.*, c.name AS customer_name
      FROM sales sa
      LEFT JOIN customers c ON sa.customer_id = c.id
      WHERE sa.id = ?
    `, [saleId]);

    const [details] = await db.query(`
      SELECT sd.*, p.nom AS product_name
      FROM sale_details sd
      LEFT JOIN products p ON sd.product_id = p.id
      WHERE sd.sale_id = ?
    `, [saleId]);

    res.render('delivery_notes/add', { sale, details });
  } catch (err) {
    console.error('Erreur affichage formulaire bon livraison :', err);
    res.status(500).send('Erreur serveur');
  }
};

exports.create = async (req, res) => {
  const { delivery_date, note, status } = req.body;
  const saleId = req.params.saleId;

  try {
    await db.query(`
      INSERT INTO delivery_notes (sale_id, delivery_date, status, note)
      VALUES (?, ?, ?, ?)
    `, [saleId, delivery_date, status, note]);

    res.redirect('/delivery-notes');
  } catch (err) {
    console.error('Erreur création bon de livraison :', err);
    res.status(500).send('Erreur serveur');
  }
};

exports.view = async (req, res) => {
  const id = req.params.id;
  try {
    const [[note]] = await db.query(`
      SELECT dn.*, s.name AS customer_name
      FROM delivery_notes dn
      LEFT JOIN sales sa ON dn.sale_id = sa.id
      LEFT JOIN customers s ON sa.customer_id = s.id
      WHERE dn.id = ?
    `, [id]);

    const [details] = await db.query(`
      SELECT sd.*, p.nom AS product_name
      FROM sale_details sd
      LEFT JOIN products p ON sd.product_id = p.id
      WHERE sd.sale_id = ?
    `, [note.sale_id]);

    res.render('delivery_notes/view', { note, details });
  } catch (err) {
    console.error('Erreur affichage bon livraison :', err);
    res.status(500).send('Erreur serveur');
  }
};

exports.print = async (req, res) => {
  const id = req.params.id;
  try {
    const [[note]] = await db.query(`
      SELECT dn.*, s.name AS customer_name
      FROM delivery_notes dn
      LEFT JOIN sales sa ON dn.sale_id = sa.id
      LEFT JOIN customers s ON sa.customer_id = s.id
      WHERE dn.id = ?
    `, [id]);

    const [details] = await db.query(`
      SELECT sd.*, p.nom AS product_name
      FROM sale_details sd
      LEFT JOIN products p ON sd.product_id = p.id
      WHERE sd.sale_id = ?
    `, [note.sale_id]);

    const [settingsRows] = await db.query(`SELECT \`key\`, value FROM settings`);
    const settings = Object.fromEntries(settingsRows.map(s => [s.key, s.value]));

    let logoBase64 = '';
    if (settings.logo) {
      const logoPath = path.resolve(__dirname, `../public/uploads/${settings.logo}`);
      if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
      }
    }

    const html = await ejs.renderFile(path.join(__dirname, '../views/delivery_notes/print.ejs'), {
      note,
      details,
      settings,
      logoBase64
    });

    const file = { content: html };
    const options = { format: 'A5', printBackground: true };
    const pdfBuffer = await pdf.generatePdf(file, options);

    res.setHeader('Content-Disposition', `attachment; filename=livraison-${note.id}.pdf`);
    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Erreur impression bon de livraison :', err);
    res.status(500).send('Erreur serveur');
  }
};

exports.delete = async (req, res) => {
  const id = req.params.id;
  try {
    await db.query(`DELETE FROM delivery_notes WHERE id = ?`, [id]);
    res.redirect('/delivery-notes');
  } catch (err) {
    console.error('Erreur suppression bon de livraison :', err);
    res.status(500).send('Erreur serveur');
  }
};

exports.editForm = async (req, res) => {
  const id = req.params.id;
  const [[note]] = await db.query('SELECT * FROM delivery_notes WHERE id = ?', [id]);
  res.render('delivery_notes/edit', { note });
};

exports.update = async (req, res) => {
  const id = req.params.id;
  const { delivery_date, status, note } = req.body;

  await db.query(
    'UPDATE delivery_notes SET delivery_date = ?, status = ?, note = ? WHERE id = ?',
    [delivery_date, status, note, id]
  );

  res.redirect('/delivery-notes');
};
