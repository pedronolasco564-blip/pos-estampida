const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');

router.get('/corte', reportController.getCorte);
router.post('/corte/print', reportController.printCorte);
router.post('/backup', reportController.backupDatabase); // <- ESTA ES LA PUERTA DEL RESPALDO
router.post('/expenses', reportController.addExpense);
router.post('/expenses/:id/delete', reportController.deleteExpense); // 💡 NUEVA
router.get('/fondo', reportController.getFondo);
router.post('/fondo', reportController.setFondo);

router.get('/audit', (req, res) => {
    const db = require('../config/db');
    const targetDate = req.query.date; // Cacha la fecha que manda el navegador
    
    if (!targetDate) {
        return res.status(400).json({ error: 'Se requiere una fecha para la auditoría.' });
    }

    // Filtra el historial usando la fecha extraída
    db.all("SELECT * FROM audit_logs WHERE DATE(created_at) = ? ORDER BY id DESC", [targetDate], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ logs: rows });
    });
});

module.exports = router;