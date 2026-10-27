const { dbGet, dbAll, dbRun, dbTransaction } = require('../utils/dbHelper');
const { emitUpdate } = require('../utils/emitUpdate');
const { emitDraft } = require('./draftController');

/**
 * Reutilizable: Hidrata una orden con sus platillos asociados.
 */
async function hydrateOrderWithItems(order) {
    if (!order) return null;
    const items = await dbAll(
        `SELECT oi.*, p.name, p.price 
         FROM order_items oi 
         JOIN products p ON oi.product_id = p.id 
         WHERE oi.order_id = ?`,
        [order.id]
    );
    order.items = items;
    return order;
}

/**
 * Recalcula el total y el saldo restante de una orden basándose en sus items y descuentos.
 * Retorna una Promesa para garantizar que el cálculo finalice antes de responder al cliente.
 */
async function updateOrderTotal(orderId) {
    const orderRow = await dbGet(`SELECT total, remaining_balance, discount_amount FROM orders WHERE id = ?`, [orderId]);
    if (!orderRow) return;

    const oldTotal = Number(orderRow.total) || 0;
    const oldRemaining = Number(orderRow.remaining_balance) || 0;
    const discount = Number(orderRow.discount_amount) || 0;

    const row = await dbGet(
        `SELECT SUM(oi.quantity * (p.price + IFNULL(oi.extra_price, 0))) as new_total 
         FROM order_items oi 
         JOIN products p ON oi.product_id = p.id 
         WHERE oi.order_id = ?`,
        [orderId]
    );

    let rawTotal = row && row.new_total ? Number(row.new_total) : 0;
    let newTotal = rawTotal - discount;
    if (newTotal < 0) newTotal = 0;

    const difference = newTotal - oldTotal;
    let newRemaining = oldRemaining + difference;
    if (newRemaining < 0) newRemaining = 0;

    await dbRun(`UPDATE orders SET total = ?, remaining_balance = ? WHERE id = ?`, [newTotal, newRemaining, orderId]);
}

// ========================================================
// ENDPOINTS
// ========================================================

const getTableOrder = async (req, res) => {
    try {
        const { tableId } = req.params;
        const order = await dbGet(`SELECT * FROM orders WHERE table_id = ? AND status = 'ABIERTA'`, [tableId]);
        if (!order) {
            return res.json({ order: null });
        }

        await hydrateOrderWithItems(order);
        res.json({ order });
    } catch (err) {
        console.error('[OrderController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const getOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await dbGet(`SELECT * FROM orders WHERE id = ?`, [id]);
        if (!order) {
            return res.status(404).json({ error: 'Orden no encontrada' });
        }

        await hydrateOrderWithItems(order);
        res.json({ order });
    } catch (err) {
        console.error('[OrderController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const createOrder = async (req, res) => {
    const { table_id, waiter_name, items = [], is_printed, guests = 1 } = req.body;
    const printNote = is_printed === false ? ' (Ahorro papel: Sin imprimir)' : '';

    try {
        const orderId = await dbTransaction(async () => {
            await dbRun(`UPDATE tables SET status = 'OCUPADA' WHERE id = ?`, [table_id]);
            const orderRes = await dbRun(
                `INSERT INTO orders (table_id, waiter_name, guests) VALUES (?, ?, ?)`,
                [table_id, waiter_name, guests]
            );
            const newOrderId = orderRes.lastID;

            for (const item of items) {
                await dbRun(
                    `INSERT INTO order_items (order_id, product_id, quantity, notes, is_takeaway, extra_price, paid) 
                     VALUES (?, ?, ?, ?, ?, ?, 0)`,
                    [
                        newOrderId,
                        item.product_id,
                        item.quantity,
                        item.notes || '',
                        item.is_takeaway ? 1 : 0,
                        item.extra_price || 0
                    ]
                );
            }

            // Esperar obligatoriamente a que termine el cálculo de total
            await updateOrderTotal(newOrderId);

            // Lo que estaba en borrador ya se envió a cocina
            await dbRun(`DELETE FROM order_drafts WHERE table_id = ?`, [table_id]);

            await dbRun(
                `INSERT INTO audit_logs (action, details, performed_by) VALUES (?, ?, ?)`,
                ['CREAR_ORDEN', `Orden #${newOrderId} abierta en Mesa ID ${table_id}${printNote}`, waiter_name]
            );

            return newOrderId;
        });

        emitDraft(req, { table_id: Number(table_id), items: [], sent: true, device_id: String(req.body.device_id || '') });
        emitUpdate(req);

        res.status(201).json({ message: 'Orden creada', orderId });
    } catch (err) {
        console.error('[OrderController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const addItemsToOrder = async (req, res) => {
    const { id } = req.params;
    const { items = [], is_printed } = req.body;
    const printNote = is_printed === false ? ' (Ahorro papel: Sin imprimir)' : '';

    try {
        let draftTableId = null;
        await dbTransaction(async () => {
            for (const item of items) {
                const existing = await dbGet(
                    `SELECT id FROM order_items 
                     WHERE order_id = ? AND product_id = ? AND notes = ? AND is_takeaway = ? AND extra_price = ? AND paid = 0`,
                    [id, item.product_id, item.notes || '', item.is_takeaway ? 1 : 0, item.extra_price || 0]
                );

                if (existing) {
                    await dbRun(`UPDATE order_items SET quantity = quantity + ? WHERE id = ?`, [item.quantity, existing.id]);
                } else {
                    await dbRun(
                        `INSERT INTO order_items (order_id, product_id, quantity, notes, is_takeaway, extra_price, paid) 
                         VALUES (?, ?, ?, ?, ?, ?, 0)`,
                        [id, item.product_id, item.quantity, item.notes || '', item.is_takeaway ? 1 : 0, item.extra_price || 0]
                    );
                }
            }

            // Esperar obligatoriamente al recálculo
            await updateOrderTotal(id);

            const order = await dbGet(`SELECT waiter_name, table_id FROM orders WHERE id = ?`, [id]);
            const waiter = order ? order.waiter_name : 'Sistema';
            if (order) {
                // Lo que estaba en borrador ya se envió a cocina
                draftTableId = order.table_id;
                await dbRun(`DELETE FROM order_drafts WHERE table_id = ?`, [draftTableId]);
            }
            await dbRun(
                `INSERT INTO audit_logs (action, details, performed_by) VALUES (?, ?, ?)`,
                ['AGREGAR_ITEMS', `Se agregaron platillos a la Orden #${id}${printNote}`, waiter]
            );
        });

        if (draftTableId) emitDraft(req, { table_id: draftTableId, items: [], sent: true, device_id: String(req.body.device_id || '') });
        emitUpdate(req);

        res.json({ message: 'Items agregados y agrupados correctamente' });
    } catch (err) {
        console.error('[OrderController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const payOrder = async (req, res) => {
    const { id } = req.params;
    const { payment_method, amount_paid, items_to_pay, tip_amount = 0, needs_invoice = false } = req.body;
    const invoiceFlag = needs_invoice ? 1 : 0;
    const numericPaid = Number(amount_paid) || 0;
    const numericTip = Number(tip_amount) || 0;

    if (numericPaid < 0 || numericTip < 0) {
        return res.status(400).json({ error: 'Los montos no pueden ser negativos.' });
    }

    try {
        const order = await dbGet(`SELECT * FROM orders WHERE id = ?`, [id]);
        if (!order) {
            return res.status(404).json({ error: 'Orden no encontrada' });
        }

        const result = await dbTransaction(async () => {
            // Procesamiento de ítems específicos a pagar (si aplica división de cuenta)
            if (Array.isArray(items_to_pay) && items_to_pay.length > 0) {
                for (const it of items_to_pay) {
                    const row = await dbGet(`SELECT * FROM order_items WHERE id = ?`, [it.id]);
                    if (row && row.paid === 0) {
                        if (row.quantity === it.qty) {
                            await dbRun(`UPDATE order_items SET paid = 1 WHERE id = ?`, [it.id]);
                        } else if (row.quantity > it.qty) {
                            await dbRun(`UPDATE order_items SET quantity = ? WHERE id = ?`, [row.quantity - it.qty, it.id]);
                            await dbRun(
                                `INSERT INTO order_items (order_id, product_id, quantity, notes, is_takeaway, extra_price, paid) 
                                 VALUES (?, ?, ?, ?, ?, ?, 1)`,
                                [row.order_id, row.product_id, it.qty, row.notes, row.is_takeaway, row.extra_price]
                            );
                        }
                    }
                }
            }

            const currentBalance = (order.remaining_balance !== null && order.remaining_balance !== undefined)
                ? Number(order.remaining_balance)
                : Number(order.total);

            const isFullyPaid = numericPaid >= currentBalance;
            const appliedAmount = isFullyPaid ? currentBalance : numericPaid;
            const change = isFullyPaid ? numericPaid - currentBalance : 0;
            const newBalance = isFullyPaid ? 0 : currentBalance - numericPaid;

            const addCash = payment_method === 'EFECTIVO' ? appliedAmount : 0;
            const addCard = (payment_method === 'TARJETA' || payment_method === 'TRANSFERENCIA') ? appliedAmount : 0;

            if (isFullyPaid) {
                await dbRun(
                    `UPDATE orders SET status = 'PAGADA', payment_method = ?, 
                     cash_amount = IFNULL(cash_amount, 0) + ?, card_amount = IFNULL(card_amount, 0) + ?,
                     amount_paid = IFNULL(amount_paid, 0) + ?, change_amount = IFNULL(change_amount, 0) + ?, 
                     remaining_balance = 0, tip_amount = IFNULL(tip_amount, 0) + ?, needs_invoice = ?, 
                     closed_at = datetime('now', '-6 hours') WHERE id = ?`,
                    [payment_method, addCash, addCard, numericPaid, change, numericTip, invoiceFlag, id]
                );

                await dbRun(`UPDATE tables SET status = 'LIBRE' WHERE id = ?`, [order.table_id]);

                return {
                    response: { message: 'Orden pagada por completo', change, fully_paid: true }
                };
            } else {
                await dbRun(
                    `UPDATE orders SET remaining_balance = ?, payment_method = 'MIXTO', 
                     cash_amount = IFNULL(cash_amount, 0) + ?, card_amount = IFNULL(card_amount, 0) + ?,
                     tip_amount = IFNULL(tip_amount, 0) + ?, needs_invoice = ? WHERE id = ?`,
                    [newBalance, addCash, addCard, numericTip, invoiceFlag, id]
                );

                return {
                    response: { message: 'Abono registrado', remaining_balance: newBalance, fully_paid: false }
                };
            }
        });

        emitUpdate(req);

        res.json(result.response);
    } catch (err) {
        console.error('[OrderController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const cancelItem = async (req, res) => {
    const { orderId, itemId } = req.params;
    const { reason } = req.body;

    try {

        const item = await dbGet(
            `SELECT oi.paid, oi.quantity, p.name 
             FROM order_items oi 
             JOIN products p ON oi.product_id = p.id 
             WHERE oi.id = ?`,
            [itemId]
        );

        if (!item) return res.status(404).json({ error: 'Platillo no encontrado' });
        if (item.paid === 1) return res.status(400).json({ error: 'Ya fue pagado.' });

        await dbTransaction(async () => {
            const query = item.quantity > 1
                ? `UPDATE order_items SET quantity = quantity - 1 WHERE id = ? AND order_id = ?`
                : `DELETE FROM order_items WHERE id = ? AND order_id = ?`;

            await dbRun(query, [itemId, orderId]);
            await updateOrderTotal(orderId);
            await dbRun(
                `INSERT INTO audit_logs (action, details, performed_by) VALUES (?, ?, ?)`,
                ['CANCELAR_PLATILLO', `Se canceló 1x "${item.name}". Motivo: ${reason || 'N/A'}`, 'Admin']
            );
        });

        emitUpdate(req);

        res.json({ message: 'Cancelado' });
    } catch (err) {
        console.error('[OrderController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const cancelOrder = async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;

    try {

        const order = await dbGet(`SELECT table_id FROM orders WHERE id = ?`, [id]);
        if (!order) {
            return res.status(404).json({ error: 'Orden no encontrada' });
        }

        await dbTransaction(async () => {
            await dbRun(`DELETE FROM order_items WHERE order_id = ?`, [id]);
            await dbRun(`DELETE FROM orders WHERE id = ?`, [id]);
            await dbRun(`UPDATE tables SET status = 'LIBRE' WHERE id = ?`, [order.table_id]);
            await dbRun(
                `INSERT INTO audit_logs (action, details, performed_by) VALUES (?, ?, ?)`,
                ['CANCELAR_ORDEN_COMPLETA', `Se canceló la Orden #${id} de la Mesa ID ${order.table_id}. Motivo: ${reason || 'N/A'}`, 'Administrador']
            );
        });

        emitUpdate(req);

        res.json({ message: 'Cancelada' });
    } catch (err) {
        console.error('[OrderController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const transferOrder = async (req, res) => {
    const { id } = req.params;
    const { new_table_id } = req.body;

    try {
        const order = await dbGet(`SELECT table_id FROM orders WHERE id = ?`, [id]);
        if (!order) {
            return res.status(404).json({ error: 'Orden no encontrada' });
        }

        await dbTransaction(async () => {
            await dbRun(`UPDATE tables SET status = 'OCUPADA' WHERE id = ?`, [new_table_id]);
            await dbRun(`UPDATE orders SET table_id = ? WHERE id = ?`, [new_table_id, id]);
            await dbRun(`UPDATE OR IGNORE order_drafts SET table_id = ? WHERE table_id = ?`, [new_table_id, order.table_id]);
            await dbRun(`UPDATE tables SET status = 'LIBRE' WHERE id = ?`, [order.table_id]);
        });

        emitUpdate(req);

        res.json({ message: 'Transferida' });
    } catch (err) {
        console.error('[OrderController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const applyDiscount = async (req, res) => {
    const { id } = req.params;
    const { discount_amount } = req.body;

    try {
        const numericDiscount = Number(discount_amount) || 0;
        if (numericDiscount < 0) {
            return res.status(400).json({ error: 'El descuento no puede ser negativo.' });
        }

        await dbTransaction(async () => {
            await dbRun(`UPDATE orders SET discount_amount = ? WHERE id = ?`, [numericDiscount, id]);
            await dbRun(
                `INSERT INTO audit_logs (action, details, performed_by) VALUES (?, ?, ?)`,
                ['DESCUENTO_APLICADO', `Descuento de $${numericDiscount} aplicado a la Orden #${id}`, 'Administrador']
            );
            await updateOrderTotal(id);
        });

        emitUpdate(req);

        res.json({ message: 'Descuento aplicado' });
    } catch (err) {
        console.error('[OrderController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const reopenOrder = async (req, res) => {
    const { id } = req.params;
    try {

        const order = await dbGet(`SELECT * FROM orders WHERE id = ?`, [id]);
        if (!order) {
            return res.status(404).json({ error: 'Orden no encontrada' });
        }

        await dbTransaction(async () => {
            await dbRun(`UPDATE tables SET status = 'OCUPADA' WHERE id = ?`, [order.table_id]);
            await dbRun(
                `UPDATE orders SET status = 'ABIERTA', amount_paid = 0, tip_amount = 0, change_amount = 0, 
                 closed_at = NULL, remaining_balance = total WHERE id = ?`,
                [id]
            );
            await dbRun(`UPDATE order_items SET paid = 0 WHERE order_id = ?`, [id]);
            await dbRun(
                `INSERT INTO audit_logs (action, details, performed_by) VALUES (?, ?, ?)`,
                ['REABRIR_CUENTA', `Cuenta #${id} reabierta por administrador. Pagos anulados.`, 'Administrador']
            );
        });

        emitUpdate(req);

        res.json({ message: 'Reabierta' });
    } catch (err) {
        console.error('[OrderController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const toggleInvoiceStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await dbGet(`SELECT invoice_done FROM orders WHERE id = ?`, [id]);
        if (!order) {
            return res.status(404).json({ error: 'Orden no encontrada' });
        }

        const newStatus = order.invoice_done === 1 ? 0 : 1;
        await dbRun(`UPDATE orders SET invoice_done = ? WHERE id = ?`, [newStatus, id]);

        res.json({ message: 'Estado de factura actualizado', invoice_done: newStatus });
    } catch (err) {
        console.error('[OrderController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const updatePax = async (req, res) => {
    try {
        const { id } = req.params;
        const { guests } = req.body;
        await dbRun(`UPDATE orders SET guests = ? WHERE id = ?`, [Number(guests) || 1, id]);

        emitUpdate(req);

        res.json({ message: 'PAX actualizado' });
    } catch (err) {
        console.error('[OrderController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

module.exports = {
    getTableOrder,
    getOrderById,
    createOrder,
    addItemsToOrder,
    payOrder,
    cancelItem,
    cancelOrder,
    transferOrder,
    applyDiscount,
    reopenOrder,
    toggleInvoiceStatus,
    updatePax,
    updateOrderTotal // Exportado para pruebas unitarias
};