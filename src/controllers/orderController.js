const { dbGet, dbAll, dbRun, dbTransaction } = require('../utils/dbHelper');
const { emitUpdate } = require('../utils/emitUpdate');
const { emitDraft } = require('./draftController');
const { folioSql, nextFolio, orderFolio } = require('../utils/folio');
const { toCents, fromCents, round2 } = require('../utils/money');

// Nombre visible de la mesa para los mensajes de auditoría (ej. "Mesa 07", "PARA LLEVAR 1")
async function mesaNombre(tableId) {
    const t = await dbGet(`SELECT table_number FROM tables WHERE id = ?`, [tableId]);
    if (!t) return `Mesa ID ${tableId}`;
    return /^\d+$/.test(t.table_number) ? `Mesa ${t.table_number}` : t.table_number;
}

// Error con código HTTP para responder al cliente desde dentro de una transacción
const httpError = (status, message) => Object.assign(new Error(message), { status });

const PAYMENT_METHODS = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA'];

// Platillos que manda la pantalla: tipos y rangos controlados (una cantidad negativa bajaría la cuenta)
function sanitizeOrderItems(items) {
    if (!Array.isArray(items) || items.length === 0 || items.length > 200) return null;
    const clean = [];
    for (const it of items) {
        const productId = Number(it && it.product_id);
        const quantity = Number(it && it.quantity);
        const extra = round2(it && it.extra_price);
        if (!Number.isInteger(productId) || productId <= 0) return null;
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) return null;
        if (extra < 0 || extra > 100000) return null;
        clean.push({ product_id: productId, quantity, notes: String(it.notes || '').slice(0, 300), is_takeaway: it.is_takeaway ? 1 : 0, extra_price: extra });
    }
    return clean;
}

// Agrega platillos a una orden guardando el precio de ese momento (si después cambia el menú, la cuenta no cambia).
// Los iguales (mismo platillo, nota, para llevar, extra y precio) se suman en el mismo renglón.
async function insertItems(orderId, items) {
    for (const item of items) {
        const product = await dbGet(`SELECT price FROM products WHERE id = ? AND IFNULL(deleted, 0) = 0`, [item.product_id]);
        if (!product) throw httpError(400, 'Uno de los platillos ya no existe en el menú. Actualiza la pantalla.');
        const unitPrice = round2(product.price);
        const existing = await dbGet(
            `SELECT id FROM order_items
             WHERE order_id = ? AND product_id = ? AND notes = ? AND is_takeaway = ? AND extra_price = ? AND unit_price = ? AND paid = 0`,
            [orderId, item.product_id, item.notes, item.is_takeaway, item.extra_price, unitPrice]
        );
        if (existing) {
            await dbRun(`UPDATE order_items SET quantity = quantity + ? WHERE id = ?`, [item.quantity, existing.id]);
        } else {
            await dbRun(
                `INSERT INTO order_items (order_id, product_id, quantity, notes, is_takeaway, extra_price, unit_price, paid)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
                [orderId, item.product_id, item.quantity, item.notes, item.is_takeaway, item.extra_price, unitPrice]
            );
        }
    }
}

// Envíos repetidos: si el Wi-Fi se cae después de guardar, el celular reintenta con la misma clave
// y recibe la respuesta original en vez de duplicar los platillos en cocina. Debe llamarse dentro de la transacción.
async function onceByRequestId(requestId, work) {
    const id = typeof requestId === 'string' && requestId.length >= 8 && requestId.length <= 64 ? requestId : null;
    if (id) {
        const prev = await dbGet(`SELECT response FROM request_log WHERE id = ?`, [id]);
        if (prev) return { ...JSON.parse(prev.response), repeated: true };
    }
    const response = await work();
    if (id) await dbRun(`INSERT INTO request_log (id, response) VALUES (?, ?)`, [id, JSON.stringify(response)]);
    return response;
}

// Dinero que ya entró a la caja por esta cuenta (abonos en efectivo y tarjeta)
async function abonadoDe(orderId) {
    const row = await dbGet(`SELECT IFNULL(cash_amount, 0) + IFNULL(card_amount, 0) AS abonado FROM orders WHERE id = ?`, [orderId]);
    return row ? round2(row.abonado) : 0;
}

// Si lo abonado ya cubre la cuenta (se cancelaron platillos o hubo descuento), se cierra como cobrada.
// Así no queda una cuenta abierta en $0.00 cuya única salida era cancelarla y perder los abonos del corte.
async function cerrarSiEstaCubierta(orderId) {
    const o = await dbGet(`SELECT table_id, status, remaining_balance, IFNULL(cash_amount, 0) AS ef, IFNULL(card_amount, 0) AS tj FROM orders WHERE id = ?`, [orderId]);
    if (!o || o.status !== 'ABIERTA' || toCents(o.remaining_balance) > 0 || toCents(o.ef + o.tj) <= 0) return false;
    const metodo = o.ef > 0 && o.tj > 0 ? 'MIXTO' : o.ef > 0 ? 'EFECTIVO' : 'TARJETA';
    await dbRun(
        `UPDATE orders SET status = 'PAGADA', payment_method = ?, amount_paid = ?, change_amount = 0, remaining_balance = 0,
         closed_at = datetime('now', '-6 hours') WHERE id = ?`,
        [metodo, round2(o.ef + o.tj), orderId]
    );
    await dbRun(`UPDATE tables SET status = 'LIBRE' WHERE id = ?`, [o.table_id]);
    await dbRun(
        `INSERT INTO audit_logs (action, details, performed_by, created_at) VALUES (?, ?, ?, datetime('now', '-6 hours'))`,
        ['CUENTA_CERRADA', `La Orden ${await orderFolio(orderId)} se cerró con lo ya abonado ($${round2(o.ef + o.tj)})`, 'Administrador']
    );
    return true;
}

// Responde con el código del error (400/404/409) o 500 si fue inesperado
function sendError(res, err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    // Regla de la BD: una sola cuenta abierta por mesa
    if (/UNIQUE constraint failed: orders\.table_id/.test(err.message)) return res.status(409).json({ error: 'La mesa ya tiene una cuenta abierta. Actualiza la pantalla.' });
    console.error('[OrderController]', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
}

/**
 * Reutilizable: Hidrata una orden con sus platillos asociados (con el precio guardado al pedirlos).
 */
async function hydrateOrderWithItems(order) {
    if (!order) return null;
    const items = await dbAll(
        `SELECT oi.*, COALESCE(p.name, '(platillo eliminado)') AS name, COALESCE(oi.unit_price, p.price, 0) AS price
         FROM order_items oi
         LEFT JOIN products p ON oi.product_id = p.id
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

    // Todo en centavos enteros
    const oldTotal = toCents(orderRow.total);
    const oldRemaining = toCents(orderRow.remaining_balance);
    const discount = toCents(orderRow.discount_amount);

    const row = await dbGet(
        `SELECT SUM(oi.quantity * (COALESCE(oi.unit_price, p.price, 0) + IFNULL(oi.extra_price, 0))) as new_total
         FROM order_items oi
         LEFT JOIN products p ON oi.product_id = p.id
         WHERE oi.order_id = ?`,
        [orderId]
    );

    let rawTotal = row && row.new_total ? toCents(row.new_total) : 0;
    let newTotal = rawTotal - discount;
    if (newTotal < 0) newTotal = 0;

    const difference = newTotal - oldTotal;
    let newRemaining = oldRemaining + difference;
    if (newRemaining < 0) newRemaining = 0;

    await dbRun(`UPDATE orders SET total = ?, remaining_balance = ? WHERE id = ?`, [fromCents(newTotal), fromCents(newRemaining), orderId]);
}

// ========================================================
// ENDPOINTS
// ========================================================

const getTableOrder = async (req, res) => {
    try {
        const { tableId } = req.params;
        const order = await dbGet(`SELECT o.*, ${folioSql('o')} AS folio FROM orders o WHERE o.table_id = ? AND o.status = 'ABIERTA' ORDER BY o.id LIMIT 1`, [tableId]);
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
        const order = await dbGet(`SELECT o.*, ${folioSql('o')} AS folio FROM orders o WHERE o.id = ?`, [id]);
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
    const { table_id, waiter_name, is_printed, guests = 1, request_id } = req.body;
    const printNote = is_printed === false ? ' (Ahorro papel: Sin imprimir)' : '';
    const items = sanitizeOrderItems(req.body.items);
    const waiter = String(waiter_name || '').trim().slice(0, 60);
    const pax = Math.min(Math.max(parseInt(guests, 10) || 1, 1), 99);

    if (!items) return res.status(400).json({ error: 'La orden no tiene platillos válidos.' });
    if (!waiter) return res.status(400).json({ error: 'Selecciona un mesero.' });

    try {
        const result = await dbTransaction(() => onceByRequestId(request_id, async () => {
            const table = await dbGet(`SELECT id FROM tables WHERE id = ?`, [table_id]);
            if (!table) throw httpError(404, 'La mesa ya no existe. Actualiza la pantalla.');

            // Otro dispositivo ya abrió esta mesa: los platillos se suman a esa cuenta (nunca dos cuentas en una mesa)
            const open = await dbGet(`SELECT id FROM orders WHERE table_id = ? AND status = 'ABIERTA'`, [table_id]);
            if (open) {
                await insertItems(open.id, items);
                await updateOrderTotal(open.id);
                await dbRun(`DELETE FROM order_drafts WHERE table_id = ?`, [table_id]);
                await dbRun(
                    `INSERT INTO audit_logs (action, details, performed_by, created_at) VALUES (?, ?, ?, datetime('now', '-6 hours'))`,
                    ['AGREGAR_ITEMS', `Se agregaron platillos a la Orden ${await orderFolio(open.id)}${printNote}`, waiter]
                );
                return { message: 'Platillos agregados a la cuenta abierta', orderId: open.id, folio: await orderFolio(open.id), merged: true };
            }

            await dbRun(`UPDATE tables SET status = 'OCUPADA' WHERE id = ?`, [table_id]);
            const folio = await nextFolio(table_id);
            const orderRes = await dbRun(
                `INSERT INTO orders (table_id, waiter_name, guests, folio_type, folio_num) VALUES (?, ?, ?, ?, ?)`,
                [table_id, waiter, pax, folio.type, folio.num]
            );
            const newOrderId = orderRes.lastID;
            await insertItems(newOrderId, items);

            // Esperar obligatoriamente a que termine el cálculo de total
            await updateOrderTotal(newOrderId);

            // Lo que estaba en borrador ya se envió a cocina
            await dbRun(`DELETE FROM order_drafts WHERE table_id = ?`, [table_id]);

            await dbRun(
                `INSERT INTO audit_logs (action, details, performed_by, created_at) VALUES (?, ?, ?, datetime('now', '-6 hours'))`,
                ['CREAR_ORDEN', `Orden ${folio.label} abierta en ${await mesaNombre(table_id)}${printNote}`, waiter]
            );

            return { message: 'Orden creada', orderId: newOrderId, folio: folio.label };
        }));

        emitDraft(req, { table_id: Number(table_id), items: [], sent: true, device_id: String(req.body.device_id || '') });
        emitUpdate(req);

        res.status(201).json(result);
    } catch (err) {
        sendError(res, err);
    }
};

const addItemsToOrder = async (req, res) => {
    const { id } = req.params;
    const { is_printed, request_id } = req.body;
    const printNote = is_printed === false ? ' (Ahorro papel: Sin imprimir)' : '';
    const items = sanitizeOrderItems(req.body.items);
    if (!items) return res.status(400).json({ error: 'No hay platillos válidos para agregar.' });

    try {
        let draftTableId = null;
        const result = await dbTransaction(() => onceByRequestId(request_id, async () => {
            const order = await dbGet(`SELECT waiter_name, table_id, status FROM orders WHERE id = ?`, [id]);
            if (!order) throw httpError(404, 'La cuenta ya no existe (fue cancelada). Vuelve a abrir la mesa.');
            if (order.status !== 'ABIERTA') throw httpError(409, 'Esta cuenta ya se cobró. Vuelve a abrir la mesa para empezar una cuenta nueva.');

            await insertItems(id, items);

            // Esperar obligatoriamente al recálculo
            await updateOrderTotal(id);

            // Lo que estaba en borrador ya se envió a cocina
            draftTableId = order.table_id;
            await dbRun(`DELETE FROM order_drafts WHERE table_id = ?`, [draftTableId]);
            await dbRun(
                `INSERT INTO audit_logs (action, details, performed_by, created_at) VALUES (?, ?, ?, datetime('now', '-6 hours'))`,
                ['AGREGAR_ITEMS', `Se agregaron platillos a la Orden ${await orderFolio(id)}${printNote}`, order.waiter_name || 'Sistema']
            );
            return { message: 'Items agregados y agrupados correctamente' };
        }));

        if (draftTableId) emitDraft(req, { table_id: draftTableId, items: [], sent: true, device_id: String(req.body.device_id || '') });
        emitUpdate(req);

        res.json(result);
    } catch (err) {
        sendError(res, err);
    }
};

const payOrder = async (req, res) => {
    const { id } = req.params;
    const { payment_method, amount_paid, items_to_pay, tip_amount = 0, needs_invoice = false } = req.body;
    const invoiceFlag = needs_invoice ? 1 : 0;
    const numericPaid = round2(amount_paid);
    const numericTip = round2(tip_amount);

    if (numericPaid < 0 || numericTip < 0) {
        return res.status(400).json({ error: 'Los montos no pueden ser negativos.' });
    }
    if (!PAYMENT_METHODS.includes(payment_method)) {
        return res.status(400).json({ error: 'Forma de pago inválida.' });
    }

    try {
        const result = await dbTransaction(async () => {
            // Se lee dentro de la transacción: dos cobros a la vez (caja y celular) no pueden cobrar la misma cuenta dos veces
            const order = await dbGet(`SELECT * FROM orders WHERE id = ?`, [id]);
            if (!order) throw httpError(404, 'Orden no encontrada');
            if (order.status !== 'ABIERTA') throw httpError(409, 'Esta cuenta ya estaba cobrada. Revisa el corte antes de volver a cobrar.');

            // Procesamiento de ítems específicos a pagar (si aplica división de cuenta)
            if (Array.isArray(items_to_pay) && items_to_pay.length > 0) {
                for (const it of items_to_pay) {
                    const qty = Number(it && it.qty);
                    if (!Number.isInteger(qty) || qty < 1) continue;
                    const row = await dbGet(`SELECT * FROM order_items WHERE id = ? AND order_id = ?`, [it.id, id]);
                    if (row && row.paid === 0) {
                        if (row.quantity === qty) {
                            await dbRun(`UPDATE order_items SET paid = 1 WHERE id = ?`, [row.id]);
                        } else if (row.quantity > qty) {
                            await dbRun(`UPDATE order_items SET quantity = ? WHERE id = ?`, [row.quantity - qty, row.id]);
                            await dbRun(
                                `INSERT INTO order_items (order_id, product_id, quantity, notes, is_takeaway, extra_price, unit_price, paid)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
                                [row.order_id, row.product_id, qty, row.notes, row.is_takeaway, row.extra_price, row.unit_price]
                            );
                        }
                    }
                }
            }

            // Comparación y restas en centavos: pagar "exacto" siempre liquida la cuenta
            const balanceCents = toCents((order.remaining_balance !== null && order.remaining_balance !== undefined)
                ? order.remaining_balance
                : order.total);
            const paidCents = toCents(numericPaid);

            const isFullyPaid = paidCents >= balanceCents;
            const appliedAmount = fromCents(isFullyPaid ? balanceCents : paidCents);
            const change = isFullyPaid ? fromCents(paidCents - balanceCents) : 0;
            const newBalance = isFullyPaid ? 0 : fromCents(balanceCents - paidCents);

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
        sendError(res, err);
    }
};

const cancelItem = async (req, res) => {
    const { orderId, itemId } = req.params;
    const { reason } = req.body;

    try {

        const item = await dbGet(
            `SELECT oi.paid, oi.quantity, COALESCE(p.name, '(platillo eliminado)') AS name, o.status, o.remaining_balance,
                    COALESCE(oi.unit_price, p.price, 0) + IFNULL(oi.extra_price, 0) AS precio
             FROM order_items oi 
             JOIN orders o ON o.id = oi.order_id
             LEFT JOIN products p ON oi.product_id = p.id
             WHERE oi.id = ? AND oi.order_id = ?`,
            [itemId, orderId]
        );

        if (!item) return res.status(404).json({ error: 'Platillo no encontrado' });
        if (item.status !== 'ABIERTA') return res.status(409).json({ error: 'La cuenta ya fue cobrada.' });
        if (item.paid === 1) return res.status(400).json({ error: 'Ya fue pagado.' });
        // Con abonos, el saldo pendiente es lo único que se puede quitar: lo demás ya está pagado
        if ((await abonadoDe(orderId)) > 0 && toCents(item.precio) > toCents(item.remaining_balance)) {
            return res.status(409).json({ error: `Este platillo ya está cubierto por lo que se abonó (saldo pendiente $${round2(item.remaining_balance)}). Si hay que devolver dinero, regístralo como gasto "Devolución folio ${await orderFolio(orderId)}".` });
        }

        let cerrada = false;
        await dbTransaction(async () => {
            const query = item.quantity > 1
                ? `UPDATE order_items SET quantity = quantity - 1 WHERE id = ? AND order_id = ?`
                : `DELETE FROM order_items WHERE id = ? AND order_id = ?`;

            await dbRun(query, [itemId, orderId]);
            await updateOrderTotal(orderId);
            await dbRun(
                `INSERT INTO audit_logs (action, details, performed_by, created_at) VALUES (?, ?, ?, datetime('now', '-6 hours'))`,
                ['CANCELAR_PLATILLO', `Se canceló 1x "${item.name}" de la Orden ${await orderFolio(orderId)}. Motivo: ${reason || 'N/A'}`, 'Admin']
            );
            cerrada = await cerrarSiEstaCubierta(orderId);
        });

        emitUpdate(req);

        res.json({ message: cerrada ? 'Cancelado. La cuenta quedó cubierta con lo abonado y se cerró.' : 'Cancelado', closed: cerrada });
    } catch (err) {
        console.error('[OrderController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const cancelOrder = async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;

    try {

        const order = await dbGet(`SELECT table_id, status, IFNULL(cash_amount, 0) + IFNULL(card_amount, 0) AS abonado FROM orders WHERE id = ?`, [id]);
        if (!order) {
            return res.status(404).json({ error: 'Orden no encontrada' });
        }
        // Una cuenta cobrada ya está en el corte: borrarla descuadraría la caja
        if (order.status !== 'ABIERTA') return res.status(409).json({ error: 'Esta cuenta ya fue cobrada; no se puede cancelar.' });
        // Ese dinero ya entró a la caja: cancelarla lo sacaría del corte y el conteo saldría con sobrante
        if (toCents(order.abonado) > 0) {
            return res.status(409).json({ error: `Esta cuenta tiene abonos por $${round2(order.abonado)} y no se puede cancelar completa. Cancela los platillos pendientes (la cuenta se cierra sola con lo abonado). Si hay que devolver dinero, regístralo como gasto "Devolución".` });
        }
        const folioCancelado = await orderFolio(id);
        const mesaCancelada = await mesaNombre(order.table_id);

        await dbTransaction(async () => {
            await dbRun(`DELETE FROM order_items WHERE order_id = ?`, [id]);
            await dbRun(`DELETE FROM orders WHERE id = ?`, [id]);
            await dbRun(`UPDATE tables SET status = 'LIBRE' WHERE id = ?`, [order.table_id]);
            await dbRun(
                `INSERT INTO audit_logs (action, details, performed_by, created_at) VALUES (?, ?, ?, datetime('now', '-6 hours'))`,
                ['CANCELAR_ORDEN_COMPLETA', `Se canceló la Orden ${folioCancelado} de ${mesaCancelada}. Motivo: ${reason || 'N/A'}`, 'Administrador']
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
        await dbTransaction(async () => {
            const order = await dbGet(`SELECT table_id, status FROM orders WHERE id = ?`, [id]);
            if (!order) throw httpError(404, 'Orden no encontrada');
            if (order.status !== 'ABIERTA') throw httpError(409, 'Esta cuenta ya fue cobrada.');
            const destino = await dbGet(`SELECT id FROM tables WHERE id = ?`, [new_table_id]);
            if (!destino) throw httpError(404, 'La mesa destino no existe.');
            if (Number(new_table_id) === Number(order.table_id)) throw httpError(400, 'La cuenta ya está en esa mesa.');
            const ocupada = await dbGet(`SELECT id FROM orders WHERE table_id = ? AND status = 'ABIERTA'`, [new_table_id]);
            if (ocupada) throw httpError(409, 'La mesa destino ya tiene una cuenta abierta. Elige otra mesa.');

            await dbRun(`UPDATE tables SET status = 'OCUPADA' WHERE id = ?`, [new_table_id]);
            await dbRun(`UPDATE orders SET table_id = ? WHERE id = ?`, [new_table_id, id]);
            await dbRun(`UPDATE OR IGNORE order_drafts SET table_id = ? WHERE table_id = ?`, [new_table_id, order.table_id]);
            await dbRun(`UPDATE tables SET status = 'LIBRE' WHERE id = ?`, [order.table_id]);
        });

        emitUpdate(req);

        res.json({ message: 'Transferida' });
    } catch (err) {
        sendError(res, err);
    }
};

const applyDiscount = async (req, res) => {
    const { id } = req.params;
    const { discount_amount } = req.body;

    try {
        const numericDiscount = round2(discount_amount);
        if (numericDiscount < 0) {
            return res.status(400).json({ error: 'El descuento no puede ser negativo.' });
        }
        let cerrada = false;

        await dbTransaction(async () => {
            const order = await dbGet(`SELECT status FROM orders WHERE id = ?`, [id]);
            if (!order) throw httpError(404, 'Orden no encontrada');
            if (order.status !== 'ABIERTA') throw httpError(409, 'La cuenta ya fue cobrada.');
            const previo = await dbGet(`SELECT total, IFNULL(discount_amount, 0) AS descuento FROM orders WHERE id = ?`, [id]);
            const nuevoTotal = toCents(previo.total) + toCents(previo.descuento) - toCents(numericDiscount);
            const abonado = await abonadoDe(id);
            if (abonado > 0 && nuevoTotal < toCents(abonado)) {
                throw httpError(409, `El descuento deja la cuenta por debajo de lo ya abonado ($${abonado}). Si hay que devolver dinero, regístralo como gasto "Devolución".`);
            }
            await dbRun(`UPDATE orders SET discount_amount = ? WHERE id = ?`, [numericDiscount, id]);
            await dbRun(
                `INSERT INTO audit_logs (action, details, performed_by, created_at) VALUES (?, ?, ?, datetime('now', '-6 hours'))`,
                ['DESCUENTO_APLICADO', `Descuento de $${numericDiscount} aplicado a la Orden ${await orderFolio(id)}`, 'Administrador']
            );
            await updateOrderTotal(id);
            cerrada = await cerrarSiEstaCubierta(id);
        });

        emitUpdate(req);

        res.json({ message: 'Descuento aplicado', closed: cerrada });
    } catch (err) {
        sendError(res, err);
    }
};

const reopenOrder = async (req, res) => {
    const { id } = req.params;
    try {

        const order = await dbGet(`SELECT * FROM orders WHERE id = ?`, [id]);
        if (!order) {
            return res.status(404).json({ error: 'Orden no encontrada' });
        }

        if (order.status !== 'PAGADA') return res.status(409).json({ error: 'La cuenta no está cobrada.' });

        await dbTransaction(async () => {
            // La mesa ya tiene otra cuenta: reabrir crearía dos cuentas en la misma mesa
            const otra = await dbGet(`SELECT id FROM orders WHERE table_id = ? AND status = 'ABIERTA' AND id != ?`, [order.table_id, id]);
            if (otra) throw httpError(409, 'La mesa ya tiene otra cuenta abierta. Cóbrala o transfiérela antes de reabrir esta.');
            await dbRun(`UPDATE tables SET status = 'OCUPADA' WHERE id = ?`, [order.table_id]);
            // También se anulan efectivo y tarjeta: si no, al volver a cobrar el corte contaba ese dinero dos veces
            await dbRun(
                `UPDATE orders SET status = 'ABIERTA', amount_paid = 0, tip_amount = 0, change_amount = 0,
                 cash_amount = 0, card_amount = 0, payment_method = NULL,
                 closed_at = NULL, remaining_balance = total WHERE id = ?`,
                [id]
            );
            await dbRun(`UPDATE order_items SET paid = 0 WHERE order_id = ?`, [id]);
            await dbRun(
                `INSERT INTO audit_logs (action, details, performed_by, created_at) VALUES (?, ?, ?, datetime('now', '-6 hours'))`,
                ['REABRIR_CUENTA', `Cuenta ${await orderFolio(id)} reabierta por administrador. Pagos anulados.`, 'Administrador']
            );
        });

        emitUpdate(req);

        res.json({ message: 'Reabierta' });
    } catch (err) {
        sendError(res, err);
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