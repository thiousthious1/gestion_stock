const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

// Affiche le formulaire d'ajout de paiement
router.get('/sales/:saleId/add', paymentController.showAddPaymentForm);

// Traite le paiement soumis
router.post('/sales/:saleId/add', paymentController.addPayment);

// Afficher les paiements d'une vente
router.get('/sale/:saleId', paymentController.getPaymentsBySale);

// Supprimer un paiement
router.post('/:paymentId/delete', paymentController.deletePayment);

module.exports = router;
