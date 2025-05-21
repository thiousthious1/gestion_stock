const express = require('express');
const router = express.Router();
const purchaseController = require('../controllers/purchaseController');

/*router.get('/add', purchaseController.showAddForm);
router.post('/add', purchaseController.addPurchase);*/
router.get('/add', purchaseController.showAddPurchaseForm);
router.post('/add', purchaseController.addPurchase);
router.get('/details/:id', purchaseController.getPurchaseDetails);
router.get('/', purchaseController.listPurchases);
router.get('/edit/:id', purchaseController.editPurchase);
router.post('/delete/:id', purchaseController.deletePurchase);
router.post('/update/:id', purchaseController.updatePurchase);


// Rapports
router.get('/report/advanced', purchaseController.reportAdvanced);
router.post('/report/advanced/result', purchaseController.reportAdvancedResult);
router.get('/report/advanced/quick', purchaseController.reportAdvancedQuick);

// ✅ Version imprimable
router.get('/report/advanced/print', purchaseController.getAdvancedPurchaseReportPrint);

// ✅ Export Excel
router.get('/report/advanced/excel', purchaseController.getAdvancedPurchaseReportExcel);

router.get('/report/advanced/pdf', purchaseController.downloadAdvancedPurchaseReportPDF);


module.exports = router;
