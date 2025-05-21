const express = require('express');
const router = express.Router();
const permissionController = require('../controllers/permissionController');

// Affiche le formulaire
router.get('/add', permissionController.showAddForm);

// Traitement du POST
router.post('/add', permissionController.addPermission);

module.exports = router;
