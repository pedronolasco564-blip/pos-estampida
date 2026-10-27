const { dbGet, dbRun } = require('../utils/dbHelper');
const { emitUpdate } = require('../utils/emitUpdate');

// ========================================================
// BORRADORES DE ORDEN: platillos tomados pero aún no enviados a cocina.
// Se guardan por mesa para que no se pierdan al cambiar de mesa y los vean todos los dispositivos.
// ========================================================

const MAX_ITEMS = 200;

// Solo se guardan los campos que la pantalla necesita, con tipos y tamaños controlados.
function sanitizeItems(items) {
    if (!Array.isArray(items) || items.length > MAX_ITEMS) return null;
    const clean = [];
    for (const it of items) {
        if (!it || typeof it !== 'object') return null;
        const productId = Number(it.product_id);
        const quantity = Number(it.quantity);
        if (!Number.isInteger(productId) || productId <= 0) return null;
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) return null;
        clean.push({
            product_id: productId,
            name: String(it.name || '').slice(0, 120),
            price: Number(it.price) || 0,
            quantity,
            notes: String(it.notes || '').slice(0, 300),
            is_takeaway: !!it.is_takeaway,
            station: String(it.station || '').slice(0, 40),
            extra_price: Math.max(0, Number(it.extra_price) || 0)
        });
    }
    return clean;
}

function emitDraft(req, payload) {
    const io = req.app.get('io');
    if (io) io.emit('draft-updated', payload);
}

const getDraft = async (req, res) => {
    try {
        const row = await dbGet(`SELECT items, waiter_name, updated_at FROM order_drafts WHERE table_id = ?`, [req.params.tableId]);
        res.json({ items: row ? JSON.parse(row.items) : [], waiter_name: row ? row.waiter_name : null, updated_at: row ? row.updated_at : null });
    } catch (err) {
        console.error('[DraftController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const saveDraft = async (req, res) => {
    try {
        const tableId = Number(req.params.tableId);
        const items = sanitizeItems(req.body.items);
        if (!Number.isInteger(tableId) || items === null) {
            return res.status(400).json({ error: 'Borrador inválido.' });
        }
        const table = await dbGet(`SELECT id FROM tables WHERE id = ?`, [tableId]);
        if (!table) return res.status(404).json({ error: 'Mesa no encontrada.' });

        const before = await dbGet(`SELECT 1 AS x FROM order_drafts WHERE table_id = ?`, [tableId]);
        if (items.length === 0) {
            await dbRun(`DELETE FROM order_drafts WHERE table_id = ?`, [tableId]);
        } else {
            await dbRun(
                `INSERT INTO order_drafts (table_id, items, waiter_name, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                 ON CONFLICT(table_id) DO UPDATE SET items = excluded.items, waiter_name = excluded.waiter_name, updated_at = CURRENT_TIMESTAMP`,
                [tableId, JSON.stringify(items), String(req.body.waiter_name || '').slice(0, 60) || null]
            );
        }

        emitDraft(req, { table_id: tableId, items, device_id: String(req.body.device_id || '') });
        // La marca de "sin enviar" en la cuadrícula solo cambia al aparecer o desaparecer el borrador.
        if (!!before !== items.length > 0) emitUpdate(req);

        res.json({ success: true });
    } catch (err) {
        console.error('[DraftController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

module.exports = { getDraft, saveDraft, emitDraft, sanitizeItems };
