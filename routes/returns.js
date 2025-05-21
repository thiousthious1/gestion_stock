const express = require('express');
const router = express.Router();
const returnController = require('../controllers/returnController');

router.get('/', returnController.listReturns);
router.get('/add', returnController.showReturnForm);
router.post('/add', returnController.submitReturn);

module.exports = router;
