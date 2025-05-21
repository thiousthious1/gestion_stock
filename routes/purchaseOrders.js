const express = require('express');
const router = express.Router();
const purchaseOrderController = require('../controllers/purchaseOrderController');

router.get('/add', purchaseOrderController.showCreateForm);
router.post('/add', purchaseOrderController.create);
router.get('/', purchaseOrderController.list);
router.get('/:id', purchaseOrderController.view);
router.get('/:id/print', purchaseOrderController.print);
router.post('/:id/status', purchaseOrderController.updateStatus);
router.post('/:id/delete', purchaseOrderController.delete);

module.exports = router;
