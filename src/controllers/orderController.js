const db = require('../config/db');
const crypto = require('crypto');

function verifyPin(inputPin, res, callback) {
    const hash = crypto.createHash('sha256').update(inputPin || '').digest('hex');
    db.get(`SELECT value FROM settings WHERE key = 'admin_pin'`, [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row || row.value !== hash) return res.status(403).json({ error: 'PIN INCORRECTO' });
        callback(); 
    });
}

const getTableOrder = (req, res) => {
    const { tableId } = req.params;
    db.get(`SELECT * FROM orders WHERE table_id = ? AND status = 'ABIERTA'`, [tableId], (err, order) => {
        if (err) return res.status(500).json({ error: err.message });
        req.app.get('io').emit('update-tables');
        if (!order) return res.json({ order: null });

        db.all(`SELECT oi.*, p.name, p.price FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?`, [order.id], (err, items) => {
            if (err) return res.status(500).json({ error: err.message });
            order.items = items;
            req.app.get('io').emit('update-tables');
            res.json({ order });
        });
    });
};

const getOrderById = (req, res) => {
    const { id } = req.params;
    db.get(`SELECT * FROM orders WHERE id = ?`, [id], (err, order) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!order) return res.status(404).json({ error: 'Orden no encontrada' });

        db.all(`SELECT oi.*, p.name, p.price FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?`, [id], (err, items) => {
            if (err) return res.status(500).json({ error: err.message });
            order.items = items;
            req.app.get('io').emit('update-tables');
            res.json({ order });
        });
    });
};

const createOrder = (req, res) => {
    const { table_id, waiter_name, items, is_printed, guests } = req.body;
    const printNote = is_printed === false ? ' (Ahorro papel: Sin imprimir)' : '';

    db.run(`UPDATE tables SET status = 'OCUPADA' WHERE id = ?`, [table_id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        db.run(`INSERT INTO orders (table_id, waiter_name, guests) VALUES (?, ?, ?)`, [table_id, waiter_name, guests], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            const orderId = this.lastID;
            const stmt = db.prepare(`INSERT INTO order_items (order_id, product_id, quantity, notes, is_takeaway, extra_price, paid) VALUES (?, ?, ?, ?, ?, ?, 0)`);
            items.forEach(item => stmt.run(orderId, item.product_id, item.quantity, item.notes || '', item.is_takeaway ? 1 : 0, item.extra_price || 0));
            stmt.finalize();
            updateOrderTotal(orderId);
            
            db.run(`INSERT INTO audit_logs (action, details, performed_by) VALUES (?, ?, ?)`, 
                ['CREAR_ORDEN', `Orden #${orderId} abierta en Mesa ID ${table_id}${printNote}`, waiter_name]);
            
            res.status(201).json({ message: 'Orden creada', orderId });
        });
    });
};

const addItemsToOrder = async (req, res) => {
    const { id } = req.params;
    const { items, is_printed } = req.body;
    const printNote = is_printed === false ? ' (Ahorro papel: Sin imprimir)' : '';

    try {
        // Usamos un ciclo asíncrono para agrupar inteligentemente en la base de datos
        for (let item of items) {
            await new Promise((resolve, reject) => {
                // 1. Buscamos si ya existe EXACTAMENTE el mismo platillo (mismo id, sin pagar y con las mismas notas)
                db.get(
                    `SELECT id FROM order_items WHERE order_id = ? AND product_id = ? AND notes = ? AND is_takeaway = ? AND extra_price = ? AND paid = 0`,
                    [id, item.product_id, item.notes || '', item.is_takeaway ? 1 : 0, item.extra_price || 0],
                    (err, row) => {
                        if (err) return reject(err);
                        
                        if (row) {
                            // 2. Si ya existe, NO creamos otro renglón, solo sumamos la cantidad al existente
                            db.run(`UPDATE order_items SET quantity = quantity + ? WHERE id = ?`, [item.quantity, row.id], (err) => {
                                if (err) reject(err); else resolve();
                            });
                        } else {
                            // 3. Si no existe (o tiene una nota especial distinta), creamos un renglón nuevo
                            db.run(
                                `INSERT INTO order_items (order_id, product_id, quantity, notes, is_takeaway, extra_price, paid) VALUES (?, ?, ?, ?, ?, ?, 0)`,
                                [id, item.product_id, item.quantity, item.notes || '', item.is_takeaway ? 1 : 0, item.extra_price || 0],
                                (err) => {
                                    if (err) reject(err); else resolve();
                                }
                            );
                        }
                    }
                );
            });
        }

        // Actualizamos el gran total de la mesa
        updateOrderTotal(id);

        db.get(`SELECT waiter_name FROM orders WHERE id = ?`, [id], (err, order) => {
            const waiter = order ? order.waiter_name : 'Sistema';
            db.run(`INSERT INTO audit_logs (action, details, performed_by) VALUES (?, ?, ?)`, 
                ['AGREGAR_ITEMS', `Se agregaron platillos a la Orden #${id}${printNote}`, waiter]);
        });
        
        req.app.get('io').emit('update-tables');
        res.json({ message: 'Items agregados y agrupados correctamente' });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const payOrder = (req, res) => {
    const { id } = req.params;
    const { payment_method, amount_paid, items_to_pay, tip_amount = 0, needs_invoice = false } = req.body;
    const invoiceFlag = needs_invoice ? 1 : 0;

    db.get(`SELECT * FROM orders WHERE id = ?`, [id], (err, order) => {
        if (err || !order) return res.status(500).json({ error: 'Orden no encontrada' });
        
        const processItems = async () => {
            if (!items_to_pay || items_to_pay.length === 0) return;
            for (let it of items_to_pay) {
                await new Promise((resolve) => {
                    db.get(`SELECT * FROM order_items WHERE id = ?`, [it.id], (err, row) => {
                        if (row && row.paid === 0) {
                            if (row.quantity === it.qty) {
                                db.run(`UPDATE order_items SET paid = 1 WHERE id = ?`, [it.id], resolve);
                            } else if (row.quantity > it.qty) {
                                db.run(`UPDATE order_items SET quantity = ? WHERE id = ?`, [row.quantity - it.qty, it.id], () => {
                                    db.run(`INSERT INTO order_items (order_id, product_id, quantity, notes, is_takeaway, extra_price, paid) VALUES (?, ?, ?, ?, ?, ?, 1)`, 
                                        [row.order_id, row.product_id, it.qty, row.notes, row.is_takeaway, row.extra_price], resolve);
                                });
                            } else { resolve(); }
                        } else { resolve(); }
                    });
                });
            }
        };

        processItems().then(() => {
            let currentBalance = (order.remaining_balance !== null && order.remaining_balance !== undefined) ? order.remaining_balance : order.total;
            const newBalance = currentBalance - amount_paid;
            
            if (newBalance <= 0) {
                const change = Math.abs(newBalance);
                // 🛑 AQUÍ ESTÁ EL BLINDAJE DE ZONA HORARIA A -6 HORAS EXACTAS
                db.run(`UPDATE orders SET status = 'PAGADA', payment_method = ?, amount_paid = ?, change_amount = ?, remaining_balance = 0, tip_amount = IFNULL(tip_amount, 0) + ?, needs_invoice = ?, closed_at = datetime('now', '-6 hours') WHERE id = ?`, 
                    [payment_method, amount_paid, change, tip_amount, invoiceFlag, id], function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    db.run(`UPDATE tables SET status = 'LIBRE' WHERE id = ?`, [order.table_id]);
                    req.app.get('io').emit('update-tables');
                    res.json({ message: 'Orden pagada por completo', change, fully_paid: true });
                });
            } else {
                db.run(`UPDATE orders SET remaining_balance = ?, tip_amount = IFNULL(tip_amount, 0) + ?, needs_invoice = ? WHERE id = ?`, [newBalance, tip_amount, invoiceFlag, id], function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    req.app.get('io').emit('update-tables');
                    res.json({ message: 'Cobro exitoso', remaining_balance: newBalance, fully_paid: false });
                });
            }
        });
    });
};

function updateOrderTotal(orderId, callback) {
    db.get(`SELECT total, remaining_balance, discount_amount FROM orders WHERE id = ?`, [orderId], (err, orderRow) => {
        const oldTotal = orderRow ? orderRow.total : 0;
        const oldRemaining = orderRow ? orderRow.remaining_balance : 0;
        const discount = orderRow ? (orderRow.discount_amount || 0) : 0;

        db.get(`SELECT SUM(oi.quantity * (p.price + IFNULL(oi.extra_price, 0))) as new_total FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?`, [orderId], (err, row) => {
            let newTotal = (row ? (row.new_total || 0) : 0) - discount;
            if (newTotal < 0) newTotal = 0; 
            
            const difference = newTotal - oldTotal;
            let newRemaining = oldRemaining + difference; 
            if (newRemaining < 0) newRemaining = 0;

            db.run(`UPDATE orders SET total = ?, remaining_balance = ? WHERE id = ?`, [newTotal, newRemaining, orderId], () => {
                if (callback) callback();
            });
        });
    });
}

const cancelItem = (req, res) => {
    const { orderId, itemId } = req.params; const { pin, reason } = req.body; 
    verifyPin(pin, res, () => {
        db.get(`SELECT oi.paid, p.name FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.id = ?`, [itemId], (err, item) => {
            if (!item) return res.status(404).json({ error: 'Platillo no encontrado' });
            if (item.paid === 1) return res.status(400).json({ error: 'Ya fue pagado.' });
            
            db.run(`DELETE FROM order_items WHERE id = ? AND order_id = ?`, [itemId, orderId], function(err) {
                updateOrderTotal(orderId);
                db.run(`INSERT INTO audit_logs (action, details, performed_by) VALUES (?, ?, ?)`, ['CANCELAR_PLATILLO', `Se canceló "${item.name}". Motivo: ${reason || 'N/A'}`, 'Admin']);
                req.app.get('io').emit('update-tables');
                res.json({ message: 'Cancelado' });
            });
        });
    });
};

const cancelOrder = (req, res) => {
    const { id } = req.params; const { pin, reason } = req.body; 
    verifyPin(pin, res, () => {
        db.get(`SELECT table_id FROM orders WHERE id = ?`, [id], (err, order) => {
            db.serialize(() => {
                db.run(`DELETE FROM order_items WHERE order_id = ?`, [id]);
                db.run(`DELETE FROM orders WHERE id = ?`, [id]);
                db.run(`UPDATE tables SET status = 'LIBRE' WHERE id = ?`, [order.table_id]);

                // NUEVO: Rastro de auditoría para la cancelación total
                db.run(`INSERT INTO audit_logs (action, details, performed_by) VALUES (?, ?, ?)`, 
                    ['CANCELAR_ORDEN_COMPLETA', `Se canceló la Orden #${id} de la Mesa ID ${order.table_id}. Motivo: ${reason}`, 'Administrador']);
                req.app.get('io').emit('update-tables');
                res.json({ message: 'Cancelada' });
            });
        });
    });
};

const transferOrder = (req, res) => {
    const { id } = req.params; const { new_table_id } = req.body;
    db.get(`SELECT table_id FROM orders WHERE id = ?`, [id], (err, order) => {
        db.run(`UPDATE tables SET status = 'OCUPADA' WHERE id = ?`, [new_table_id], () => {
            db.run(`UPDATE orders SET table_id = ? WHERE id = ?`, [new_table_id, id], () => { 
                req.app.get('io').emit('update-tables');
                db.run(`UPDATE tables SET status = 'LIBRE' WHERE id = ?`, [order.table_id], () => { res.json({ message: 'Transferida' }); });
            });
        });
    });
};

const applyDiscount = (req, res) => {
    const { id } = req.params; const { pin, discount_amount } = req.body;
    verifyPin(pin, res, () => {
        db.run(`UPDATE orders SET discount_amount = ? WHERE id = ?`, [discount_amount, id], function() {
            
            // NUEVO: Rastro de auditoría para descuentos
            db.run(`INSERT INTO audit_logs (action, details, performed_by) VALUES (?, ?, ?)`, 
                ['DESCUENTO_APLICADO', `Descuento de $${discount_amount} aplicado a la Orden #${id}`, 'Administrador']);
                
            req.app.get('io').emit('update-tables');
            updateOrderTotal(id, () => { res.json({ message: 'Descuento aplicado' }); });
        });
    });
};

const reopenOrder = (req, res) => {
    const { id } = req.params; const { pin } = req.body;
    verifyPin(pin, res, () => {
        db.get(`SELECT * FROM orders WHERE id = ?`, [id], (err, order) => {
            db.serialize(() => {
                db.run(`UPDATE tables SET status = 'OCUPADA' WHERE id = ?`, [order.table_id]);
                db.run(`UPDATE orders SET status = 'ABIERTA', amount_paid = 0, tip_amount = 0, change_amount = 0, closed_at = NULL, remaining_balance = total WHERE id = ?`, [id]);
                db.run(`UPDATE order_items SET paid = 0 WHERE order_id = ?`, [id]);
                
                // NUEVO: Rastro de auditoría para cuentas reabiertas
                db.run(`INSERT INTO audit_logs (action, details, performed_by) VALUES (?, ?, ?)`, 
                    ['REABRIR_CUENTA', `Cuenta #${id} reabierta por administrador. Pagos anulados.`, 'Administrador']);
                    
                req.app.get('io').emit('update-tables');
                res.json({ message: 'Reabierta' });
            });
        });
    });
};

const toggleInvoiceStatus = (req, res) => {
    const { id } = req.params;
    db.get(`SELECT invoice_done FROM orders WHERE id = ?`, [id], (err, order) => {
        if (err || !order) return res.status(500).json({ error: 'Orden no encontrada' });
        const newStatus = order.invoice_done === 1 ? 0 : 1;
        db.run(`UPDATE orders SET invoice_done = ? WHERE id = ?`, [newStatus, id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Estado de factura actualizado', invoice_done: newStatus });
        });
    });
};

const updatePax = (req, res) => {
    const { id } = req.params;
    const { guests } = req.body;
    db.run(`UPDATE orders SET guests = ? WHERE id = ?`, [guests, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        req.app.get('io').emit('update-tables');
        res.json({ message: 'PAX actualizado' });
    });
};
module.exports = { getTableOrder, getOrderById, createOrder, addItemsToOrder, payOrder, cancelItem, cancelOrder, transferOrder, applyDiscount, reopenOrder, toggleInvoiceStatus, updatePax };