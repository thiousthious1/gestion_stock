const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');

// Affiche toutes les catégories + formulaire d’ajout
router.get('/', categoryController.getAllCategories);

// Traitement du formulaire d’ajout
router.post('/add', categoryController.addCategory);

// Suppression d’une catégorie
router.get('/delete/:id', categoryController.deleteCategory);

module.exports = router;
