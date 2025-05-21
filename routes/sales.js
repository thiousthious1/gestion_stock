// routes/sales.js
const express = require('express');
const router = express.Router();
const salesController = require('../controllers/salesController');
const invoiceController = require('../controllers/invoiceController');
const checkDayTime = require('../middlewares/checkDayTime');

// Afficher le formulaire d'ajout d'une vente
router.get('/add', checkDayTime,salesController.showAddSaleForm);

// Enregistrer une nouvelle vente
router.post('/add', checkDayTime,salesController.addSale);

// Historique complet des ventes
router.get('/history', salesController.getSalesHistory);
router.get('/:id/details', salesController.getSaleDetails);
router.get('/:id/edit', checkDayTime,salesController.showEditSaleForm);
router.post('/:id/edit', checkDayTime,salesController.updateSale);

router.post('/:id/mark-paid', salesController.markAsPaid);

router.get('/:id/invoice', invoiceController.generateInvoice);
router.get('/invoices/print/:id', invoiceController.printInvoicePage);
router.get('/invoices/ticket/:id', invoiceController.printTicket);
router.get('/invoices/ticket/pdf/:id', invoiceController.generateTicketPDF);

router.get('/report/advanced', salesController.reportAdvanced);
router.post('/report/advanced', salesController.reportAdvancedResult);
router.get('/report/advanced/print', salesController.getAdvancedSalesReportPrint);
router.get('/report/advanced/quick', salesController.reportAdvancedQuick);
router.get('/report/advanced/excel', salesController.reportAdvancedExportExcel);
router.get('/report/advanced/pdf', salesController.reportAdvancedExportPDF);





module.exports = router;
