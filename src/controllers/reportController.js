const path = require('path');
const { dbGet, dbAll, dbRun, dbExec } = require('../utils/dbHelper');
const { verifyAdminPin } = require('../middleware/verifyPin');
const { calculateCorteData } = require('../services/reportService');

let printerService = null;
try {
    printerService = require('../services/printerService');
} catch (e) {
    console.log("Aviso: Módulo de impresora no cargado.");
}

const getCorte = async (req, res) => {
    try {
        const targetDate = req.query.date;
        if (!targetDate) {
            return res.status(400).json({ error: 'Fecha requerida para el corte.' });
        }

        const { summary, orders } = await calculateCorteData(targetDate);
        res.json({
            date: targetDate,
            summary,
            orders
        });
    } catch (err) {
        console.error('[ReportController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const printCorte = async (req, res) => {
    try {
        const targetDate = req.query.date;
        if (!targetDate) {
            return res.status(400).json({ error: 'Fecha requerida para el corte.' });
        }

        const openTablesRow = await dbGet(`SELECT COUNT(*) as open_tables FROM tables WHERE status = 'OCUPADA'`);
        const openTables = openTablesRow ? openTablesRow.open_tables : 0;
        if (openTables > 0) {
            return res.status(400).json({
                error: `CORTE BLOQUEADO. Aún tienes ${openTables} mesa(s) abierta(s) o sin cobrar en el piso.`
            });
        }

        const { summary } = await calculateCorteData(targetDate);

        if (printerService && printerService.printCorteZ) {
            printerService.printCorteZ(targetDate, summary);
        } else {
            console.log(`\n[ 🖨️ CORTE IMPRESO: Ventas $${summary.total_general}, Gastos $${summary.total_gastos} ]\n`);
        }

        res.json({ message: 'Corte enviado a impresión' });
    } catch (err) {
        console.error('[ReportController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const addExpense = async (req, res) => {
    try {
        const { amount, concept, category } = req.body;
        const numericAmount = Number(amount) || 0;

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
        const fecha = new Date().toISOString().split('T')[0];

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

module.exports = {
    getCorte,
    printCorte,
    backupDatabase,
    getFondo,
    setFondo,
    addExpense,
    deleteExpense,
    getAuditLogs
};