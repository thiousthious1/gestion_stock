// ✅ FICHIER : controllers/dashboardController.js
const db = require('../models/db');
const moment = require('moment');

exports.getDashboard = async (req, res) => {
  const { startDate, endDate } = req.query;
  const start = startDate || new Date().toISOString().slice(0, 10);
  const end = endDate || new Date().toISOString().slice(0, 10);

  const today = moment().format('YYYY-MM-DD');
  const filters = {
    today: { start: today, end: today },
    yesterday: {
      start: moment().subtract(1, 'days').format('YYYY-MM-DD'),
      end: moment().subtract(1, 'days').format('YYYY-MM-DD')
    },
    last7days: {
      start: moment().subtract(6, 'days').format('YYYY-MM-DD'),
      end: today
    },
    thisMonth: {
      start: moment().startOf('month').format('YYYY-MM-DD'),
      end: today
    },
    thisYear: {
      start: moment().startOf('year').format('YYYY-MM-DD'),
      end: today
    }
  };

  // 🔍 Détection du filtre sélectionné
  let selectedFilter = '';
  if (startDate === filters.today.start && endDate === filters.today.end) {
    selectedFilter = 'today';
  } else if (startDate === filters.yesterday.start && endDate === filters.yesterday.end) {
    selectedFilter = 'yesterday';
  } else if (startDate === filters.last7days.start && endDate === filters.last7days.end) {
    selectedFilter = 'last7days';
  } else if (startDate === filters.thisMonth.start && endDate === filters.thisMonth.end) {
    selectedFilter = 'thisMonth';
  } else if (startDate === filters.thisYear.start && endDate === filters.thisYear.end) {
    selectedFilter = 'thisYear';
  }

  try {
    const [[{ total_sales }]] = await db.query(
      `SELECT SUM(total_amount) AS total_sales FROM sales WHERE DATE(created_at) BETWEEN ? AND ?`,
      [start, end]
    );

    const [[{ total_expenses }]] = await db.query(
      `SELECT SUM(amount) AS total_expenses FROM expenses WHERE DATE(expense_date) BETWEEN ? AND ?`,
      [start, end]
    );

    const [[{ payment_received }]] = await db.query(
      `SELECT SUM(amount_paid) AS payment_received FROM payments WHERE DATE(payment_date) BETWEEN ? AND ?`,
      [start, end]
    );

    const [[{ payment_sent }]] = await db.query(
      `SELECT SUM(amount) AS payment_sent FROM purchase_payments WHERE DATE(payment_date) BETWEEN ? AND ?`,
      [start, end]
    );

    const [topSellingProducts] = await db.query(
      `SELECT p.nom AS name, SUM(sd.quantity) AS qty
       FROM sale_details sd
       JOIN products p ON p.id = sd.product_id
       JOIN sales s ON s.id = sd.sale_id
       WHERE DATE(s.created_at) BETWEEN ? AND ?
       GROUP BY sd.product_id
       ORDER BY qty DESC
       LIMIT 5`,
      [start, end]
    );

    const [recentSales] = await db.query(
        `SELECT s.id, s.created_at, s.total_amount AS total,
                s.paid_amount AS paid, s.status, c.name AS client_name
        FROM sales s
        LEFT JOIN customers c ON s.customer_id = c.id
        WHERE DATE(s.created_at) BETWEEN ? AND ?
        ORDER BY s.created_at DESC
        LIMIT 5`,
        [start, end]
    );
        // Extraire les IDs des ventes récentes
        const saleIds = recentSales.map(s => s.id);
        let saleDetails = [];
        if (saleIds.length > 0) {
            const [details] = await db.query(`
                SELECT sd.sale_id, sd.product_id, p.nom AS product_name, sd.quantity, sd.unit_price, sd.discount
                FROM sale_details sd
                LEFT JOIN products p ON sd.product_id = p.id
                WHERE sd.sale_id IN (?)
            `, [saleIds]);
            // Grouper les détails par sale_id
            saleDetails = saleIds.reduce((acc, saleId) => {
                acc[saleId] = details.filter(d => d.sale_id === saleId);
                return acc;
            }, {});
        }
        // Formatter la date dans un format court
        recentSales.forEach(s => {
        s.date = moment(s.created_at).format('DD-MM-YYYY');
        });

    // Récupération des achats récents (5 derniers)
    const [recentPurchases] = await db.query(
    `SELECT p.id, p.purchase_date AS date,
            p.total_amount AS total, p.total_amount AS paid,
            p.payment_status AS status, s.name AS supplier_name
    FROM purchases p
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    WHERE DATE(p.purchase_date) BETWEEN ? AND ?
    ORDER BY p.purchase_date DESC
    LIMIT 5`,
    [start, end]
    );

        // Extraire les IDs des achats récents
        const purchaseIds = recentPurchases.map(p => p.id);
        let purchaseDetails = [];
        if (purchaseIds.length > 0) {
        const [details] = await db.query(`
            SELECT pd.purchase_id, pd.product_id, pr.nom AS product_name,
                pd.quantity, pd.unit_price, pd.discount
            FROM purchase_details pd
            LEFT JOIN products pr ON pd.product_id = pr.id
            WHERE pd.purchase_id IN (?)
        `, [purchaseIds]);
        // Grouper les détails par purchase_id
        purchaseDetails = purchaseIds.reduce((acc, id) => {
            acc[id] = details.filter(d => d.purchase_id === id);
            return acc;
        }, {});
        }
        // Formatter la date dans un format court
        recentPurchases.forEach(p => {
        p.date = moment(p.date).format('DD-MM-YYYY');
        });


    // Récupération des 5 derniers retours d'achat
    const [recentPurchaseReturns] = await db.query(`
    SELECT pr.id, pr.return_date AS date, pr.reason,
            s.name AS supplier_name
    FROM purchase_returns pr
    LEFT JOIN purchases p ON pr.purchase_id = p.id
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    WHERE DATE(pr.return_date) BETWEEN ? AND ?
    ORDER BY pr.return_date DESC
    LIMIT 5`, [start, end]);

        // Extraire les IDs des retours
        const returnIds = recentPurchaseReturns.map(r => r.id);

        let returnDetails = [];

        if (returnIds.length > 0) {
        const [details] = await db.query(`
            SELECT rd.return_id, rd.product_id, pr.nom AS product_name,
                rd.quantity, rd.reason AS product_reason
            FROM purchase_returns_details rd
            LEFT JOIN products pr ON rd.product_id = pr.id
            WHERE rd.return_id IN (?)
        `, [returnIds]);

        // Grouper les détails par return_id
        returnDetails = returnIds.reduce((acc, id) => {
            acc[id] = details.filter(d => d.return_id === id);
            return acc;
        }, {});
        }

        // Format de date propre
        recentPurchaseReturns.forEach(r => {
        r.date = moment(r.date).format('DD-MM-YYYY');
        });

    // Récupération des 5 derniers retours clients
    const [recentSalesReturns] = await db.query(`
    SELECT r.id, r.return_date AS date, r.total_amount,
            c.name AS customer_name
    FROM returns r
    LEFT JOIN sales s ON r.sale_id = s.id
    LEFT JOIN customers c ON s.customer_id = c.id
    WHERE DATE(r.return_date) BETWEEN ? AND ?
    ORDER BY r.return_date DESC
    LIMIT 5`, [start, end]);

        // Extraire les IDs des retours
        const returnSaleIds = recentSalesReturns.map(r => r.id);

        let returnSaleDetails = [];

        if (returnSaleIds.length > 0) {
        const [details] = await db.query(`
            SELECT rd.return_id, rd.product_id, p.nom AS product_name,
                rd.quantity, rd.unit_price, rd.discount, rd.reason
            FROM returns_details rd
            LEFT JOIN products p ON rd.product_id = p.id
            WHERE rd.return_id IN (?)
        `, [returnSaleIds]);

        console.log("🧾 Détails récupérés pour retours :", details);
        console.log("🔑 IDs attendus :", returnSaleIds);

        returnSaleDetails = returnSaleIds.reduce((acc, id) => {
        acc[id] = details.filter(d => Number(d.return_id) === Number(id));
        return acc;
        }, {});

        }

        

        // Format de la date courte
        recentSalesReturns.forEach(r => {
        r.date = moment(r.date).format('DD-MM-YYYY');
        });


    const [topCustomers] = await db.query(
      `SELECT c.name AS name, SUM(s.total_amount) AS total, COUNT(s.id) AS sales_count
       FROM sales s
       JOIN customers c ON s.customer_id = c.id
       WHERE DATE(s.created_at) BETWEEN ? AND ?
       GROUP BY s.customer_id
       ORDER BY total DESC
       LIMIT 5`,
      [start, end]
    );

    const [stockAlerts] = await db.query(
      `SELECT nom AS name, quantite, stock_alert_level FROM products WHERE quantite <= stock_alert_level`
    );

    const [salesPerDay] = await db.query(
      `SELECT DATE(created_at) AS date, SUM(total_amount) AS total FROM sales
       WHERE DATE(created_at) BETWEEN ? AND ?
       GROUP BY DATE(created_at)`,
      [start, end]
    );

    const [purchasesPerDay] = await db.query(
      `SELECT DATE(purchase_date) AS date, SUM(total_amount) AS total FROM purchases
       WHERE DATE(purchase_date) BETWEEN ? AND ?
       GROUP BY DATE(purchase_date)`,
      [start, end]
    );

    // Ces requêtes sont à adapter à ta base de données réelle
    const [[{ totalSalesItems }]] = await db.query(`SELECT COUNT(*) AS totalSalesItems FROM sale_details`);
    const [[{ totalSalesReturnsItems }]] = await db.query(`SELECT COUNT(*) AS totalSalesReturnsItems FROM returns_details`);
    const [[{ totalPurchaseItems }]] = await db.query(`SELECT COUNT(*) AS totalPurchaseItems FROM purchases`);
    const [[{ totalPurchaseReturnsItems }]] = await db.query(`SELECT COUNT(*) AS totalPurchaseReturnsItems FROM purchase_returns_details`);

    function formatNumber(value) {
        return Number(value || 0).toLocaleString('fr-FR');
    }

    // Paiements envoyés (achats)
  const [paymentsSent] = await db.query(`
    SELECT DATE(payment_date) AS date, SUM(amount) AS total
    FROM purchase_payments
    WHERE DATE(payment_date) BETWEEN ? AND ?
    GROUP BY DATE(payment_date)
  `, [start, end]);

  // Paiements reçus (ventes)
  const [paymentsReceived] = await db.query(`
    SELECT DATE(payment_date) AS date, SUM(amount_paid) AS total
    FROM payments
    WHERE DATE(payment_date) BETWEEN ? AND ?
    GROUP BY DATE(payment_date)
  `, [start, end]);

  // Générer une plage de dates
  const dateRange = [];
  let current = moment(startDate);
  const last = moment(endDate);

  while (current <= last) {
    dateRange.push(current.format('YYYY-MM-DD'));
    current.add(1, 'day');
  }

  // Structuration des données pour le graphique
  const paymentChartData = dateRange.map(date => {
    const sent = paymentsSent.find(p => p.date === date)?.total || 0;
    const received = paymentsReceived.find(p => p.date === date)?.total || 0;
    return {
      date,
      sent,
      received
    };
  });


    res.render('dashboard', {
        startDate: start,
        endDate: end,
        filters,
        selectedFilter,
        total_sales,
        total_expenses,
        payment_received,
        payment_sent,
        topSellingProducts,
        recentSales,
        saleDetails,
        recentPurchases,
        purchaseDetails,
        recentPurchaseReturns,
        returnDetails,
        recentSalesReturns,
        returnSaleDetails,
        topCustomers,
        stockAlerts,
        salesPerDay,
        purchasesPerDay,
        totalSalesItems,
        totalSalesReturnsItems,
        totalPurchaseItems,
        totalPurchaseReturnsItems,
        paymentChartData,
        formatNumber
    });
  } catch (err) {
    console.error('Erreur dashboard:', err);
    res.status(500).send('Erreur lors du chargement du tableau de bord.');
  }
};



