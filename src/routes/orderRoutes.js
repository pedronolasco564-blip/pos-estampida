const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');

router.get('/table/:tableId', orderController.getTableOrder);
// NUEVA RUTA: Buscar una orden específica por su ID
router.get('/:id', orderController.getOrderById);

router.post('/', orderController.createOrder);
router.post('/:id/items', orderController.addItemsToOrder);
router.post('/:id/pay', orderController.payOrder);
router.post('/:orderId/cancel-item/:itemId', orderController.cancelItem);
router.post('/:id/cancel-order', orderController.cancelOrder);
router.put('/:id/transfer', orderController.transferOrder);
router.post('/:id/discount', orderController.applyDiscount);
router.post('/:id/reopen', orderController.reopenOrder);
router.put('/:id/invoice-status', orderController.toggleInvoiceStatus);
router.put('/:id/pax', orderController.updatePax);

module.exports = router;