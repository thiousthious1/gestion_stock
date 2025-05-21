const express = require('express');
const router = express.Router();
const deliveryNoteController = require('../controllers/deliveryNoteController');

// ✅ Liste des bons de livraison
router.get('/', deliveryNoteController.list);

// ✅ Ajouter un bon à partir d'une vente
router.get('/add/:saleId', deliveryNoteController.addForm);
router.post('/add/:saleId', deliveryNoteController.create);

// ✅ Voir les détails d’un bon
router.get('/:id', deliveryNoteController.view);

// ✅ Imprimer un bon
router.get('/:id/print', deliveryNoteController.print);

// ✅ Supprimer un bon
router.post('/:id/delete', deliveryNoteController.delete);
router.get('/:id/edit', deliveryNoteController.editForm);
router.post('/:id/update', deliveryNoteController.update);

module.exports = router;
