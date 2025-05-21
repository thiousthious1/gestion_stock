const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');

router.get('/summary', reportController.getGlobalSummaryReport);

router.get('/summary/print', reportController.getGlobalSummaryReportPrint);

router.get('/sales', reportController.getSimpleSalesReport);

router.get('/purchases', reportController.getSimplePurchasesReport);

router.get('/stock', reportController.getSimpleStockReport);

router.get('/sales/print', reportController.getSimpleSalesReportPrint);
router.get('/purchases/print', reportController.getSimplePurchasesReportPrint);
router.get('/stock/print', reportController.getSimpleStockReportPrint);



module.exports = router;
