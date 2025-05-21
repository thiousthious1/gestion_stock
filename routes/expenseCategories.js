const express = require('express');
const router = express.Router();
const expenseCategoryController = require('../controllers/expenseCategoryController');

// Liste des catégories
router.get('/', expenseCategoryController.getAllCategories);

// Formulaire ajout
router.get('/add', expenseCategoryController.showAddForm);

// Traitement ajout
router.post('/add', expenseCategoryController.addCategory);

// Formulaire édition
router.get('/edit/:id', expenseCategoryController.showEditForm);

// Traitement édition
router.post('/edit/:id', expenseCategoryController.updateCategory);

// Suppression
router.get('/delete/:id', expenseCategoryController.deleteCategory);


module.exports = router;
