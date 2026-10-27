const express = require('express');
const router = express.Router();
const catalogController = require('../controllers/catalogController');

const { requireAdmin } = require('../middleware/adminSession');
const { pinAttemptLimiter } = require('../middleware/verifyPin');

router.get('/tables', catalogController.getTables);
router.post('/tables', requireAdmin, catalogController.createTable);
router.delete('/tables/:id', requireAdmin, catalogController.deleteTable);

router.get('/categories', catalogController.getCategories);
router.post('/categories', requireAdmin, catalogController.createCategory);

router.get('/waiters', catalogController.getWaiters);
router.post('/waiters', requireAdmin, catalogController.createWaiter);
router.delete('/waiters/:id', requireAdmin, catalogController.deleteWaiter);

router.get('/modifiers', catalogController.getModifiers);
router.post('/modifiers', requireAdmin, catalogController.createModifier);
router.delete('/modifiers/:id', requireAdmin, catalogController.deleteModifier);

router.get('/products', catalogController.getProducts);
router.post('/products', requireAdmin, catalogController.createProduct);
router.put('/products/:id', requireAdmin, catalogController.updateProduct);
router.put('/products/:id/toggle', requireAdmin, catalogController.toggleProduct);
router.delete('/products/:id', requireAdmin, catalogController.deleteProduct);

router.post('/verify-pin', pinAttemptLimiter, catalogController.verifyPinEndpoint);
router.get('/session', requireAdmin, (req, res) => res.json({ success: true }));
router.post('/logout', catalogController.logoutAdmin);
router.post('/settings/pin', requireAdmin, pinAttemptLimiter, catalogController.changePin);

module.exports = router;