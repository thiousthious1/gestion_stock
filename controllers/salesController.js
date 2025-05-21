const db = require('../models/db');
const { generateInvoiceFile } = require('./invoiceController');
const moment = require('moment');  // Assure-toi que moment est installé
const ExcelJS = require('exceljs');  // npm install exceljs
const PDFDocument = require('pdfkit');
const puppeteer = require('puppeteer');

// Chargement des variables d'environnement (.env)
require('dotenv').config();

// Afficher le formulaire d'ajout de vente
exports.showAddSaleForm = async (req, res) => {
  try {
    const [products] = await db.query('SELECT * FROM products');
    const [categories] = await db.query('SELECT * FROM categories');
    const [customers] = await db.query('SELECT * FROM customers');
    const [settingsRows] = await db.query(`
      SELECT \`key\`, \`value\` FROM settings
      WHERE \`key\` IN ('enable_stock_threshold', 'stock_threshold_value')
    `);

    const settings = {};
    settingsRows.forEach(row => settings[row.key] = row.value);

    res.render('sales/add', {
      products,
      categories,
      customers,
      settings, // ← important
      currentPage: 'sales-add',
      successMessage: res.locals.successMessage || '',
      errorMessage: res.locals.errorMessage || ''
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors du chargement du formulaire.');
  }
};


// ✅ Enregistrer une vente
exports.addSale = async (req, res) => {
  const { customer_id, items = [], global_discount = 0, global_tax = 0 } = req.body;
  //customer_id = customer_id || 1; // ✅ 1 = ID du client "Autre"
  const discountPercent = parseFloat(global_discount) || 0;
  const taxPercent = parseFloat(global_tax) || 0;

  if (!customer_id || !Array.isArray(items) || items.length === 0) {
    req.session.errorMessage = '❌ Données invalides.';
    return res.redirect('/sales/add');
  }

  try {

    // ✅ Vérification du stock
    for (const item of items) {
      const [productRow] = await db.query('SELECT quantite FROM products WHERE id = ?', [item.product_id]);
      if (productRow.length === 0) {
        req.session.errorMessage = `❌ Produit introuvable (ID: ${item.product_id})`;
        return res.redirect('/sales/add');
      }

      const currentStock = parseFloat(productRow[0].quantite);
      const qtyRequested = parseFloat(item.quantity) || 0;

      if (qtyRequested > currentStock) {
          return res.status(400).json({
            success: false,
            message: `❌ Stock insuffisant pour le produit ID ${item.product_id}. Stock disponible : ${currentStock}`
          });
        }

    }

    let subtotalAmount = 0;

    for (const item of items) {
      const quantity = parseFloat(item.quantity) || 0;
      const unit_price = parseFloat(item.unit_price) || 0;
      const discount = parseFloat(item.discount) || 0;
      const tax = parseFloat(item.tax) || 0;

      let lineTotal = unit_price * quantity;
      lineTotal -= (lineTotal * discount / 100);  // ✅ Remise en pourcentage
      lineTotal += (lineTotal * tax / 100);        // ✅ Taxe en pourcentage

      subtotalAmount += lineTotal;
    }

    let discountAmount = (subtotalAmount * (parseFloat(global_discount) || 0)) / 100;
    let subtotalAfterDiscount = subtotalAmount - discountAmount;
    let taxAmount = (subtotalAfterDiscount * (parseFloat(global_tax) || 0)) / 100;
    let finalTotal = subtotalAfterDiscount + taxAmount;

    const totalAmount = finalTotal;
    const paidAmount = 0;
    const dueAmount = totalAmount;


    // 🔒 Vérification limite de caisse
      const [cashSettingsRows] = await db.query(`
        SELECT \`key\`, \`value\` FROM settings 
        WHERE \`key\` IN ('enable_cash_limit', 'cash_limit_amount')
      `);
      const cashSettings = {};
      cashSettingsRows.forEach(row => cashSettings[row.key] = row.value);

      if (cashSettings.enable_cash_limit === 'yes') {
        const cashLimit = parseFloat(cashSettings.cash_limit_amount || '0');

        // Calcul du montant actuel en caisse
        const [cashRow] = await db.query(`
          SELECT 
            (SELECT COALESCE(SUM(paid_amount), 0) FROM sales) -
            (SELECT COALESCE(SUM(total_amount), 0) FROM returns) -
            (SELECT COALESCE(SUM(amount), 0) FROM expenses) AS total_caisse
        `);
        const caisseActuelle = parseFloat(cashRow[0].total_caisse || 0);

        // Simulation après cette vente
        const caisseApresVente = caisseActuelle + finalTotal;

        console.log('💡 Limite caisse:', {
          caisseActuelle,
          finalTotal,
          caisseApresVente,
          cashLimit
        });


        if (caisseApresVente > cashLimit) {
          return res.status(400).json({
            success: false,
            message: `❌ Limite de caisse dépassée. Caisse : ${caisseActuelle.toLocaleString()} FCFA + Vente : ${finalTotal.toLocaleString()} FCFA > Limite : ${cashLimit.toLocaleString()} FCFA.`
          });
        }

      }


    const userId = req.session.user ? req.session.user.id : null; // ou req.user.id selon ton auth

      // Charger les paramètres de stock
      const [params] = await db.query("SELECT `key`, `value` FROM settings WHERE `key` IN ('enable_stock_threshold', 'stock_threshold_value')");
      const settings = {};
      params.forEach(row => settings[row.key] = row.value);

      // Si seuil activé, faire la vérification
      if (settings.enable_stock_threshold === 'yes') {
        const seuil = parseInt(settings.stock_threshold_value || '0', 10);

        for (const item of items) {  // ✅ CORRECT : utiliser `items` qui est déjà extrait
          const [rows] = await db.query("SELECT quantite, nom FROM products WHERE id = ?", [item.product_id]);
          const currentStock = parseInt(rows[0].quantite || '0', 10);
          const qtyRequested = parseInt(item.quantity || '0', 10);

          if (currentStock < seuil || currentStock < qtyRequested) {
            req.session.errorMessage = `❌ Stock insuffisant pour le produit ${rows[0].nom}. Seuil requis : ${seuil}`;
            return res.redirect('/sales/add');
          }
        }
      }



    const [saleResult] = await db.query(
      `INSERT INTO sales (customer_id, total_amount, paid_amount, due_amount, global_discount, global_tax, status, payment_status, user_id)
       VALUES (?, ?, ?, ?, ?, ?, 'Delivered', 'Unpaid', ?)`,
      [customer_id, totalAmount, paidAmount, dueAmount, global_discount, global_tax, userId]
    );

    const saleId = saleResult.insertId;

    for (const item of items) {
      await db.query(
        `INSERT INTO sale_details (sale_id, product_id, quantity, unit_price, discount, tax)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          saleId,
          item.product_id,
          parseFloat(item.quantity) || 0,
          parseFloat(item.unit_price) || 0,
          parseFloat(item.discount) || 0,
          parseFloat(item.tax) || 0
        ]
      );

      await db.query(
        `UPDATE products SET quantite = quantite - ? WHERE id = ?`,
        [parseFloat(item.quantity) || 0, item.product_id]
      );
    }

    req.session.successMessage = '✅ Vente enregistrée avec succès.';
    res.redirect('/sales/history'); // ✅ Redirige vers l'historique après succès

  } catch (err) {
    console.error(err);
    req.session.errorMessage = '❌ Une erreur est survenue lors de l\'enregistrement.';
    res.redirect('/sales/add'); // ❌ En cas d'erreur, retour au formulaire d'ajout
  }
};

// Historique des ventes
exports.getSalesHistory = async (req, res) => {
  const filter = req.query.filter || 'all';

  let whereClause = '';
  if (filter === 'paid') {
    whereClause = "WHERE s.payment_status = 'Paid'";
  } else if (filter === 'unpaid') {
    whereClause = "WHERE s.payment_status = 'Unpaid'";
  } else if (filter === 'partial') {
    whereClause = "WHERE s.payment_status = 'Partially Paid'";
  }

  try {
    const userId = req.session.user?.id; // ✅ Utilisateur connecté

    // ✅ Clause supplémentaire pour limiter aux ventes de l'utilisateur
    const userFilter = userId ? `${whereClause ? whereClause + ' AND' : 'WHERE'} s.user_id = ?` : whereClause;
    
    // ✅ Récupérer ventes avec montant retourné (pour affichage uniquement)
    const [sales] = await db.query(`
      SELECT 
        s.id,
        s.created_at,
        c.name AS customer_name,
        s.total_amount,
        s.paid_amount,
        s.due_amount,
        s.global_discount,
        s.global_tax,
        s.status,
        s.payment_status,
        COUNT(r.id) > 0 AS has_return,
        COALESCE(SUM(r.total_amount), 0) AS total_returned,
        (SELECT id FROM delivery_notes WHERE sale_id = s.id LIMIT 1) AS delivery_note_id
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN returns r ON s.id = r.sale_id
      ${userFilter}
      GROUP BY s.id
      ORDER BY s.id DESC
    `, userId ? [userId] : []);    

    // ✅ Produits vendus
    const [saleDetails] = await db.query(`
      SELECT 
        sd.sale_id,
        p.nom AS product_name,
        sd.quantity,
        sd.unit_price,
        sd.discount,
        sd.tax
      FROM sale_details sd
      LEFT JOIN products p ON sd.product_id = p.id
    `);

    // ✅ Produits retournés
    const [returnsDetails] = await db.query(`
      SELECT 
        r.sale_id, 
        rd.product_id,
        rd.quantity,
        rd.unit_price,
        rd.discount,
        rd.tax,
        p.nom AS product_name
      FROM returns r
      JOIN returns_details rd ON r.id = rd.return_id
      JOIN products p ON p.id = rd.product_id
    `);

    // ✅ Fusionner toutes les données
    const salesWithDetails = sales.map(sale => {
      const details = saleDetails.filter(d => d.sale_id === sale.id);
      const returns = returnsDetails.filter(r => r.sale_id === sale.id);
      return {
        ...sale,
        details,
        returns,
        // Pas de modification de total_amount ni due_amount ici ❗
        // On laisse les valeurs exactes venant de la base
      };
    });

    res.render('sales/history', {
      errorMessage: req.session.errorMessage || null,
      successMessage: req.query.successMessage || req.session.successMessage,
      sales: salesWithDetails,
      filter
    });

    delete req.session.successMessage;
    delete req.session.errorMessage;

  } catch (error) {
    console.error(error);
    res.status(500).send('Erreur lors de la récupération des ventes.');
  }
};


exports.getSaleDetails = async (req, res) => {
  const saleId = req.params.id;

  try {
      // 1️⃣ Infos générales
      const [salesRows] = await db.query(`
          SELECT s.*, c.name AS customer_name
          FROM sales s
          LEFT JOIN customers c ON s.customer_id = c.id
          WHERE s.id = ?
      `, [saleId]);

      if (salesRows.length === 0) {
          return res.status(404).send('Vente non trouvée.');
      }

      const sale = salesRows[0];

      // 2️⃣ Détails des produits
      const [detailsRows] = await db.query(`
          SELECT sd.*, p.nom AS product_name 
          FROM sale_details sd
          LEFT JOIN products p ON sd.product_id = p.id
          WHERE sd.sale_id = ?
      `, [saleId]);

      // 3️⃣ Paiements
      const [paymentsRows] = await db.query(`
          SELECT * FROM payments WHERE sale_id = ?
      `, [saleId]);

      // 4️⃣ Retours
      const [returnsRows] = await db.query(`
          SELECT * FROM returns WHERE sale_id = ?
      `, [saleId]);

      res.render('sales/details', {
          sale,
          details: detailsRows,
          payments: paymentsRows,
          returns: returnsRows
      });

  } catch (error) {
      console.error('Erreur récupération détails vente :', error);
      res.status(500).send('Erreur serveur lors de la récupération de la vente.');
  }
};


exports.showEditSaleForm = async (req, res) => {
  const saleId = req.params.id;

  try {
    // Vérifier si la vente existe
          const [salesRows] = await db.query(`
              SELECT s.*, c.name AS customer_name
              FROM sales s
              LEFT JOIN customers c ON s.customer_id = c.id
              WHERE s.id = ?
          `, [saleId]);
    
          if (salesRows.length === 0) {
              return res.status(404).send('Vente non trouvée.');
          }
    
          const sale = salesRows[0];
    
          // ❗ Vérifier s'il y a déjà des retours
          const [returns] = await db.query(`SELECT * FROM returns WHERE sale_id = ?`, [saleId]);
          if (returns.length > 0) {
            req.session.errorMessage = '❌ Impossible de modifier : des retours existent pour cette vente.';
            return res.redirect('/sales/history?error=retour');
            
          }
    
          const [detailsRows] = await db.query(`
              SELECT sd.*, p.nom AS product_name 
              FROM sale_details sd
              LEFT JOIN products p ON sd.product_id = p.id
              WHERE sd.sale_id = ?
          `, [saleId]);

    const [products] = await db.query(`SELECT * FROM products`);
    const [customers] = await db.query(`SELECT * FROM customers`);

    // ⚠️ Ajout : chargement des réglages de seuil
    const [settingsRows] = await db.query(`
      SELECT \`key\`, \`value\` FROM settings
      WHERE \`key\` IN ('enable_stock_threshold', 'stock_threshold_value')
    `);
    const settings = {};
    settingsRows.forEach(row => settings[row.key] = row.value);

    res.render('sales/edit', {
      sale,
      details: detailsRows,
      products,
      customers,
      settings, // ← important !
      errorMessage: res.locals.errorMessage
    });
  } catch (err) {
    console.error('Erreur chargement formulaire édition vente :', err);
    res.status(500).send('Erreur serveur.');
  }
};



exports.updateSale = async (req, res) => {
  const saleId = req.params.id;
  const { customer_id, items = [], global_discount = 0, global_tax = 0 } = req.body;
  const discountPercent = parseFloat(global_discount) || 0;
  const taxPercent = parseFloat(global_tax) || 0;

  if (!customer_id || !Array.isArray(items) || items.length === 0) {
      req.session.errorMessage = '❌ Données invalides.';
      return res.redirect(`/sales/${saleId}/edit`);
  }

  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
      // 1️⃣ Vérifier qu'il n'y a toujours pas de retours
      const [returns] = await connection.query(`SELECT * FROM returns WHERE sale_id = ?`, [saleId]);
      if (returns.length > 0) {
          req.session.errorMessage = '❌ Impossible de modifier : des retours existent pour cette vente.';
          await connection.rollback();
          connection.release();
          return res.redirect('/sales/history');
      }

      // 2️⃣ Remettre le stock pour les anciens produits
      const [oldDetails] = await connection.query(`SELECT * FROM sale_details WHERE sale_id = ?`, [saleId]);

      for (const item of oldDetails) {
          await connection.query(`
              UPDATE products SET quantite = quantite + ? WHERE id = ?
          `, [item.quantity, item.product_id]);
      }

      // 3️⃣ Vérifier stock et seuil minimum
      const [settingsRows] = await connection.query(`
        SELECT \`key\`, \`value\` FROM settings
        WHERE \`key\` IN ('enable_stock_threshold', 'stock_threshold_value')
      `);
      const settings = {};
      settingsRows.forEach(row => settings[row.key] = row.value);

      const seuilActif = settings.enable_stock_threshold === 'yes';
      const seuil = parseInt(settings.stock_threshold_value || '0', 10);

      for (const item of items) {
        const [productRow] = await connection.query(`SELECT quantite, nom FROM products WHERE id = ?`, [item.product_id]);

        if (productRow.length === 0) {
          req.session.errorMessage = `❌ Produit introuvable (ID: ${item.product_id})`;
          await connection.rollback();
          connection.release();
          return res.redirect(`/sales/${saleId}/edit`);
        }

        const currentStock = parseFloat(productRow[0].quantite);
        const qtyRequested = parseFloat(item.quantity) || 0;

        // Vérification stricte du stock
        if (qtyRequested > currentStock) {
          req.session.errorMessage = `❌ Stock insuffisant pour le produit ${productRow[0].nom}. Stock disponible : ${currentStock}`;
          await connection.rollback();
          connection.release();
          return res.redirect(`/sales/${saleId}/edit`);
        }

        // Vérification du seuil activé
        if (seuilActif && currentStock <= seuil) {
          req.session.errorMessage = `❌ Le produit ${productRow[0].nom} est en dessous du seuil de stock (${seuil}). Vente refusée.`;
          await connection.rollback();
          connection.release();
          return res.redirect(`/sales/${saleId}/edit`);
        }
      }


      // 4️⃣ Supprimer les anciens détails (seulement maintenant)
      await connection.query(`DELETE FROM sale_details WHERE sale_id = ?`, [saleId]);

      // 5️⃣ Calcul du nouveau total
      let subtotalAmount = 0;

      for (const item of items) {
          const quantity = parseFloat(item.quantity) || 0;
          const unit_price = parseFloat(item.unit_price) || 0;
          const discount = parseFloat(item.discount) || 0;
          const tax = parseFloat(item.tax) || 0;

          let lineTotal = unit_price * quantity;
          lineTotal -= (lineTotal * discount / 100);
          lineTotal += (lineTotal * tax / 100);

          subtotalAmount += lineTotal;
      }

      const discountAmount = (subtotalAmount * discountPercent) / 100;
      const subtotalAfterDiscount = subtotalAmount - discountAmount;
      const taxAmount = (subtotalAfterDiscount * taxPercent) / 100;
      const finalTotal = subtotalAfterDiscount + taxAmount;

      // 6️⃣ Mettre à jour la vente
      const [oldSale] = await connection.query(`SELECT paid_amount FROM sales WHERE id = ?`, [saleId]);
      const paidAmount = oldSale[0].paid_amount || 0;
      const dueAmount = Math.max(finalTotal - paidAmount, 0);
      const payment_status = dueAmount === 0 ? 'Paid' : (paidAmount > 0 ? 'Partially Paid' : 'Unpaid');

      console.log('--- Mise à jour vente ---', {
          customer_id, finalTotal, dueAmount, paidAmount,
          discountPercent, taxPercent, payment_status, saleId
      });

      await connection.query(`
          UPDATE sales 
          SET customer_id = ?, total_amount = ?, due_amount = ?, paid_amount = ?, 
              global_discount = ?, global_tax = ?, payment_status = ?
          WHERE id = ?
      `, [customer_id, finalTotal, dueAmount, paidAmount, discountPercent, taxPercent, payment_status, saleId]);

      // 7️⃣ Insérer les nouveaux détails & déduire le stock
      for (const item of items) {
          await connection.query(`
              INSERT INTO sale_details (sale_id, product_id, quantity, unit_price, discount, tax)
              VALUES (?, ?, ?, ?, ?, ?)
          `, [
              saleId,
              item.product_id,
              parseFloat(item.quantity) || 0,
              parseFloat(item.unit_price) || 0,
              parseFloat(item.discount) || 0,
              parseFloat(item.tax) || 0
          ]);

          await connection.query(`
              UPDATE products SET quantite = quantite - ? WHERE id = ?
          `, [parseFloat(item.quantity) || 0, item.product_id]);
      }

      await connection.commit();
      connection.release();

      req.session.successMessage = '✅ Vente modifiée avec succès.';
      res.redirect('/sales/history');

  } catch (err) {
      await connection.rollback();
      connection.release();
      console.error('Erreur lors de la mise à jour de la vente :', err);
      req.session.errorMessage = '❌ Une erreur est survenue.';
      res.redirect(`/sales/${saleId}/edit`);
  }
};

exports.markAsPaid = async (req, res) => {
  const saleId = req.params.id;

  try {
    // 1. Récupérer le montant total à payer
    const [saleRows] = await db.query(`SELECT total_amount FROM sales WHERE id = ?`, [saleId]);
    if (saleRows.length === 0) {
      return res.status(404).send('Vente non trouvée.');
    }

    const totalAmount = saleRows[0].total_amount;

    // 2. Mettre à jour la vente comme "payée"
    await db.query(
      `UPDATE sales 
       SET payment_status = 'Paid', paid_amount = ?, due_amount = 0 
       WHERE id = ?`,
      [totalAmount, saleId]
    );

    // 3. Enregistrer un paiement réel dans la table `payments`
    await db.query(
      `INSERT INTO payments (sale_id, amount_paid) 
       VALUES (?, ?)`,
      [saleId, totalAmount]
    );
    await generateInvoiceFile(saleId);

    res.redirect('/sales/history?successMessage=Vente marquée comme payée');

  } catch (err) {
    console.error('Erreur lors de la confirmation de paiement :', err);
    res.status(500).send('Erreur serveur');
  }
};

exports.reportAdvanced = (req, res) => {
  res.render('sales/report_advanced', {
      page: 'report-sales-advanced',
      pageGroup: 'reports',
      results: null,
      startDate: null,
      endDate: null,
      totauxParClient: [],
      totauxParProduit: [],   // ✅ Ajouté pour éviter l'erreur si pas encore de recherche
      totauxParCategorie: [],
      totauxGlobaux: { total_ht: 0, total_tva: 0, total_ttc: 0 }  // ✅ Pour éviter les erreurs si page vide
  });
};

exports.reportAdvancedResult = async (req, res) => {
  const { startDate, endDate } = req.body;

  try {
      // Requête principale : ventes détaillées
      const [results] = await db.query(`
          SELECT s.id, s.created_at AS date_vente, 
                 c.name AS client_name, 
                 s.total_amount, 
                 s.payment_status
          FROM sales s
          LEFT JOIN customers c ON s.customer_id = c.id
          WHERE DATE(s.created_at) BETWEEN ? AND ?
          ORDER BY s.created_at ASC
      `, [startDate, endDate]);

      // ✅ Nouvelle requête : totaux par client
      const [totauxParClient] = await db.query(`
          SELECT 
              c.name AS client_name, 
              SUM(s.total_amount) AS total_ventes
          FROM sales s
          LEFT JOIN customers c ON s.customer_id = c.id
          WHERE DATE(s.created_at) BETWEEN ? AND ?
          GROUP BY c.name
          ORDER BY total_ventes DESC
      `, [startDate, endDate]);

      // ✅ Totaux par produit
        const [totauxParProduit] = await db.query(`
          SELECT 
              p.nom AS product_name,
              SUM(sd.quantity) AS total_quantite,
              SUM(sd.quantity * sd.unit_price) AS total_ventes
          FROM sale_details sd
          LEFT JOIN products p ON sd.product_id = p.id
          LEFT JOIN sales s ON sd.sale_id = s.id
          WHERE DATE(s.created_at) BETWEEN ? AND ?
          GROUP BY p.nom
          ORDER BY total_ventes DESC
        `, [startDate, endDate]);

        // ✅ Totaux par catégorie de produit
        const [totauxParCategorie] = await db.query(`
          SELECT 
              cat.nom AS categorie_name,
              SUM(sd.quantity * sd.unit_price) AS total_ventes
          FROM sale_details sd
          LEFT JOIN products p ON sd.product_id = p.id
          LEFT JOIN categories cat ON p.categorie_id = cat.id
          LEFT JOIN sales s ON sd.sale_id = s.id
          WHERE DATE(s.created_at) BETWEEN ? AND ?
          GROUP BY cat.nom
          ORDER BY total_ventes DESC
        `, [startDate, endDate]);


        // ✅ Totaux globaux HT / TVA / TTC
        const [totauxGlobaux] = await db.query(`
          SELECT 
              COALESCE(SUM(
                  sd.quantity * sd.unit_price - 
                  (sd.quantity * sd.unit_price * sd.discount / 100)
              ), 0) AS total_ht,

              COALESCE(SUM(
                  (sd.quantity * sd.unit_price - 
                  (sd.quantity * sd.unit_price * sd.discount / 100)) * (sd.tax / 100)
              ), 0) AS total_tva,

              COALESCE(SUM(
                  (sd.quantity * sd.unit_price - 
                  (sd.quantity * sd.unit_price * sd.discount / 100)) * (1 + sd.tax / 100)
              ), 0) AS total_ttc

          FROM sale_details sd
          LEFT JOIN sales s ON sd.sale_id = s.id
          WHERE DATE(s.created_at) BETWEEN ? AND ?
        `, [startDate, endDate]);


        res.render('sales/report_advanced', {
          pageGroup: 'reports',
          page: 'report-sales',
          results,
          startDate,
          endDate,
          totauxParClient,
          totauxParProduit,   // ✅ On envoie aussi les totaux par produit à la vue
          totauxParCategorie,
          totauxGlobaux: totauxGlobaux[0]
      });
      

  } catch (err) {
      console.error(err);
      res.status(500).send("Erreur lors de la récupération des données du rapport.");
  }
};

// ✅ Version imprimable du rapport avancé
exports.getAdvancedSalesReportPrint = async (req, res) => {
  const { startDate, endDate } = req.query;

  try {
      // Ventes détaillées
      const [results] = await db.query(`
          SELECT s.id AS sale_id, s.created_at AS date_vente, 
                 c.name AS client_name, 
                 s.total_amount, 
                 s.payment_status
          FROM sales s
          LEFT JOIN customers c ON s.customer_id = c.id
          WHERE DATE(s.created_at) BETWEEN ? AND ?
          ORDER BY s.created_at ASC
      `, [startDate, endDate]);

      // Totaux par client
      const [totauxParClient] = await db.query(`
          SELECT 
              c.name AS client_name, 
              SUM(s.total_amount) AS total_ventes
          FROM sales s
          LEFT JOIN customers c ON s.customer_id = c.id
          WHERE DATE(s.created_at) BETWEEN ? AND ?
          GROUP BY c.name
          ORDER BY total_ventes DESC
      `, [startDate, endDate]);

      // Totaux par produit
      const [totauxParProduit] = await db.query(`
          SELECT 
              p.nom AS product_name,
              SUM(sd.quantity) AS total_quantite,
              SUM(sd.quantity * sd.unit_price) AS total_ventes
          FROM sale_details sd
          LEFT JOIN products p ON sd.product_id = p.id
          LEFT JOIN sales s ON sd.sale_id = s.id
          WHERE DATE(s.created_at) BETWEEN ? AND ?
          GROUP BY p.nom
          ORDER BY total_ventes DESC
      `, [startDate, endDate]);

      // Totaux par catégorie
      const [totauxParCategorie] = await db.query(`
          SELECT 
              cat.nom AS categorie_name,
              SUM(sd.quantity * sd.unit_price) AS total_ventes
          FROM sale_details sd
          LEFT JOIN products p ON sd.product_id = p.id
          LEFT JOIN categories cat ON p.categorie_id = cat.id
          LEFT JOIN sales s ON sd.sale_id = s.id
          WHERE DATE(s.created_at) BETWEEN ? AND ?
          GROUP BY cat.nom
          ORDER BY total_ventes DESC
      `, [startDate, endDate]);

      // Totaux globaux HT/TVA/TTC
      const [totauxGlobaux] = await db.query(`
          SELECT 
              COALESCE(SUM(
                  sd.quantity * sd.unit_price - 
                  (sd.quantity * sd.unit_price * sd.discount / 100)
              ), 0) AS total_ht,

              COALESCE(SUM(
                  (sd.quantity * sd.unit_price - 
                  (sd.quantity * sd.unit_price * sd.discount / 100)) * (sd.tax / 100)
              ), 0) AS total_tva,

              COALESCE(SUM(
                  (sd.quantity * sd.unit_price - 
                  (sd.quantity * sd.unit_price * sd.discount / 100)) * (1 + sd.tax / 100)
              ), 0) AS total_ttc

          FROM sale_details sd
          LEFT JOIN sales s ON sd.sale_id = s.id
          WHERE DATE(s.created_at) BETWEEN ? AND ?
      `, [startDate, endDate]);

      res.render('sales/report_advanced_print', {
          results,
          startDate,
          endDate,
          totauxParClient,
          totauxParProduit,
          totauxParCategorie,
          totauxGlobaux: totauxGlobaux[0]
      });

  } catch (err) {
      console.error(err);
      res.status(500).send('Erreur lors de la génération du rapport imprimable.');
  }
};

exports.reportAdvancedQuick = (req, res) => {
    const period = req.query.period;
    let startDate, endDate;

    const today = moment().format('YYYY-MM-DD');

    switch (period) {
        case 'today':
            startDate = today;
            endDate = today;
            break;
        case 'yesterday':
            startDate = moment().subtract(1, 'days').format('YYYY-MM-DD');
            endDate = startDate;
            break;
        case 'last7days':
            startDate = moment().subtract(6, 'days').format('YYYY-MM-DD');
            endDate = today;
            break;
        case 'thismonth':
            startDate = moment().startOf('month').format('YYYY-MM-DD');
            endDate = today;
            break;
        case 'thisyear':
            startDate = moment().startOf('year').format('YYYY-MM-DD');
            endDate = today;
            break;
        default:
            return res.redirect('/sales/report/advanced');
    }

    // On redirige vers le formulaire avec les dates remplies
    res.render('sales/report_advanced', {
        pageGroup: 'reports',
        page: 'report-sales',
        results: null,
        startDate,
        endDate,
        totauxParClient: [],
        totauxParProduit: [],
        totauxParCategorie: [],
        totauxGlobaux: { total_ht: 0, total_tva: 0, total_ttc: 0 }
    });
};

exports.reportAdvancedExportExcel = async (req, res) => {
    const { startDate, endDate } = req.query;

    // On va réutiliser tes requêtes existantes :
    const [results] = await db.query(`
        SELECT s.id AS sale_id, s.created_at AS date_vente, 
               c.name AS client_name, 
               s.total_amount, 
               s.payment_status
        FROM sales s
        LEFT JOIN customers c ON s.customer_id = c.id
        WHERE DATE(s.created_at) BETWEEN ? AND ?
        ORDER BY s.created_at ASC
    `, [startDate, endDate]);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Rapport de ventes');

    worksheet.columns = [
        { header: '# Vente', key: 'sale_id', width: 10 },
        { header: 'Date', key: 'date_vente', width: 15 },
        { header: 'Client', key: 'client_name', width: 25 },
        { header: 'Montant TTC', key: 'total_amount', width: 15 }
    ];

    results.forEach(row => {
        worksheet.addRow({
            sale_id: row.sale_id,
            date_vente: row.date_vente ? row.date_vente.toISOString().split('T')[0] : '',
            client_name: row.client_name || 'Non spécifié',
            total_amount: row.total_amount ? parseFloat(row.total_amount).toFixed(2) : '0.00'
        });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=rapport_ventes.xlsx');

    await workbook.xlsx.write(res);
    res.end();
};

exports.reportAdvancedExportPDF = async (req, res) => {
    const { startDate, endDate } = req.query;

    try {
        const [results] = await db.query(`
            SELECT s.id AS sale_id, s.created_at AS date_vente, 
                   c.name AS client_name, 
                   s.total_amount, 
                   s.payment_status
            FROM sales s
            LEFT JOIN customers c ON s.customer_id = c.id
            WHERE DATE(s.created_at) BETWEEN ? AND ?
            ORDER BY s.created_at ASC
        `, [startDate, endDate]);

        // Création du PDF
        const doc = new PDFDocument({ margin: 30, size: 'A4' });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=rapport_ventes_${startDate}_to_${endDate}.pdf`);

        doc.pipe(res);

        // Titre
        doc.fontSize(16).text('Rapport de ventes avancé', { align: 'center' });
        doc.moveDown();
        doc.fontSize(10).text(`Période : ${startDate || '---'} au ${endDate || '---'}`, { align: 'center' });
        doc.moveDown();

        // En-tête du tableau
        doc.fontSize(12).text('# Vente', 50, doc.y, { continued: true });
        doc.text('Date', 100, doc.y, { continued: true });
        doc.text('Client', 200, doc.y, { continued: true });
        doc.text('Montant TTC', 400, doc.y);

        doc.moveDown();

        let total = 0;

        results.forEach(row => {
            const date = row.date_vente ? row.date_vente.toISOString().split('T')[0] : '';
            const client = row.client_name || 'Non spécifié';
            const montant = row.total_amount ? parseFloat(row.total_amount).toFixed(2) : '0.00';

            doc.fontSize(10)
               .text(`Vente ${row.sale_id}`, 50, doc.y, { continued: true })
               .text(date, 100, doc.y, { continued: true })
               .text(client, 200, doc.y, { continued: true })
               .text(`${montant} FCFA`, 400, doc.y);

            doc.moveDown();
            total += parseFloat(row.total_amount) || 0;
        });

        doc.moveDown();
        doc.fontSize(12).text(`Total général TTC : ${total.toFixed(2)} FCFA`, { align: 'right' });

        doc.end();

    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur lors de la génération du PDF.");
    }
};

exports.reportAdvancedExportPDF = async (req, res) => {
    const { startDate, endDate } = req.query;

    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    const url = `${baseUrl}/sales/report/advanced/print?startDate=${startDate}&endDate=${endDate}`;


    try {
        const browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle0' });

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true
        });

        await browser.close();

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=rapport_ventes_${startDate}_to_${endDate}.pdf`);
        res.send(pdfBuffer);

    } catch (err) {
        console.error('Erreur génération PDF avec Puppeteer:', err);
        res.status(500).send("Erreur lors de la génération du PDF.");
    }
};

exports.updateStatus = async (req, res) => {
  const saleId = req.params.id;
  const { newStatus } = req.body;

  try {
    // Mise à jour du statut de la vente
    await db.query(`UPDATE sales SET payment_status = ? WHERE id = ?`, [newStatus, saleId]);

    // ✅ Création automatique du bon de livraison si "livré"
    if (newStatus === 'livré') {
      const [existingDelivery] = await db.query(
        'SELECT id FROM delivery_notes WHERE sale_id = ?',
        [saleId]
      );

      if (existingDelivery.length === 0) {
        await db.query(
          `INSERT INTO delivery_notes (sale_id, delivery_date, status, note)
           VALUES (?, CURDATE(), 'livré', 'Créé automatiquement depuis la vente')`,
          [saleId]
        );
        console.log(`✅ Bon de livraison généré automatiquement pour la vente ${saleId}`);
      }
    }

    res.redirect('/sales/history');
  } catch (err) {
    console.error('Erreur mise à jour statut vente :', err);
    res.status(500).send('Erreur serveur');
  }
};

exports.list = async (req, res) => {
  try {
    const [sales] = await db.query(`
      SELECT s.*, c.name AS customer_name,
        (SELECT id FROM delivery_notes WHERE sale_id = s.id LIMIT 1) AS delivery_note_id
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      ORDER BY s.id DESC
    `);

    res.render('sales/history', { sales });
  } catch (err) {
    console.error('Erreur chargement ventes :', err);
    res.status(500).send('Erreur serveur');
  }
};




