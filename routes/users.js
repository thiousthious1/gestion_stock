const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// Liste
router.get('/', userController.listUsers);

// Formulaires
router.get('/add', userController.showAddForm);
router.post('/create', userController.uploadAvatar, userController.createUser);
router.get('/edit/:id', userController.showEditForm);
router.post('/update/:id', userController.uploadAvatar, userController.updateUser);


// Suppression
router.get('/delete/:id', userController.deleteUser);

module.exports = router;
