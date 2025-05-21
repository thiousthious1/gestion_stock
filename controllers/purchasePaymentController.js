const db = require('../models/db'); // ou ton chemin vers la connexion db

// ✅ Liste des paiements effectués
exports.listPayments = async (req, res) => {
    const [payments] = await db.query(`
        SELECT 
            pp.*, 
            p.purchase_date, 
            s.name AS supplier_name 
        FROM purchase_payments pp
        LEFT JOIN purchases p ON pp.purchase_id = p.id
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        ORDER BY pp.payment_date DESC
    `);

    res.render('purchases/payments_list', {
        payments,
        page: 'purchase-payments',
        pageGroup: 'purchases'
    });
};

// ✅ Formulaire d’ajout
exports.showAddForm = async (req, res) => {
    const [purchases] = await db.query(`
        SELECT p.id, s.name AS supplier_name 
        FROM purchases p
        LEFT JOIN suppliers s ON p.supplier_id = s.id
    `);

    const selectedPurchaseId = req.query.purchase_id || '';

    res.render('purchases/payment_add', {
        purchases,
        selectedPurchaseId,
        page: 'purchase-payments',
        pageGroup: 'purchases'
    });
};


// ✅ Enregistrer un paiement
exports.addPayment = async (req, res) => {
    const { purchase_id, payment_date, amount, payment_method, notes } = req.body;

    if (!purchase_id || !payment_date || !amount) {
        req.session.errorMessage = 'Veuillez remplir tous les champs obligatoires.';
        return res.redirect('/purchase-payments/add');
    }

    try {
        // ✅ Enregistrer le paiement
        await db.query(`
            INSERT INTO purchase_payments (purchase_id, payment_date, amount, payment_method, notes)
            VALUES (?, ?, ?, ?, ?)
        `, [purchase_id, payment_date, amount, payment_method || '', notes || '']);

        // ✅ Calculer le total payé pour cet achat
        const [[{ total_paid }]] = await db.query(`
            SELECT COALESCE(SUM(amount), 0) AS total_paid FROM purchase_payments WHERE purchase_id = ?
        `, [purchase_id]);

        // ✅ Récupérer le total de l’achat
        const [[{ total_amount }]] = await db.query(`
            SELECT total_amount FROM purchases WHERE id = ?
        `, [purchase_id]);

        // ✅ On force bien en nombres avec 2 décimales pour éviter les erreurs d'arrondi
        const paid = parseFloat(total_paid || 0).toFixed(2);
        const total = parseFloat(total_amount || 0).toFixed(2);

        // ✅ Déterminer le nouveau statut de paiement
        let newStatus = 'Unpaid';
        if (parseFloat(paid) >= parseFloat(total)) {
            newStatus = 'Paid';
        } else if (parseFloat(paid) > 0) {
            newStatus = 'Partially Paid';
        }

        // ✅ Mettre à jour le statut de paiement dans purchases
        await db.query(`
            UPDATE purchases SET payment_status = ? WHERE id = ?
        `, [newStatus, purchase_id]);

        req.session.successMessage = 'Paiement enregistré avec succès.';
        res.redirect('/purchase-payments');

    } catch (err) {
        console.error('Erreur ajout paiement :', err);
        req.session.errorMessage = 'Erreur lors de l\'ajout du paiement.';
        res.redirect('/purchase-payments/add');
    }
};

exports.editPayment = async (req, res) => {
    const payment_id = req.params.id;

    const [rows] = await db.query(`
        SELECT pp.*, p.purchase_date, s.name AS supplier_name 
        FROM purchase_payments pp 
        JOIN purchases p ON pp.purchase_id = p.id 
        LEFT JOIN suppliers s ON p.supplier_id = s.id 
        WHERE pp.id = ?
    `, [payment_id]);

    if (rows.length === 0) {
        req.session.errorMessage = "Paiement introuvable.";
        return res.redirect('/purchase-payments');
    }

    res.render('purchases/purchase_payment_edit', {
        payment: rows[0]
    });
};

exports.updatePayment = async (req, res) => {
    const payment_id = req.params.id;
    const { amount, payment_date, payment_method, notes } = req.body;

    await db.query(`
        UPDATE purchase_payments 
        SET amount = ?, payment_date = ?, payment_method = ?, notes = ?
        WHERE id = ?
    `, [amount, payment_date, payment_method, notes, payment_id]);

    req.session.successMessage = "Paiement mis à jour avec succès.";
    res.redirect('/purchase-payments');
};

exports.deletePayment = async (req, res) => {
    const payment_id = req.params.id;

    await db.query(`DELETE FROM purchase_payments WHERE id = ?`, [payment_id]);

    req.session.successMessage = "Paiement supprimé avec succès.";
    res.redirect('/purchase-payments');
};




