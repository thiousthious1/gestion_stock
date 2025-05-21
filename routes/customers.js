const express = require('express');
const router = express.Router();
const customersController = require('../controllers/customersController');

// ✅ Import pour multer (upload fichier)
const multer = require('multer');
const upload = multer({ dest: 'uploads/' }); // dossier temporaire

// === ROUTES CLIENTS ===

// Liste des clients
router.get('/', customersController.getAllCustomers);

// Ajout standard
router.post('/add', customersController.addCustomer);

// Ajout rapide via AJAX
router.post('/ajax-add', customersController.addCustomerAjax);

// Modification
router.get('/edit/:id', customersController.getEditCustomer);
router.post('/edit/:id', customersController.updateCustomer);

// Suppression
router.get('/delete/:id', customersController.deleteCustomer);

// ✅ Affiche le formulaire d'import
router.get('/import', (req, res) => res.render('customers/import'));

// ✅ Traite l'import de fichier
router.post('/import', upload.single('file'), customersController.importContacts);

module.exports = router;
