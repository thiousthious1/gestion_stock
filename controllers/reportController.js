const db = require('../models/db');

exports.getGlobalSummaryReport = async (req, res) => {
    const { startDate, endDate } = req.query;

    const debut = startDate || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
    const fin = endDate || new Date().toISOString().split('T')[0];

    try {
        // Total ventes (brut)
        const [ventes] = await db.query(`
            SELECT SUM(total_amount) AS total_ventes
            FROM sales
            WHERE DATE(created_at) BETWEEN ? AND ?;
        `, [debut, fin]);

        // Paiements reçus (trésorerie réelle)
        const [paiementsRecus] = await db.query(`
            SELECT SUM(amount_paid) AS total_paiements_recus
            FROM payments
            WHERE DATE(payment_date) BETWEEN ? AND ?;
        `, [debut, fin]);

        // Achats (brut basé sur total_amount de purchases)
        const [achats] = await db.query(`
            SELECT SUM(total_amount) AS total_achats
            FROM purchases
            WHERE DATE(purchase_date) BETWEEN ? AND ?;
        `, [debut, fin]);

        // Paiements effectués pour achats
        const [paiementsAchats] = await db.query(`
            SELECT SUM(amount) AS total_paiements_achats
            FROM purchase_payments
            WHERE DATE(payment_date) BETWEEN ? AND ?;
        `, [debut, fin]);

        // Dépenses (également paiement réel)
        const [depenses] = await db.query(`
            SELECT SUM(amount) AS total_depenses
            FROM expenses
            WHERE DATE(expense_date) BETWEEN ? AND ?;
        `, [debut, fin]);

        // Résultat brut d’activité
        const totalVentes = parseFloat(ventes[0].total_ventes) || 0;
        const totalAchats = parseFloat(achats[0].total_achats) || 0;
        const totalDepenses = parseFloat(depenses[0].total_depenses) || 0;
        const resultatBrut = totalVentes - totalAchats - totalDepenses;

        // Résultat net réel (trésorerie)
        const totalRecus = parseFloat(paiementsRecus[0].total_paiements_recus) || 0;
        const totalPayes = (parseFloat(paiementsAchats[0].total_paiements_achats) || 0) + totalDepenses;
        const resultatNet = totalRecus - totalPayes;

        // Évolution mensuelle des ventes
        const [evolutionVentes] = await db.query(`
            SELECT 
                DATE_FORMAT(created_at, '%Y-%m') AS mois, 
                SUM(total_amount) AS total 
            FROM sales
            WHERE DATE(created_at) BETWEEN ? AND ?
            GROUP BY mois
            ORDER BY mois ASC;
        `, [debut, fin]);

        // Évolution mensuelle des dépenses
        const [evolutionDepenses] = await db.query(`
            SELECT 
                DATE_FORMAT(expense_date, '%Y-%m') AS mois, 
                SUM(amount) AS total 
            FROM expenses
            WHERE DATE(expense_date) BETWEEN ? AND ?
            GROUP BY mois
            ORDER BY mois ASC;
        `, [debut, fin]);

        res.render('reports/report_summary', {
            debut,
            fin,
            totalVentes,
            totalAchats,
            totalDepenses,
            resultatBrut,
            totalRecus,
            totalPayes,
            resultatNet,
            evolutionVentes,
            evolutionDepenses,
            page: 'report-summary',
            pageGroup: 'reports'
        });

    } catch (err) {
        console.error('Erreur lors de la génération du rapport de synthèse globale :', err);
        res.status(500).send('Erreur serveur');
    }
};

  
exports.getGlobalSummaryReportPrint = async (req, res) => {
    const { startDate, endDate } = req.query;
  
    const debut = startDate || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
    const fin = endDate || new Date().toISOString().split('T')[0];
  
    try {
      // Total ventes (brut)
      const [ventes] = await db.query(`
        SELECT SUM(total_amount) AS total_ventes
        FROM sales
        WHERE DATE(created_at) BETWEEN ? AND ?
      `, [debut, fin]);
  
      // Total achats (indicatif)
      const [achats] = await db.query(`
        SELECT SUM(pd.quantity * pd.unit_price) AS total_achats
        FROM purchases p
        JOIN purchase_details pd ON pd.purchase_id = p.id
        WHERE DATE(p.purchase_date) BETWEEN ? AND ?
      `, [debut, fin]);
  
      // Total dépenses
      const [depenses] = await db.query(`
        SELECT SUM(amount) AS total_depenses
        FROM expenses
        WHERE DATE(expense_date) BETWEEN ? AND ?
      `, [debut, fin]);
  
      // Total paiements reçus des clients
      const [recus] = await db.query(`
        SELECT SUM(amount_paid) AS total_recus
        FROM payments
        WHERE DATE(payment_date) BETWEEN ? AND ?
      `, [debut, fin]);
  
      // Total paiements effectués pour les achats
      const [payes] = await db.query(`
        SELECT SUM(amount) AS total_payes
        FROM purchase_payments
        WHERE DATE(payment_date) BETWEEN ? AND ?
      `, [debut, fin]);
  
      // Total paiements dépenses (considérés comme déjà payés à 100%)
      const totalDepenses = parseFloat(depenses[0].total_depenses) || 0;
  
      // Résultat brut
      const totalVentes = parseFloat(ventes[0].total_ventes) || 0;
      const totalAchats = parseFloat(achats[0].total_achats) || 0;
      const resultatBrut = totalVentes - totalAchats - totalDepenses;
  
      // Résultat net réel (trésorerie)
      const totalRecus = parseFloat(recus[0].total_recus) || 0;
      const totalPayes = parseFloat(payes[0].total_payes) || 0;
      const resultatNet = totalRecus - totalPayes - totalDepenses;
  
      res.render('reports/report_summary_print', {
        totalVentes,
        totalAchats,
        totalDepenses,
        totalRecus,
        totalPayes,
        totalDepensesPayees: totalDepenses,
        resultatBrut,
        resultatNet,
        debut,
        fin
      });
  
    } catch (err) {
      console.error('Erreur lors de la génération de la synthèse imprimable :', err);
      res.status(500).send('Erreur serveur');
    }
  };
  


exports.getSimpleSalesReport = async (req, res) => {
    try {
        const [ventes] = await db.query(`
            SELECT 
                s.id, 
                s.created_at, 
                c.name AS client_name,
                s.total_amount, 
                s.payment_status,
                u.username AS vendeur
            FROM sales s
            LEFT JOIN customers c ON s.customer_id = c.id
            LEFT JOIN users u ON s.user_id = u.id
            ORDER BY s.created_at DESC
        `);
        //console.log(ventes);

        res.render('reports/report_sales_simple', {
            ventes,
            page: 'report-sales-simple',
            pageGroup: 'reports',
            results: true
        });

    } catch (err) {
        console.error('Erreur rapport ventes :', err);
        res.status(500).send('Erreur serveur');
    }
};


exports.getSimplePurchasesReport = async (req, res) => {
    try {
      const [achats] = await db.query(`
        SELECT 
          p.id AS purchase_id,
          p.purchase_date, 
          s.name AS fournisseur, 
          pr.nom AS produit,
          pd.quantity, 
          pd.unit_price AS purchase_price,
          (pd.quantity * pd.unit_price) AS total
        FROM purchases p
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        JOIN purchase_details pd ON pd.purchase_id = p.id
        LEFT JOIN products pr ON pd.product_id = pr.id
        ORDER BY p.purchase_date DESC
      `);
  
      res.render('reports/report_purchases_simple', {
        achats,
        page: 'report-purchases',
        pageGroup: 'reports',
        results: true
      });
  
    } catch (err) {
      console.error('Erreur rapport achats :', err);
      res.status(500).send('Erreur serveur');
    }
  };
  

exports.getSimpleStockReport = async (req, res) => {
    try {
        const [produits] = await db.query(`
            SELECT 
                pr.id, 
                pr.nom, 
                pr.quantite, 
                pr.prix_vente,
                (pr.quantite * pr.prix_vente) AS valeur_stock
            FROM products pr
            ORDER BY pr.nom ASC
        `);

        res.render('reports/report_stock_simple', {
            produits,
            page: 'report-stock',
            pageGroup: 'reports',
            results: true
        });

    } catch (err) {
        console.error('Erreur rapport stock :', err);
        res.status(500).send('Erreur serveur');
    }
};

exports.getSimpleSalesReportPrint = async (req, res) => {
    const [ventes] = await db.query(`
        SELECT 
                s.id, 
                s.created_at, 
                c.name AS client_name,
                s.total_amount, 
                s.payment_status,
                u.username AS vendeur
            FROM sales s
            LEFT JOIN customers c ON s.customer_id = c.id
            LEFT JOIN users u ON s.user_id = u.id
            ORDER BY s.created_at DESC
    `);
    res.render('reports/report_sales_simple_print', { ventes });
};

exports.getSimplePurchasesReportPrint = async (req, res) => {
    const [achats] = await db.query(`
      SELECT 
        p.id AS purchase_id, 
        p.purchase_date, 
        s.name AS fournisseur, 
        pr.nom AS produit,
        pd.quantity, 
        pd.unit_price AS purchase_price, 
        (pd.quantity * pd.unit_price) AS total
      FROM purchases p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      JOIN purchase_details pd ON pd.purchase_id = p.id
      LEFT JOIN products pr ON pd.product_id = pr.id
      ORDER BY p.purchase_date DESC
    `);
  
    res.render('reports/report_purchases_simple_print', { achats });
  };
  

exports.getSimpleStockReportPrint = async (req, res) => {
    const [produits] = await db.query(`
        SELECT pr.id, pr.nom, pr.quantite, pr.prix_vente, (pr.quantite * pr.prix_vente) AS valeur_stock
        FROM products pr
        ORDER BY pr.nom ASC
    `);
    res.render('reports/report_stock_simple_print', { produits });
};



