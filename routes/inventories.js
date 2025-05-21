const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');

// Liste des inventaires
router.get('/', inventoryController.getAllInventories);

// Formulaire création
router.get('/add', inventoryController.showAddForm);

// Traitement création
router.post('/add', inventoryController.addInventory);

// Voir un inventaire (page détail)
router.get('/view/:id', inventoryController.viewInventory);

// Export PDF
router.get('/export/:id', inventoryController.exportToPDF);

router.get('/print/:id', inventoryController.printInventory);

router.get('/edit/:id', inventoryController.showEditForm);
router.post('/edit/:id', inventoryController.updateInventory);
router.get('/delete/:id', inventoryController.deleteInventory);
router.get('/report/pdf', inventoryController.exportReportPDF);



module.exports = router;
