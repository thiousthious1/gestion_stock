const express = require('express');
const router = express.Router();
const purchasePaymentController = require('../controllers/purchasePaymentController');

router.get('/', purchasePaymentController.listPayments);
router.get('/add', purchasePaymentController.showAddForm);
router.post('/add', purchasePaymentController.addPayment);
router.get('/edit/:id', purchasePaymentController.editPayment);
router.post('/update/:id', purchasePaymentController.updatePayment);
router.post('/delete/:id', purchasePaymentController.deletePayment);


module.exports = router;
