const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { requireAdmin } = require('../middleware/adminSession');
const { pinAttemptLimiter } = require('../middleware/verifyPin');

// Todo el módulo de reportes es del panel de administración.
router.use(requireAdmin);

router.get('/corte', reportController.getCorte);
router.post('/backup', pinAttemptLimiter, reportController.backupDatabase);
router.post('/expenses', reportController.addExpense);
router.post('/expenses/:id/delete', pinAttemptLimiter, reportController.deleteExpense);
router.get('/fondo', reportController.getFondo);
router.post('/fondo', reportController.setFondo);
router.get('/audit', reportController.getAuditLogs);
router.get('/backup-status', reportController.getBackupStatus);
router.get('/cash-count', reportController.getCashCount);
router.post('/cash-count', reportController.saveCashCount);
router.get('/monthly', reportController.getMonthly);
router.get('/monthly.xlsx', reportController.getMonthlyExcel);

module.exports = router;
