const express = require('express');
const router = express.Router();
const supplierController = require('../controllers/supplierController');

router.get('/', supplierController.listSuppliers);
router.get('/add', supplierController.showAddForm);
router.post('/add', supplierController.addSupplier);  // classique

// ✅ Route AJAX
router.post('/ajax-add', supplierController.addSupplierAjax);

router.get('/edit/:id', supplierController.showEditForm);
router.post('/edit/:id', supplierController.updateSupplier);
router.get('/delete/:id', supplierController.deleteSupplier);
router.get('/:id/history', supplierController.viewSupplierPurchases);

module.exports = router;
