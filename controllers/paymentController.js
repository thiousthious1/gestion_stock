const db = require('../models/db');

// Afficher formulaire d'ajout de paiement
exports.showAddPaymentForm = async (req, res) => {
  const { saleId } = req.params;
  try {
    const [sales] = await db.query('SELECT * FROM sales WHERE id = ?', [saleId]);
    if (sales.length === 0) {
      return res.status(404).send('Vente non trouvée');
    }

    res.render('payments/add', { sale: sales[0] });
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
};

// Enregistrer un paiement
exports.addPayment = async (req, res) => {
  const { saleId } = req.params;
  let { amount_paid } = req.body;

  try {
    //console.log("🛠️ Montant brut reçu :", amount_paid); // DEBUG
    if (typeof amount_paid === 'string') {
      amount_paid = amount_paid.replace(',', '.');
    }

    let amount = parseFloat(amount_paid);
    if (isNaN(amount) || amount <= 0) {
      //console.log("⛔ Montant invalidé après conversion :", amount);
      return res.status(400).send("Montant invalide.");
    }

    // Récupère la vente existante
    const [sales] = await db.query('SELECT total_amount, paid_amount FROM sales WHERE id = ?', [saleId]);
    if (sales.length === 0) {
      return res.status(404).send('Vente non trouvée');
    }

    const sale = sales[0];
    const due = sale.total_amount - sale.paid_amount;

    if (amount > due) {
      return res.status(400).send(`Le montant payé dépasse le montant dû (${due} CFA).`);
    }

    // Insère le paiement
    await db.query(
      `INSERT INTO payments (sale_id, amount_paid) VALUES (?, ?)`,
      [saleId, amount]
    );

    const paidBefore = parseFloat(sale.paid_amount);
    const totalAmount = parseFloat(sale.total_amount);
    const amountToAdd = parseFloat(amount);

    const newPaidAmount = paidBefore + amountToAdd;
    const newDueAmount = totalAmount - newPaidAmount;

    const paymentStatus = newDueAmount <= 0
      ? 'Paid'
      : (newPaidAmount > 0 ? 'Partially Paid' : 'Unpaid');

      //console.log("💾 Correction : paid =", newPaidAmount, "| due =", newDueAmount);

      /*console.log("💾 On met à jour sales avec :", {
        paid: newPaidAmount,
        due: newDueAmount,
        status: paymentStatus
      });*/
      

    await db.query(
      `UPDATE sales SET paid_amount = ?, due_amount = ?, payment_status = ? WHERE id = ?`,
      [newPaidAmount, newDueAmount, paymentStatus, saleId]
    );

    req.session.successMessage = '✅ Paiement enregistré avec succès.';
    res.redirect('/sales/history');
  } catch (err) {
    console.error("💥 Erreur lors du paiement :", err);
    res.status(500).send("Erreur lors de l'enregistrement du paiement");
  }
};

exports.getPaymentsBySale = async (req, res) => {
  const { saleId } = req.params;
  try {
    const [payments] = await db.query(
      'SELECT * FROM payments WHERE sale_id = ? ORDER BY payment_date DESC',
      [saleId]
    );
    res.render('payments/list', { payments, saleId });
  } catch (err) {
    console.error(err);
    res.status(500).send("Erreur lors de la récupération des paiements.");
  }
};

exports.deletePayment = async (req, res) => {
  const { paymentId } = req.params;

  try {
    // Récupérer le paiement
    const [result] = await db.query('SELECT * FROM payments WHERE id = ?', [paymentId]);
    if (result.length === 0) {
      req.session.errorMessage = "Paiement introuvable.";
      return res.redirect('/sales/history');
    }

    const payment = result[0];
    const saleId = payment.sale_id;
    const amount = parseFloat(payment.amount_paid);

    // Supprimer le paiement
    await db.query('DELETE FROM payments WHERE id = ?', [paymentId]);

    // Recalculer les montants de la vente
    const [sales] = await db.query('SELECT * FROM sales WHERE id = ?', [saleId]);
    if (sales.length === 0) return res.redirect('/sales/history');

    const sale = sales[0];
    const newPaid = parseFloat(sale.paid_amount) - amount;
    const newDue = parseFloat(sale.total_amount) - newPaid;

    const paymentStatus = newPaid <= 0
      ? 'Unpaid'
      : (newDue <= 0 ? 'Paid' : 'Partially Paid');

    await db.query(
      'UPDATE sales SET paid_amount = ?, due_amount = ?, payment_status = ? WHERE id = ?',
      [newPaid, newDue, paymentStatus, saleId]
    );

    req.session.successMessage = '✅ Paiement annulé et vente mise à jour.';
    res.redirect(`/payments/sale/${saleId}`);
  } catch (err) {
    console.error(err);
    req.session.errorMessage = '❌ Une erreur est survenue lors de l\'annulation du paiement.';
    res.redirect('/sales/history');
  }
};

