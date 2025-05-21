const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');

// Affiche tous les produits
router.get('/', productController.listProducts);

// Affiche le formulaire d'ajout
router.get('/add', productController.showAddForm);

// Traite l'ajout classique (formulaire HTML)
router.post('/add', productController.addProduct);

// Traite l'ajout rapide AJAX (drawer)
router.post('/ajax-add', productController.addProductAjax);

// Formulaire de modification
router.get('/edit/:id', productController.showEditForm);

// Traite la modification
router.post('/edit/:id', productController.updateProduct);

// Supprime un produit
router.get('/delete/:id', productController.deleteProduct);

// Mise à jour rapide d'un champ (inline edit)
router.post('/update-field', productController.updateFieldInline);

router.get('/report/advanced', productController.getAdvancedStockReport);

router.get('/report/advanced/print', productController.getAdvancedStockReportPrint);

router.get('/report/stock-movement', productController.getStockMovementReport);

router.get('/report/stock-movement/print', productController.getStockMovementReportPrint);


module.exports = router;
