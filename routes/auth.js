const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.get('/login', authController.showLoginForm);
router.post('/login', authController.login);
router.get('/logout', authController.logout);

// Mot de passe oublié
router.get('/forgot-password', authController.showForgotPasswordForm);
router.post('/forgot-password', authController.sendResetLink);
router.get('/reset-password/:token', authController.showResetForm);
router.post('/reset-password/:token', authController.resetPassword);

module.exports = router;
