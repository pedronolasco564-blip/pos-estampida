const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const draftController = require('../controllers/draftController');
const { verifyPinMiddleware, pinAttemptLimiter } = require('../middleware/verifyPin');

router.get('/table/:tableId', orderController.getTableOrder);
// Borradores: platillos tomados que aún no se envían a cocina
router.get('/drafts/:tableId', draftController.getDraft);
router.put('/drafts/:tableId', draftController.saveDraft);
// NUEVA RUTA: Buscar una orden específica por su ID
router.get('/:id', orderController.getOrderById);

router.post('/', orderController.createOrder);
router.post('/:id/items', orderController.addItemsToOrder);
router.post('/:id/pay', orderController.payOrder);
router.post('/:orderId/cancel-item/:itemId', pinAttemptLimiter, verifyPinMiddleware, orderController.cancelItem);
router.post('/:id/cancel-order', pinAttemptLimiter, verifyPinMiddleware, orderController.cancelOrder);
router.put('/:id/transfer', orderController.transferOrder);
router.post('/:id/discount', pinAttemptLimiter, verifyPinMiddleware, orderController.applyDiscount);
router.post('/:id/reopen', pinAttemptLimiter, verifyPinMiddleware, orderController.reopenOrder);
router.put('/:id/invoice-status', orderController.toggleInvoiceStatus);
router.put('/:id/pax', orderController.updatePax);

module.exports = router;