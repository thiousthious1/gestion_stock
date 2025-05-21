const express = require('express');
const router = express.Router();
const purchaseReturnController = require('../controllers/purchaseReturnController');

router.get('/', purchaseReturnController.listReturns);
router.get('/add', purchaseReturnController.showAddForm);
router.post('/add', purchaseReturnController.addReturn);
router.get('/products/:id', purchaseReturnController.getPurchaseProducts);
router.get('/view/:id', purchaseReturnController.viewReturn);


module.exports = router;
