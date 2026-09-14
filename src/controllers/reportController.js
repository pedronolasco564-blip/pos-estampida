const db = require('../config/db');
const path = require('path');
const crypto = require('crypto');

let printerService = null;
try { printerService = require('../services/printerService'); } catch(e) { console.log("Aviso: Módulo de impresora no cargado."); }

const getCorte = (req, res) => {
    const targetDate = req.query.date; 

    const ordersQuery = `SELECT o.*, t.table_number FROM orders o JOIN tables t ON o.table_id = t.id WHERE o.status = 'PAGADA' AND DATE(o.closed_at) = ?`;

    db.all(ordersQuery, [targetDate], (err, orders) => {
        if (err) return res.status(500).json({ error: err.message });

        // 🛑 AQUÍ QUITAMOS EL LOCALTIME PORQUE YA ESTÁ GUARDADO CON LA HORA CORRECTA
        db.all(`SELECT * FROM expenses WHERE DATE(created_at) = ?`, [targetDate], (err, expRows) => {
            let totalGastos = 0;
            let desgloseGastos = [];
            
            if (expRows && expRows.length > 0) {
                expRows.forEach(row => {
                    totalGastos += row.amount;
                    desgloseGastos.push(row);
                });
            }

            let totalGeneral = 0; let numTickets = orders.length; let ventasPorMesero = {};
            let totalEfectivo = 0; let totalTarjeta = 0; 
            let propinasEfectivo = 0; let propinasTarjeta = 0;
            // === NUEVAS VARIABLES ===
            let totalLlevar = 0; let totalComedor = 0;

            orders.forEach(o => {
                totalGeneral += o.total;
                if (!ventasPorMesero[o.waiter_name]) ventasPorMesero[o.waiter_name] = { total: 0, tickets: 0 };
                ventasPorMesero[o.waiter_name].total += o.total;
                ventasPorMesero[o.waiter_name].tickets += 1;

                let propina = o.tip_amount || 0;
                if (o.payment_method === 'EFECTIVO') {
                    totalEfectivo += o.total; propinasEfectivo += propina;
                } else {
                    totalTarjeta += o.total; propinasTarjeta += propina;
                }

                // === CLASIFICADOR DE MESAS ===
                if (o.table_number && o.table_number.toUpperCase().includes('LLEVAR')) {
                    totalLlevar += o.total;
                } else {
                    totalComedor += o.total;
                }
            });

            res.json({ 
                date: targetDate, 
                summary: { 
                    total_general: totalGeneral, total_efectivo: totalEfectivo, total_tarjeta: totalTarjeta,
                    propinas_efectivo: propinasEfectivo, propinas_tarjeta: propinasTarjeta, 
                    total_gastos: totalGastos, desglose_gastos: desgloseGastos,
                    total_llevar: totalLlevar, total_comedor: totalComedor, // ENVIANDO AL FRONTEND
                    num_tickets: numTickets, ventas_por_mesero: ventasPorMesero 
                }, 
                orders: orders 
            });
        });
    });
};

const printCorte = (req, res) => {
    const targetDate = req.query.date; 

    db.get(`SELECT COUNT(*) as open_tables FROM tables WHERE status = 'OCUPADA'`, [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row.open_tables > 0) return res.status(400).json({ error: `CORTE BLOQUEADO. Aún tienes ${row.open_tables} mesa(s) abierta(s) o sin cobrar en el piso.` });

        const ordersQuery = `SELECT o.*, t.table_number FROM orders o JOIN tables t ON o.table_id = t.id WHERE o.status = 'PAGADA' AND DATE(o.closed_at) = ?`;
        db.all(ordersQuery, [targetDate], (err, orders) => {
            if (err) return res.status(500).json({ error: err.message });
            
            db.get(`SELECT SUM(amount) as total_gastos FROM expenses WHERE DATE(created_at) = ?`, [targetDate], (err, expRow) => {
                let totalGastos = expRow ? (expRow.total_gastos || 0) : 0;
                let totalGeneral = 0; let numTickets = orders.length; let ventasPorMesero = {};
                let totalEfectivo = 0; let totalTarjeta = 0; 
                let propinasEfectivo = 0; let propinasTarjeta = 0;
                // === NUEVAS VARIABLES ===
                let totalLlevar = 0; let totalComedor = 0;

                orders.forEach(o => {
                    totalGeneral += o.total;
                    if (!ventasPorMesero[o.waiter_name]) ventasPorMesero[o.waiter_name] = { total: 0, tickets: 0 };
                    ventasPorMesero[o.waiter_name].total += o.total;
                    ventasPorMesero[o.waiter_name].tickets += 1;

                    let propina = o.tip_amount || 0;
                    if (o.payment_method === 'EFECTIVO') { totalEfectivo += o.total; propinasEfectivo += propina; } 
                    else { totalTarjeta += o.total; propinasTarjeta += propina; }
                    
                    // === CLASIFICADOR DE MESAS ===
                    if (o.table_number && o.table_number.toUpperCase().includes('LLEVAR')) {
                        totalLlevar += o.total;
                    } else {
                        totalComedor += o.total;
                    }
                });

                const summary = { 
                    total_general: totalGeneral, total_efectivo: totalEfectivo, total_tarjeta: totalTarjeta,
                    propinas_efectivo: propinasEfectivo, propinas_tarjeta: propinasTarjeta, total_gastos: totalGastos,
                    total_llevar: totalLlevar, total_comedor: totalComedor, // ENVIANDO A LA IMPRESORA
                    num_tickets: numTickets, ventas_por_mesero: ventasPorMesero 
                };
                
                if (printerService && printerService.printCorteZ) printerService.printCorteZ(targetDate, summary);
                else console.log(`\n[ 🖨️  CORTE IMPRESO: Ventas $${totalGeneral}, Gastos $${totalGastos} ]\n`);
                
                res.json({ message: 'Corte enviado a impresión' });
            });
        });
    });
};

const addExpense = (req, res) => {
    const { amount, concept, category } = req.body;
    // 🛑 AQUÍ BLINDAMOS LOS GASTOS A HORA DE MÉXICO TUXTEPEC
    db.run(`INSERT INTO expenses (amount, concept, category, created_by, created_at) VALUES (?, ?, ?, 'Admin', datetime('now', '-6 hours'))`, [amount, concept, category], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        
        db.run(`INSERT INTO audit_logs (action, details, performed_by, created_at) VALUES (?, ?, ?, datetime('now', '-6 hours'))`, ['GASTO_REGISTRADO', `Retiro de $${amount} para ${concept} (${category})`, 'Admin']);
        res.json({ message: 'Gasto registrado exitosamente', expenseId: this.lastID });
    });
};

const backupDatabase = (req, res) => {
    const { pin } = req.body;
    if (!pin) return res.status(400).json({ error: 'PIN requerido' });

    const hash = crypto.createHash('sha256').update(pin).digest('hex');
    db.get(`SELECT value FROM settings WHERE key = 'admin_pin'`, [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row || row.value !== hash) return res.status(403).json({ error: 'PIN INCORRECTO' });

        const dbPath = path.resolve(__dirname, '../../pos_restaurante.db');
        const fecha = new Date().toISOString().split('T')[0];
        
        res.download(dbPath, `Respaldo_Estampida_${fecha}.db`, (err) => {
            if (err) console.error('Error al enviar el respaldo:', err);
        });
    });
};

const getFondo = (req, res) => {
    const targetDate = req.query.date;
    db.get(`SELECT value FROM settings WHERE key = ?`, [`fondo_${targetDate}`], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ fondo: row ? parseFloat(row.value) : 0 });
    });
};

const setFondo = (req, res) => {
    const { pin, date, amount } = req.body; 
    const targetDate = date;
    const hash = crypto.createHash('sha256').update(pin || '').digest('hex');
    db.get(`SELECT value FROM settings WHERE key = 'admin_pin'`, [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row || row.value !== hash) return res.status(403).json({ error: 'PIN INCORRECTO' });
        db.run(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [`fondo_${targetDate}`, amount], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Fondo guardado exitosamente' });
        });
    });
};

module.exports = { getCorte, printCorte, backupDatabase, getFondo, setFondo, addExpense };