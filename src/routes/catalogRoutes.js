const express = require('express');
const router = express.Router();
const catalogController = require('../controllers/catalogController');

router.get('/tables', catalogController.getTables);
router.post('/tables', catalogController.createTable);
router.delete('/tables/:id', catalogController.deleteTable);

router.get('/categories', catalogController.getCategories);
router.post('/categories', catalogController.createCategory);

router.get('/waiters', catalogController.getWaiters);
router.post('/waiters', catalogController.createWaiter);
router.delete('/waiters/:id', catalogController.deleteWaiter);

router.get('/modifiers', catalogController.getModifiers);
router.post('/modifiers', catalogController.createModifier);
router.delete('/modifiers/:id', catalogController.deleteModifier);

router.get('/products', catalogController.getProducts);
router.post('/products', catalogController.createProduct);
router.put('/products/:id', catalogController.updateProduct);
router.put('/products/:id/toggle', catalogController.toggleProduct); // LA NUEVA RUTA
router.delete('/products/:id', catalogController.deleteProduct);

router.post('/verify-pin', catalogController.verifyPinEndpoint);
router.post('/settings/pin', catalogController.changePin);

module.exports = router;