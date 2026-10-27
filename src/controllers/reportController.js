const path = require('path');
const { round2 } = require('../utils/money');
const fs = require('fs');
const { dbGet, dbAll, dbRun, dbExec } = require('../utils/dbHelper');
const { verifyAdminPin } = require('../middleware/verifyPin');
const { calculateCorteData } = require('../services/reportService');
const cashService = require('../services/cashService');
const { emitUpdate } = require('../utils/emitUpdate');

const getCorte = async (req, res) => {
    try {
        const targetDate = req.query.date;
        if (!targetDate) {
            return res.status(400).json({ error: 'Fecha requerida para el corte.' });
        }

        const { summary, orders } = await calculateCorteData(targetDate);
        // Mesas aún sin cobrar: el reporte impreso avisa que no están incluidas
        const openRow = await dbGet(`SELECT COUNT(*) AS n FROM tables WHERE status = 'OCUPADA'`);
        res.json({
            date: targetDate,
            summary,
            orders,
            open_tables: openRow ? openRow.n : 0
        });
    } catch (err) {
        console.error('[ReportController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const addExpense = async (req, res) => {
    try {
        const { amount, concept, category } = req.body;
        const numericAmount = round2(amount);

        if (numericAmount <= 0) {
            return res.status(400).json({ error: 'El monto del gasto debe ser mayor a cero.' });
        }
        if (!concept || !String(concept).trim()) {
            return res.status(400).json({ error: 'El concepto del gasto es requerido.' });
        }

        const expenseRes = await dbRun(
            `INSERT INTO expenses (amount, concept, category, created_by, created_at) 
             VALUES (?, ?, ?, 'Admin', datetime('now', '-6 hours'))`,
            [numericAmount, concept, category]
        );

        await dbRun(
            `INSERT INTO audit_logs (action, details, performed_by, created_at) 
             VALUES (?, ?, ?, datetime('now', '-6 hours'))`,
            ['GASTO_REGISTRADO', `Retiro de $${numericAmount} para ${concept} (${category})`, 'Admin']
        );

        res.json({ message: 'Gasto registrado exitosamente', expenseId: expenseRes.lastID });
    } catch (err) {
        console.error('[ReportController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const deleteExpense = async (req, res) => {
    try {
        const { id } = req.params;
        const { pin } = req.body;

        const isPinValid = await verifyAdminPin(pin);
        if (!isPinValid) {
            return res.status(403).json({ error: 'PIN INCORRECTO' });
        }

        const expense = await dbGet(`SELECT * FROM expenses WHERE id = ?`, [id]);
        if (!expense) {
            return res.status(404).json({ error: 'Gasto no encontrado' });
        }

        await dbRun(`DELETE FROM expenses WHERE id = ?`, [id]);
        await dbRun(
            `INSERT INTO audit_logs (action, details, performed_by, created_at) 
             VALUES (?, ?, ?, datetime('now', '-6 hours'))`,
            ['ELIMINAR_GASTO', `Se anuló el gasto de $${expense.amount} (${expense.concept})`, 'Admin']
        );

        res.json({ message: 'Gasto cancelado exitosamente' });
    } catch (err) {
        console.error('[ReportController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const getFondo = async (req, res) => {
    try {
        const targetDate = req.query.date;
        const row = await dbGet(`SELECT value FROM settings WHERE key = ?`, [`fondo_${targetDate}`]);
        res.json({ fondo: row ? parseFloat(row.value) : 0 });
    } catch (err) {
        console.error('[ReportController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const setFondo = async (req, res) => {
    try {
        const { pin, date, amount } = req.body;
        const targetDate = date;

        const isPinValid = await verifyAdminPin(pin);
        if (!isPinValid) {
            return res.status(403).json({ error: 'PIN INCORRECTO' });
        }

        await dbRun(
            `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`,
            [`fondo_${targetDate}`, amount]
        );

        res.json({ message: 'Fondo guardado exitosamente' });
    } catch (err) {
        console.error('[ReportController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const backupDatabase = async (req, res) => {
    try {
        const { pin } = req.body;
        if (!pin) return res.status(400).json({ error: 'PIN requerido' });

        const isPinValid = await verifyAdminPin(pin);
        if (!isPinValid) {
            return res.status(403).json({ error: 'PIN INCORRECTO' });
        }

        // En modo WAL, forzamos un checkpoint completo para que el archivo .db contenga
        // todas las transacciones recientes antes de descargarlo.
        try {
            await dbExec('PRAGMA wal_checkpoint(TRUNCATE)');
        } catch (checkpointErr) {
            console.warn('Aviso: wal_checkpoint TRUNCATE no completó:', checkpointErr.message);
        }

        const { DB_PATH: dbPath } = require('../config/paths');
        const fecha = require('../utils/backup').localDate();

        res.download(dbPath, `Respaldo_Estampida_${fecha}.db`, (err) => {
            if (err && !res.headersSent) {
                console.error('Error al enviar el respaldo:', err);
                res.status(500).json({ error: 'Error al generar la descarga' });
            }
        });
    } catch (err) {
        console.error('[ReportController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

// Fecha del último respaldo automático diario (lo crea la app de escritorio en <datos>/respaldos)
const getBackupStatus = async (req, res) => {
    try {
        const { DATA_DIR } = require('../config/paths');
        let files = [];
        try {
            files = fs.readdirSync(path.join(DATA_DIR, 'respaldos')).filter(f => /^auto_\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
        } catch (_) { /* aún no existe la carpeta */ }
        res.json({ last_backup: files.length ? files[files.length - 1].slice(5, 15) : null, count: files.length });
    } catch (err) {
        console.error('[ReportController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const getAuditLogs = async (req, res) => {
    try {
        const targetDate = req.query.date;
        if (!targetDate) {
            return res.status(400).json({ error: 'Se requiere una fecha para la auditoría.' });
        }

        const rows = await dbAll(
            `SELECT * FROM audit_logs WHERE DATE(created_at) = ? ORDER BY id DESC`,
            [targetDate]
        );

        res.json({ logs: rows });
    } catch (err) {
        console.error('[ReportController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

// ========================================================
// CONTEO DE CAJA Y REPORTE MENSUAL
// ========================================================
const getCashCount = async (req, res) => {
    try {
        const { date } = req.query;
        if (!cashService.isDate(date)) return res.status(400).json({ error: 'Fecha inválida.' });
        res.json({ count: await cashService.getCashCount(date) });
    } catch (err) {
        console.error('[ReportController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const saveCashCount = async (req, res) => {
    try {
        const { date, denominations, next_fondo } = req.body;
        if (!cashService.isDate(date)) return res.status(400).json({ error: 'Fecha inválida.' });
        const result = await cashService.saveCashCount(date, denominations, next_fondo);
        emitUpdate(req);
        res.json(result);
    } catch (err) {
        if (err.status === 400) return res.status(400).json({ error: err.message });
        console.error('[ReportController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const getMonthly = async (req, res) => {
    try {
        const { month } = req.query;
        if (!cashService.isMonth(month)) return res.status(400).json({ error: 'Mes inválido (use AAAA-MM).' });
        res.json(await cashService.calculateMonthly(month));
    } catch (err) {
        console.error('[ReportController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const getMonthlyExcel = async (req, res) => {
    try {
        const { month } = req.query;
        if (!cashService.isMonth(month)) return res.status(400).json({ error: 'Mes inválido (use AAAA-MM).' });
        const report = await cashService.calculateMonthly(month);
        const buffer = await cashService.buildMonthlyWorkbook(report);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Ventas_Estampida_${month}.xlsx"`);
        res.send(Buffer.from(buffer));
    } catch (err) {
        console.error('[ReportController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

module.exports = {
    getCashCount,
    saveCashCount,
    getMonthly,
    getMonthlyExcel,
    getBackupStatus,
    getCorte,
    backupDatabase,
    getFondo,
    setFondo,
    addExpense,
    deleteExpense,
    getAuditLogs
};