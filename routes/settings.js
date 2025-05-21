const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const multer = require('multer');
const path = require('path');

// Config upload photo
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/users');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

router.get('/profile/:id', settingsController.profileSettings);
router.post('/profile/:id', upload.single('avatar'), settingsController.saveProfileSettings);

router.get('/', settingsController.getSettingsForm);
router.post('/', settingsController.uploadMiddleware, settingsController.saveSettings);
router.get('/company', settingsController.companySettings);

// 🔹 Modes de paiement
router.get('/payment-modes', settingsController.listPaymentModes);
router.post('/payment-modes/add', settingsController.addPaymentMode);
router.post('/payment-modes/edit/:id', settingsController.updatePaymentMode);
router.post('/payment-modes/delete/:id', settingsController.deletePaymentMode);

// 🔹 Unités
router.get('/units', settingsController.listUnits);
router.post('/units/add', settingsController.addUnit);
router.post('/units/edit/:id', settingsController.editUnit);
router.post('/units/delete/:id', settingsController.deleteUnit);

router.get('/email', settingsController.getEmailSettings);
router.post('/email', settingsController.saveEmailSettings);
router.post('/email/test', settingsController.sendTestEmail);

// Rôles & Permissions
router.get('/roles', settingsController.listRoles); // affichage liste
router.post('/roles', settingsController.createRole); // ajout rôle + permissions

router.get('/roles/edit/:id', settingsController.editRoleForm);
router.post('/roles/update/:id', settingsController.updateRole);
router.get('/roles/delete/:id', settingsController.deleteRole);
router.get('/other', settingsController.getOtherSettings);
router.post('/other', settingsController.saveOtherSettings);
router.post('/toggle-day-status', settingsController.toggleDayStatus);
router.get('/day-status', settingsController.getDayStatus);




module.exports = router;