const { dbGet, dbAll, dbRun } = require('../utils/dbHelper');
const { emitUpdate } = require('../utils/emitUpdate');
const { folioSql } = require('../utils/folio');
const { verifyAdminPin, hashPin } = require('../middleware/verifyPin');
const { createSession, destroySession, getToken } = require('../middleware/adminSession');

// ========================================================
// MESAS (TABLES)
// ========================================================
const getTables = async (req, res) => {
    try {
        const query = `
            SELECT 
                t.*,
                o.total AS current_total,
                o.remaining_balance,
                CAST((julianday('now') - julianday(o.created_at)) * 24 * 60 AS INTEGER) AS minutes_open,
                o.id AS active_folio,
                o.folio AS active_folio_label,
                o.waiter_name,
                d.items IS NOT NULL AS has_draft,
                d.waiter_name AS draft_waiter
            FROM tables t
            LEFT JOIN order_drafts d ON d.table_id = t.id
            LEFT JOIN (
                SELECT table_id, id, total, remaining_balance, created_at, waiter_name, ${folioSql('orders')} AS folio
                FROM orders
                WHERE status = 'ABIERTA'
                GROUP BY table_id
            ) o ON o.table_id = t.id
        `;
        const tables = await dbAll(query);
        res.json({ tables });
    } catch (err) {
        console.error('[CatalogController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const createTable = async (req, res) => {
    try {
        const { table_number } = req.body;
        if (!table_number) {
            return res.status(400).json({ error: 'El número de mesa es requerido.' });
        }
        await dbRun(`INSERT INTO tables (table_number) VALUES (?)`, [String(table_number).trim()]);
        
        emitUpdate(req);

        res.json({ message: 'Mesa creada' });
    } catch (err) {
        if (err.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'La mesa ya existe.' });
        }
        console.error('[CatalogController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const deleteTable = async (req, res) => {
    try {
        const table = await dbGet(`SELECT status FROM tables WHERE id = ?`, [req.params.id]);
        if (!table) return res.status(404).json({ error: 'Mesa no encontrada.' });
        if (table.status === 'OCUPADA') {
            return res.status(400).json({ error: 'No se puede eliminar una mesa ocupada. Cierre o libere la cuenta primero.' });
        }

        await dbRun(`DELETE FROM order_drafts WHERE table_id = ?`, [req.params.id]);
        await dbRun(`DELETE FROM tables WHERE id = ?`, [req.params.id]);
        
        emitUpdate(req);

        res.json({ message: 'Mesa eliminada' });
    } catch (err) {
        console.error('[CatalogController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

// ========================================================
// CATEGORÍAS
// ========================================================
const getCategories = async (req, res) => {
    try {
        const categories = await dbAll(`SELECT * FROM categories`);
        res.json({ categories });
    } catch (err) {
        console.error('[CatalogController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const createCategory = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Nombre de categoría requerido.' });

        await dbRun(`INSERT INTO categories (name) VALUES (?)`, [String(name).trim()]);
        res.json({ message: 'Categoría creada' });
    } catch (err) {
        if (err.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'La categoría ya existe.' });
        }
        console.error('[CatalogController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

// ========================================================
// MESEROS
// ========================================================
const getWaiters = async (req, res) => {
    try {
        const waiters = await dbAll(`SELECT * FROM waiters`);
        res.json({ waiters });
    } catch (err) {
        console.error('[CatalogController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const createWaiter = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Nombre de mesero requerido.' });

        await dbRun(`INSERT INTO waiters (name) VALUES (?)`, [String(name).trim()]);
        res.json({ message: 'Mesero creado' });
    } catch (err) {
        if (err.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'El mesero ya existe.' });
        }
        console.error('[CatalogController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const deleteWaiter = async (req, res) => {
    try {
        const waiter = await dbGet(`SELECT name FROM waiters WHERE id = ?`, [req.params.id]);
        if (!waiter) return res.status(404).json({ error: 'Mesero no encontrado.' });

        const openOrder = await dbGet(`SELECT id FROM orders WHERE waiter_name = ? AND status = 'ABIERTA'`, [waiter.name]);
        if (openOrder) {
            return res.status(400).json({ error: 'No se puede eliminar el mesero porque tiene mesas activas abiertas.' });
        }

        await dbRun(`DELETE FROM waiters WHERE id = ?`, [req.params.id]);
        res.json({ message: 'Mesero eliminado' });
    } catch (err) {
        console.error('[CatalogController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

// ========================================================
// MODIFICADORES
// ========================================================
const getModifiers = async (req, res) => {
    try {
        const modifiers = await dbAll(`SELECT * FROM modifiers`);
        res.json({ modifiers });
    } catch (err) {
        console.error('[CatalogController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const createModifier = async (req, res) => {
    try {
        const { name, price } = req.body;
        if (!name) return res.status(400).json({ error: 'Nombre de modificador requerido.' });

        await dbRun(`INSERT INTO modifiers (name, price) VALUES (?, ?)`, [String(name).trim(), Number(price) || 0]);
        res.json({ message: 'Modificador creado' });
    } catch (err) {
        if (err.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'El modificador ya existe.' });
        }
        console.error('[CatalogController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const deleteModifier = async (req, res) => {
    try {
        await dbRun(`DELETE FROM modifiers WHERE id = ?`, [req.params.id]);
        res.json({ message: 'Modificador eliminado' });
    } catch (err) {
        console.error('[CatalogController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

// ========================================================
// PRODUCTOS
// ========================================================
const getProducts = async (req, res) => {
    try {
        const products = await dbAll(`SELECT * FROM products`);
        res.json({ products });
    } catch (err) {
        console.error('[CatalogController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const createProduct = async (req, res) => {
    try {
        const { name, price, station, category } = req.body;
        if (!name) return res.status(400).json({ error: 'Nombre de producto requerido.' });

        await dbRun(
            `INSERT INTO products (name, price, station, category, is_available) VALUES (?, ?, ?, ?, 1)`,
            [String(name).trim(), Number(price) || 0, station || 'COCINA', category || 'GENERAL']
        );

        emitUpdate(req, 'update-products');

        res.json({ message: 'Producto creado' });
    } catch (err) {
        console.error('[CatalogController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const updateProduct = async (req, res) => {
    try {
        const { name, price, station, category } = req.body;
        await dbRun(
            `UPDATE products SET name=?, price=?, station=?, category=? WHERE id=?`,
            [String(name).trim(), Number(price) || 0, station || 'COCINA', category || 'GENERAL', req.params.id]
        );

        emitUpdate(req, 'update-products');

        res.json({ message: 'Producto actualizado' });
    } catch (err) {
        console.error('[CatalogController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const toggleProduct = async (req, res) => {
    try {
        const { is_available } = req.body;
        await dbRun(`UPDATE products SET is_available = ? WHERE id = ?`, [is_available ? 1 : 0, req.params.id]);

        emitUpdate(req, 'update-products');

        res.json({ message: 'Estado actualizado' });
    } catch (err) {
        console.error('[CatalogController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const deleteProduct = async (req, res) => {
    try {
        const openOrderItem = await dbGet(
            `SELECT oi.id FROM order_items oi 
             JOIN orders o ON oi.order_id = o.id 
             WHERE oi.product_id = ? AND o.status = 'ABIERTA'`,
            [req.params.id]
        );
        if (openOrderItem) {
            return res.status(400).json({ error: 'No se puede eliminar el platillo porque está en comandas de mesas activas. Márquelo como agotado o cierre las mesas primero.' });
        }

        await dbRun(`DELETE FROM products WHERE id = ?`, [req.params.id]);

        emitUpdate(req, 'update-products');

        res.json({ message: 'Producto eliminado' });
    } catch (err) {
        console.error('[CatalogController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

// ========================================================
// SEGURIDAD / PIN
// ========================================================
const verifyPinEndpoint = async (req, res) => {
    try {
        const { pin } = req.body;
        const isValid = await verifyAdminPin(pin);
        if (!isValid) {
            return res.status(403).json({ error: 'PIN INCORRECTO' });
        }
        res.json({ success: true, token: createSession() });
    } catch (err) {
        console.error('[CatalogController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const logoutAdmin = (req, res) => {
    destroySession(getToken(req));
    res.json({ success: true });
};

const changePin = async (req, res) => {
    try {
        const { current_pin, new_pin } = req.body;
        if (!current_pin || !new_pin) {
            return res.status(400).json({ error: 'Faltan datos' });
        }

        if (!/^\d{4,8}$/.test(String(new_pin))) {
            return res.status(400).json({ error: 'El PIN nuevo debe tener entre 4 y 8 dígitos.' });
        }

        const isCurrentValid = await verifyAdminPin(current_pin);
        if (!isCurrentValid) {
            return res.status(403).json({ error: 'El PIN actual es incorrecto' });
        }

        const newHash = await hashPin(new_pin);
        await dbRun(`UPDATE settings SET value = ? WHERE key = 'admin_pin'`, [newHash]);
        await dbRun(
            `INSERT INTO audit_logs (action, details, performed_by) VALUES (?, ?, ?)`,
            ['CAMBIO_PIN', 'La clave de Administrador fue actualizada.', 'Admin']
        );

        res.json({ message: 'PIN actualizado' });
    } catch (err) {
        console.error('[CatalogController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

module.exports = {
    logoutAdmin,
    getTables,
    createTable,
    deleteTable,
    getCategories,
    createCategory,
    getWaiters,
    createWaiter,
    deleteWaiter,
    getModifiers,
    createModifier,
    deleteModifier,
    getProducts,
    createProduct,
    updateProduct,
    toggleProduct,
    deleteProduct,
    verifyPinEndpoint,
    changePin
};