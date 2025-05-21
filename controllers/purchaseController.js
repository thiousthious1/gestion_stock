const db = require('../models/db');
const moment = require('moment'); // Si tu n’as pas encore installé : npm install moment
const ExcelJS = require('exceljs');
const puppeteer = require('puppeteer');

exports.showAddPurchaseForm = async (req, res) => {
  const [suppliers] = await db.query(`SELECT * FROM suppliers`);
  const [products] = await db.query(`SELECT * FROM products`);
  res.render('purchases/add_purchase', {
      suppliers,
      products,
      page: 'purchases',
      pageGroup: 'purchases'
  });
};

exports.addPurchase = async (req, res) => {
  const { supplier_id, items = [], global_discount = 0, global_tax = 0 } = req.body;

  if (!supplier_id || items.length === 0) {
      req.session.errorMessage = 'Veuillez sélectionner un fournisseur et au moins un produit.';
      return res.redirect('/purchases/add');
  }

  try {

      // ✅ Vérification : aucun produit ne doit être sélectionné plusieurs fois
      let selectedProducts = new Set();
      for (const item of items) {
          const prodId = item.product_id;
          if (selectedProducts.has(prodId)) {
              req.session.errorMessage = '❌ Le même produit ne peut pas être sélectionné plusieurs fois.';
              return res.redirect('/purchases/add');
          }
          selectedProducts.add(prodId);
      }

      let subtotal = 0;

      for (const item of items) {
          const qty = parseFloat(item.quantity) || 0;
          const price = parseFloat(item.unit_price) || 0;
          const discount = parseFloat(item.discount) || 0;
          const tax = parseFloat(item.tax) || 0;

          let lineTotal = price * qty;
          lineTotal -= (lineTotal * discount / 100);
          lineTotal += (lineTotal * tax / 100);

          subtotal += lineTotal;
      }

      let discountAmount = (subtotal * (parseFloat(global_discount) || 0)) / 100;
      let subtotalAfterDiscount = subtotal - discountAmount;
      let taxAmount = (subtotalAfterDiscount * (parseFloat(global_tax) || 0)) / 100;
      let totalAmount = subtotalAfterDiscount + taxAmount;

      const [purchaseResult] = await db.query(
          `INSERT INTO purchases (supplier_id, purchase_date, total_amount, global_discount, global_tax)
           VALUES (?, NOW(), ?, ?, ?)`,
          [supplier_id, totalAmount, global_discount, global_tax]
      );

      const purchaseId = purchaseResult.insertId;

      for (const item of items) {
          await db.query(
              `INSERT INTO purchase_details (purchase_id, product_id, quantity, unit_price, discount, tax)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [
                  purchaseId,
                  item.product_id,
                  parseFloat(item.quantity) || 0,
                  parseFloat(item.unit_price) || 0,
                  parseFloat(item.discount) || 0,
                  parseFloat(item.tax) || 0
              ]
          );

          // ✅ Met à jour le stock du produit
          await db.query(
              `UPDATE products SET quantite = quantite + ? WHERE id = ?`,
              [parseFloat(item.quantity) || 0, item.product_id]
          );
      }

      req.session.successMessage = '✅ Achat enregistré avec succès.';
      res.redirect('/purchases/'); // à adapter selon ta page de liste des achats

  } catch (err) {
      console.error(err);
      req.session.errorMessage = '❌ Une erreur est survenue.';
      res.redirect('/purchases/add');
  }
};

exports.listPurchases = async (req, res) => {
  try {
    const [purchases] = await db.query(`
        SELECT 
            p.*, 
            s.name AS supplier_name,
            COALESCE((
                SELECT SUM(amount) FROM purchase_payments WHERE purchase_id = p.id
            ), 0) AS total_paid,
            (
                SELECT COUNT(*) FROM purchase_returns WHERE purchase_id = p.id
            ) AS retours_existants
        FROM purchases p
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        ORDER BY p.purchase_date DESC
    `);    
   

      res.render('purchases/list_purchases', {
        successMessage: req.flash('successMessage'),
         errorMessage: req.flash('errorMessage'),
          purchases,
          page: 'purchases',
          pageGroup: 'purchases'
      });

  } catch (err) {
      console.error(err);
      res.status(500).send('Erreur lors de la récupération des achats.');
  }
};

exports.getPurchaseDetails = async (req, res) => {
  const purchaseId = req.params.id;

  try {
      // ✅ Infos générales de l’achat
      const [purchaseRows] = await db.query(`
          SELECT 
              p.*, 
              s.name AS supplier_name 
          FROM purchases p 
          LEFT JOIN suppliers s ON p.supplier_id = s.id 
          WHERE p.id = ?
      `, [purchaseId]);

      if (purchaseRows.length === 0) {
          req.session.errorMessage = 'Achat introuvable.';
          return res.redirect('/purchases');
      }

      const purchase = purchaseRows[0];

      // ✅ Détails des produits
      const [details] = await db.query(`
          SELECT 
              pd.*, 
              pr.nom AS product_name 
          FROM purchase_details pd 
          LEFT JOIN products pr ON pd.product_id = pr.id 
          WHERE pd.purchase_id = ?
      `, [purchaseId]);

      res.render('purchases/purchase_details', {
          purchase,
          details,
          page: 'purchases',
          pageGroup: 'purchases'
      });

  } catch (err) {
      console.error('Erreur chargement détails achat :', err);
      req.session.errorMessage = 'Erreur serveur.';
      res.redirect('/purchases');
  }
};

// Affiche le formulaire vide
exports.reportAdvanced = (req, res) => {
    res.render('purchases/report_advanced', {
      results: null,
      startDate: null,
      endDate: null,
      pageGroup: 'reports',
      page: 'report-purchases-advanced'
  });

};

// Traitement du formulaire (recherche par période)
exports.reportAdvancedResult = async (req, res) => {
    const { startDate, endDate } = req.body;
  
    try {
      // ✅ Détails des achats (jointure avec purchase_details)
      const [results] = await db.query(`
        SELECT 
          p.id AS purchase_id,
          p.purchase_date, 
          s.name AS supplier_name, 
          pr.nom AS product_name,
          pd.quantity, 
          pd.unit_price AS purchase_price,
          (pd.quantity * pd.unit_price) AS total_amount
        FROM purchases p
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        JOIN purchase_details pd ON pd.purchase_id = p.id
        LEFT JOIN products pr ON pd.product_id = pr.id
        WHERE DATE(p.purchase_date) BETWEEN ? AND ?
        ORDER BY p.purchase_date ASC
      `, [startDate, endDate]);
  
      // ✅ Totaux par fournisseur
      const [totauxParFournisseur] = await db.query(`
        SELECT 
          s.name AS supplier_name,
          SUM(pd.quantity * pd.unit_price) AS total_achats
        FROM purchases p
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        JOIN purchase_details pd ON pd.purchase_id = p.id
        WHERE DATE(p.purchase_date) BETWEEN ? AND ?
        GROUP BY p.supplier_id
      `, [startDate, endDate]);
  
      // ✅ Totaux par catégorie
      const [totauxParCategorie] = await db.query(`
        SELECT 
          c.nom AS category_name,
          SUM(pd.quantity * pd.unit_price) AS total_achats
        FROM purchases p
        JOIN purchase_details pd ON pd.purchase_id = p.id
        LEFT JOIN products pr ON pd.product_id = pr.id
        LEFT JOIN categories c ON pr.categorie_id = c.id
        WHERE DATE(p.purchase_date) BETWEEN ? AND ?
        GROUP BY c.id
      `, [startDate, endDate]);
  
      // ✅ Rendu
      res.render('purchases/report_advanced', {
        results,
        startDate,
        endDate,
        totauxParFournisseur,
        totauxParCategorie,
        pageGroup: 'reports',
        page: 'report-purchases-advanced'
      });
  
    } catch (err) {
      console.error(err);
      res.status(500).send('Erreur lors de la récupération des données.');
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
          return res.redirect('/purchases/report/advanced');
  }

  res.render('purchases/report_advanced', {
      results: null,
      startDate,
      endDate,
      totauxParFournisseur: [],
      totauxParCategorie: [],
      pageGroup: 'reports',
      page: 'report-purchases-advanced'
  });
};

exports.reportAdvancedPrint = async (req, res) => {
  const { startDate, endDate } = req.query;

  try {
      // Résultats détaillés
      const [results] = await db.query(`
        SELECT 
            pd.id AS detail_id,
            p.id AS purchase_id,
            p.purchase_date, 
            s.name AS supplier_name, 
            pr.nom AS product_name,
            pd.quantity, 
            pd.unit_price AS purchase_price,
            (pd.quantity * pd.unit_price) AS total_amount
        FROM purchase_details pd
        LEFT JOIN purchases p ON pd.purchase_id = p.id
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        LEFT JOIN products pr ON pd.product_id = pr.id
        WHERE DATE(p.purchase_date) BETWEEN ? AND ?
        ORDER BY p.purchase_date ASC
        `, [startDate, endDate]);


      // Totaux par fournisseur
      const [totauxParFournisseur] = await db.query(`
          SELECT s.name AS supplier_name, 
                 SUM(p.quantity * p.purchase_price) AS total_achats
          FROM purchases p
          LEFT JOIN suppliers s ON p.supplier_id = s.id
          WHERE DATE(p.purchase_date) BETWEEN ? AND ?
          GROUP BY p.supplier_id
      `, [startDate, endDate]);

      // Totaux par catégorie
      const [totauxParCategorie] = await db.query(`
          SELECT c.nom AS category_name, 
                 SUM(p.quantity * p.purchase_price) AS total_achats
          FROM purchases p
          LEFT JOIN products pr ON p.product_id = pr.id
          LEFT JOIN categories c ON pr.categorie_id = c.id
          WHERE DATE(p.purchase_date) BETWEEN ? AND ?
          GROUP BY c.id
      `, [startDate, endDate]);

      res.render('purchases/report_advanced_print', {
          results,
          startDate,
          endDate,
          totauxParFournisseur,
          totauxParCategorie
      });

  } catch (err) {
      console.error(err);
      res.status(500).send('Erreur lors de la récupération des données pour impression.');
  }
};

exports.getAdvancedPurchaseReportExcel = async (req, res) => {
    const { startDate, endDate } = req.query;

    try {
        const [results] = await db.query(`
            SELECT 
                p.id AS purchase_id, 
                p.purchase_date, 
                s.name AS supplier_name, 
                pr.nom AS product_name,
                pd.quantity, 
                pd.unit_price AS purchase_price, 
                (pd.quantity * pd.unit_price) AS total_amount
            FROM purchases p
            LEFT JOIN suppliers s ON p.supplier_id = s.id
            JOIN purchase_details pd ON pd.purchase_id = p.id
            LEFT JOIN products pr ON pd.product_id = pr.id
            WHERE DATE(p.purchase_date) BETWEEN ? AND ?
            ORDER BY p.purchase_date ASC
        `, [startDate, endDate]);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Rapport achats');

        worksheet.columns = [
            { header: '# Achat', key: 'purchase_id', width: 10 },
            { header: 'Date', key: 'purchase_date', width: 15 },
            { header: 'Fournisseur', key: 'supplier_name', width: 20 },
            { header: 'Produit', key: 'product_name', width: 20 },
            { header: 'Quantité', key: 'quantity', width: 10 },
            { header: 'Prix unitaire', key: 'purchase_price', width: 15 },
            { header: 'Montant total', key: 'total_amount', width: 15 },
        ];

        results.forEach(row => {
            worksheet.addRow({
                purchase_id: row.purchase_id,
                purchase_date: row.purchase_date ? row.purchase_date.toISOString().split('T')[0] : '',
                supplier_name: row.supplier_name || 'Non spécifié',
                product_name: row.product_name || 'Non spécifié',
                quantity: row.quantity,
                purchase_price: row.purchase_price ? parseFloat(row.purchase_price).toFixed(2) : '0.00',
                total_amount: row.total_amount ? parseFloat(row.total_amount).toFixed(2) : '0.00',
            });
        });

        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename=rapport_achats_${startDate}_to_${endDate}.xlsx`
        );

        await workbook.xlsx.write(res);
        res.end();

    } catch (err) {
        console.error(err);
        res.status(500).send('Erreur lors de la génération du fichier Excel.');
    }
};


exports.getAdvancedPurchaseReportPrint = async (req, res) => {
    const { startDate, endDate } = req.query;
  
    try {
      // ✅ Détails des achats
      const [results] = await db.query(`
        SELECT 
            pd.id AS detail_id,
            p.id AS purchase_id,
            p.purchase_date, 
            s.name AS supplier_name, 
            pr.nom AS product_name,
            pd.quantity, 
            pd.unit_price AS purchase_price,
            (pd.quantity * pd.unit_price) AS total_amount
        FROM purchase_details pd
        LEFT JOIN purchases p ON pd.purchase_id = p.id
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        LEFT JOIN products pr ON pd.product_id = pr.id
        WHERE DATE(p.purchase_date) BETWEEN ? AND ?
        ORDER BY p.purchase_date ASC
        `, [startDate, endDate]);

  
      // ✅ Totaux par fournisseur
      const [totauxParFournisseur] = await db.query(`
        SELECT 
          s.name AS supplier_name,
          SUM(pd.quantity * pd.unit_price) AS total_achats
        FROM purchases p
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        JOIN purchase_details pd ON pd.purchase_id = p.id
        WHERE DATE(p.purchase_date) BETWEEN ? AND ?
        GROUP BY s.name
      `, [startDate, endDate]);
  
      // ✅ Totaux par catégorie
      const [totauxParCategorie] = await db.query(`
        SELECT 
          c.nom AS category_name,
          SUM(pd.quantity * pd.unit_price) AS total_achats
        FROM purchases p
        JOIN purchase_details pd ON pd.purchase_id = p.id
        LEFT JOIN products pr ON pd.product_id = pr.id
        LEFT JOIN categories c ON pr.categorie_id = c.id
        WHERE DATE(p.purchase_date) BETWEEN ? AND ?
        GROUP BY c.nom
      `, [startDate, endDate]);
  
      // ✅ Rendu du PDF
      res.render('purchases/report_advanced_print', {
        results,
        totauxParFournisseur,
        totauxParCategorie,
        startDate,
        endDate,
        pageGroup: 'reports',
        page: 'report-purchases-advanced'
      });
  
    } catch (err) {
      console.error(err);
      res.status(500).send('Erreur lors de la génération de la version imprimable.');
    }
  };
  

exports.downloadAdvancedPurchaseReportPDF = async (req, res) => {
    const { startDate, endDate } = req.query;

    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const url = `${baseUrl}/purchases/report/advanced/print?startDate=${startDate}&endDate=${endDate}`;

    try {
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle0' });

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' }
        });

        await browser.close();

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=rapport_achats_${startDate}_to_${endDate}.pdf`);
        res.send(pdfBuffer);

    } catch (err) {
        console.error('Erreur lors de la génération du PDF :', err);
        res.status(500).send('Erreur lors de la génération du PDF.');
    }
};

exports.deletePurchase = async (req, res) => {
    const purchase_id = req.params.id;

    // Vérifier s’il existe des retours pour cet achat
    const [retours] = await db.query(`
        SELECT COUNT(*) AS nb FROM purchase_returns WHERE purchase_id = ?
    `, [purchase_id]);

    if (retours[0].nb > 0) {
        req.session.errorMessage = "Impossible de supprimer cet achat car des retours fournisseurs existent.";
        return res.redirect('/purchases');
    }

    // ✅ Avant suppression, remettre les produits au stock
    const [details] = await db.query(`
        SELECT product_id, quantity FROM purchase_details WHERE purchase_id = ?
    `, [purchase_id]);

    for (let item of details) {
        await db.query(`
            UPDATE products SET quantite = quantite - ? WHERE id = ?
        `, [item.quantity, item.product_id]);
    }

    // ✅ Supprimer les paiements liés
    await db.query(`DELETE FROM purchase_payments WHERE purchase_id = ?`, [purchase_id]);

    // ✅ Supprimer les détails de l’achat
    await db.query(`DELETE FROM purchase_details WHERE purchase_id = ?`, [purchase_id]);

    // ✅ Supprimer l’achat
    await db.query(`DELETE FROM purchases WHERE id = ?`, [purchase_id]);

    req.session.successMessage = "Achat supprimé avec succès.";
    res.redirect('/purchases');
};

exports.editPurchase = async (req, res) => {
    const purchase_id = req.params.id;

    // ✅ Récupérer les infos de l'achat
    const [purchaseRows] = await db.query(`
        SELECT * FROM purchases WHERE id = ?
    `, [purchase_id]);

    if (purchaseRows.length === 0) {
        req.session.errorMessage = "Achat introuvable.";
        return res.redirect('/purchases');
    }

    const purchase = purchaseRows[0];

    // ✅ Récupérer les détails (produits achetés)
    const [details] = await db.query(`
        SELECT * FROM purchase_details WHERE purchase_id = ?
    `, [purchase_id]);

    // ✅ Récupérer la liste des fournisseurs
    const [suppliers] = await db.query(`
        SELECT * FROM suppliers
    `);

    // ✅ Récupérer la liste des produits
    const [products] = await db.query(`
        SELECT * FROM products
    `);

    res.render('purchases/purchase_edit', {
        purchase,
        purchaseDetails: details,
        suppliers,
        products
    });
};

exports.updatePurchase = async (req, res) => {
    const purchase_id = req.params.id;
    const { supplier_id, purchase_date, products, total_amount } = req.body;

    // Vérifier s’il existe des retours pour cet achat
    const [retours] = await db.query(`
        SELECT COUNT(*) AS nb FROM purchase_returns WHERE purchase_id = ?
    `, [purchase_id]);

    if (retours[0].nb > 0) {
        req.session.errorMessage = "Impossible de modifier cet achat car des retours fournisseurs existent.";
        return res.redirect('/purchases');
    }

    // ✅ Mettre à jour l’achat (infos générales)
    await db.query(`
        UPDATE purchases 
        SET supplier_id = ?, purchase_date = ?, total_amount = ?
        WHERE id = ?
    `, [supplier_id, purchase_date, total_amount, purchase_id]);
    

    // ✅ Mettre à jour les produits et quantités
    // D’abord : retirer l’ancien stock
    const [oldDetails] = await db.query(`
        SELECT product_id, quantity FROM purchase_details WHERE purchase_id = ?
    `, [purchase_id]);

    for (let item of oldDetails) {
        await db.query(`
            UPDATE products SET quantite = quantite - ? WHERE id = ?
        `, [item.quantity, item.product_id]);
    }

    // Supprimer les anciens détails
    await db.query(`DELETE FROM purchase_details WHERE purchase_id = ?`, [purchase_id]);

    // Insérer les nouveaux détails et mettre à jour le stock
    for (let prod of products) {
        const { product_id, quantity, unit_price } = prod;

        await db.query(`
            INSERT INTO purchase_details (purchase_id, product_id, quantity, unit_price)
            VALUES (?, ?, ?, ?)
        `, [purchase_id, product_id, quantity, unit_price]);

        // Remettre le stock à jour
        await db.query(`
            UPDATE products SET quantite = quantite + ? WHERE id = ?
        `, [quantity, product_id]);
    }

    req.session.successMessage = "Achat mis à jour avec succès.";
    res.redirect('/purchases');
};





