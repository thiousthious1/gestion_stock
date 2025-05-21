// ✅ invoiceController.js mis à jour
// Aligne les clés des settings avec la base de données
// Calcule correctement le sous-total ligne par ligne (remise %, tva %)

const path = require('path');
const fs = require('fs');
const ejs = require('ejs');
const pdf = require('html-pdf-node');
const db = require('../models/db');
const moment = require('moment');

exports.generateInvoice = async (req, res) => {
  const saleId = req.params.id;

  try {
    const [[sale]] = await db.query(
      `SELECT s.*, c.name AS customer_name, u.username AS seller_name
       FROM sales s
       LEFT JOIN customers c ON s.customer_id = c.id
       LEFT JOIN users u ON s.user_id = u.id
       WHERE s.id = ?`,
      [saleId]
    );

    if (!sale) return res.status(404).send('Vente introuvable');

    const [details] = await db.query(
      `SELECT sd.*, p.nom AS product_name
       FROM sale_details sd
       LEFT JOIN products p ON sd.product_id = p.id
       WHERE sd.sale_id = ?`,
      [saleId]
    );

    const [settingsRows] = await db.query("SELECT `key`, value FROM settings");
    const settings = Object.fromEntries(settingsRows.map(s => [s.key, s.value]));

    const showLogo = settings.show_logo_on_invoice === 'yes';
    const showFooter = !!settings.invoice_footer;
    const showSeller = true; // Affiche toujours le vendeur

    // Chargement du logo
    let logoBase64 = '';
    if (showLogo && settings.logo) {
      const logoPath = path.resolve(__dirname, `../public/uploads/${settings.logo}`);
      if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
      }
    }

    const saleDate = moment(sale.created_at).format('DD-MM-YYYY');

    // ✅ Sous-total avec remises et TVA ligne par ligne (en %)
    const subTotal = details.reduce((acc, d) => {
      const price = +d.unit_price || 0;
      const qty = +d.quantity || 0;
      const discount = +d.discount || 0;
      const tax = +d.tax || 0;
      const lineTotal = (price * qty) * (1 - discount / 100) * (1 + tax / 100);
      return acc + lineTotal;
    }, 0);

    const globalDiscount = +sale.global_discount || 0;
    const globalTax = +sale.global_tax || 0;
    const totalTTC = +sale.total_amount || 0;

    const qrData = `Facture N°${sale.id} | Client: ${sale.customer_name} | Montant: ${totalTTC} FCFA`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrData)}&size=100x100`;

    const html = await ejs.renderFile(
      path.join(__dirname, '../views/invoices/invoice.ejs'),
      {
        sale,
        details,
        settings,
        logoBase64,
        showLogo,
        showFooter,
        showSeller,
        saleDate,
        subTotal,
        globalDiscount,
        globalTax,
        totalTTC,
        qrUrl // ❗ obligatoire pour l'affichage du <%= qrUrl %> dans invoice.ejs
      }
    );

    const file = { content: html };
    const options = { format: 'A4', printBackground: true };

    const pdfBuffer = await pdf.generatePdf(file, options);

    res.setHeader('Content-Disposition', `attachment; filename=facture-${saleId}.pdf`);
    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdfBuffer);

  } catch (err) {
    console.error('Erreur génération facture :', err);
    res.status(500).send('Erreur serveur');
  }
};

exports.printInvoicePage = async (req, res) => {
  const saleId = req.params.id;

  try {
    const [[sale]] = await db.query(
      `SELECT s.*, c.name AS customer_name, u.username AS seller_name
       FROM sales s
       LEFT JOIN customers c ON s.customer_id = c.id
       LEFT JOIN users u ON s.user_id = u.id
       WHERE s.id = ?`,
      [saleId]
    );

    if (!sale) return res.status(404).send('Vente introuvable');

    const [details] = await db.query(
      `SELECT sd.*, p.nom AS product_name
       FROM sale_details sd
       LEFT JOIN products p ON sd.product_id = p.id
       WHERE sd.sale_id = ?`,
      [saleId]
    );

    const [settingsRows] = await db.query("SELECT `key`, value FROM settings");
    const settings = Object.fromEntries(settingsRows.map(s => [s.key, s.value]));

    const showLogo = settings.show_logo_on_invoice === 'yes';
    const showFooter = !!settings.invoice_footer;
    const showSeller = true;

    let logoBase64 = '';
    if (showLogo && settings.logo) {
      const logoPath = path.resolve(__dirname, `../public/uploads/${settings.logo}`);
      if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
      }
    }

    const saleDate = moment(sale.created_at).format('DD-MM-YYYY');

    const subTotal = details.reduce((acc, d) => {
      const price = +d.unit_price || 0;
      const qty = +d.quantity || 0;
      const discount = +d.discount || 0;
      const tax = +d.tax || 0;
      const lineTotal = (price * qty) * (1 - discount / 100) * (1 + tax / 100);
      return acc + lineTotal;
    }, 0);

    const globalDiscount = +sale.global_discount || 0;
    const globalTax = +sale.global_tax || 0;
    const totalTTC = +sale.total_amount || 0;

    const qrData = `Facture N°${sale.id} | Client: ${sale.customer_name} | Montant: ${totalTTC} FCFA`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrData)}&size=100x100`;


    // ✅ Ici on rend directement la vue EJS dans le navigateur
    res.render('invoices/invoice', {
      sale,
      details,
      settings,
      logoBase64,
      showLogo,
      showFooter,
      showSeller,
      saleDate,
      subTotal,
      globalDiscount,
      globalTax,
      totalTTC,
      qrUrl // 👈 ici
    });

  } catch (err) {
    console.error('Erreur impression facture :', err);
    res.status(500).send('Erreur serveur');
  }
};

exports.printTicket = async (req, res) => {
  const saleId = req.params.id;

  try {
    const [[sale]] = await db.query(
      `SELECT s.*, c.name AS customer_name, u.username AS seller_name
       FROM sales s
       LEFT JOIN customers c ON s.customer_id = c.id
       LEFT JOIN users u ON s.user_id = u.id
       WHERE s.id = ?`,
      [saleId]
    );

    if (!sale) return res.status(404).send('Vente introuvable');

    const [details] = await db.query(
      `SELECT sd.*, p.nom AS product_name
       FROM sale_details sd
       LEFT JOIN products p ON sd.product_id = p.id
       WHERE sd.sale_id = ?`,
      [saleId]
    );

    const [settingsRows] = await db.query("SELECT `key`, value FROM settings");
    const settings = Object.fromEntries(settingsRows.map(s => [s.key, s.value]));

    const saleDate = moment(sale.created_at).format('DD-MM-YYYY');
    const totalTTC = +sale.total_amount || 0;

    // ✅ Logo
    let logoBase64 = '';
    if (settings.logo) {
      const logoPath = path.resolve(__dirname, `../public/uploads/${settings.logo}`);
      if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
      }
    }

    // ✅ QR code
    const qrData = `Facture N°${sale.id} | Client: ${sale.customer_name} | Montant: ${totalTTC} FCFA`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrData)}&size=100x100`;

    // ✅ Rendu
    res.render('invoices/ticket', {
      sale,
      details,
      settings,
      saleDate,
      totalTTC,
      logoBase64,
      qrUrl // 🟢 nécessaire pour l'affichage du QR code
    });
    

  } catch (err) {
    console.error('Erreur ticket :', err);
    res.status(500).send('Erreur serveur');
  }
};



exports.generateTicketPDF = async (req, res) => {
  const saleId = req.params.id;

  try {
    const [[sale]] = await db.query(
      `SELECT s.*, c.name AS customer_name, u.username AS seller_name
       FROM sales s
       LEFT JOIN customers c ON s.customer_id = c.id
       LEFT JOIN users u ON s.user_id = u.id
       WHERE s.id = ?`,
      [saleId]
    );

    if (!sale) return res.status(404).send('Vente introuvable');

    const [details] = await db.query(
      `SELECT sd.*, p.nom AS product_name
       FROM sale_details sd
       LEFT JOIN products p ON sd.product_id = p.id
       WHERE sd.sale_id = ?`,
      [saleId]
    );

    const [settingsRows] = await db.query("SELECT `key`, value FROM settings");
    const settings = Object.fromEntries(settingsRows.map(s => [s.key, s.value]));

    const saleDate = moment(sale.created_at).format('DD-MM-YYYY');
    const totalTTC = +sale.total_amount || 0;

    // ✅ Logo
    let logoBase64 = '';
    if (settings.logo) {
      const logoPath = path.resolve(__dirname, `../public/uploads/${settings.logo}`);
      if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
      }
    }

    // ✅ QR Code
    const qrData = `Facture N°${sale.id} | Client: ${sale.customer_name} | Montant: ${totalTTC} FCFA`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrData)}&size=100x100`;

    const html = await ejs.renderFile(
      path.join(__dirname, '../views/invoices/ticket.ejs'),
      {
        sale,
        details,
        settings,
        saleDate,
        totalTTC,
        logoBase64,
        qrUrl // ✅ ajouté ici
      }
    );

    const file = { content: html };
    const options = {
      width: '80mm',
      height: '150mm',
      printBackground: true
    };

    const pdfBuffer = await pdf.generatePdf(file, options);

    res.setHeader('Content-Disposition', `attachment; filename=ticket-${saleId}.pdf`);
    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdfBuffer);

  } catch (err) {
    console.error('Erreur génération ticket PDF :', err);
    res.status(500).send('Erreur serveur');
  }
};




