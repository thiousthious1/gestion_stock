const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const multer = require('multer');
const path = require('path');

// === CONFIGURATION UPLOAD (Multer) ===

// Destination de stockage des fichiers
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/expenses');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

const upload = multer({ storage: storage });

// === ROUTES ===

// Liste des dépenses
router.get('/', expenseController.getAllExpenses);

// Formulaire ajout dépense
router.get('/add', expenseController.showAddForm);

// Traitement ajout dépense (avec fichier upload)
router.post('/add', upload.single('attachment'), expenseController.addExpense);

// Formulaire édition
router.get('/edit/:id', expenseController.showEditForm);

// Traitement édition (avec upload pièce jointe possible)
router.post('/edit/:id', upload.single('attachment'), expenseController.updateExpense);

// Suppression
router.get('/delete/:id', expenseController.deleteExpense);

router.get('/report/advanced', expenseController.getAdvancedExpenseReport);
router.get('/report/advanced/print', expenseController.getAdvancedExpenseReportPrint);

module.exports = router;
