const { dbGet, dbAll, dbRun, dbTransaction } = require('../utils/dbHelper');
const { emitUpdate } = require('../utils/emitUpdate');
const { folioSql } = require('../utils/folio');
const { round2 } = require('../utils/money');
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
        const categories = await dbAll(`
            SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category = c.name AND IFNULL(p.deleted, 0) = 0) AS product_count
            FROM categories c ORDER BY c.sort_order, c.id`);
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

        await dbRun(`INSERT INTO categories (name, sort_order) VALUES (?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories))`, [String(name).trim()]);
        emitUpdate(req, 'update-products');
        res.json({ message: 'Categoría creada' });
    } catch (err) {
        if (err.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'La categoría ya existe.' });
        }
        console.error('[CatalogController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

// Renombrar: los platillos de la categoría pasan al nombre nuevo.
const renameCategory = async (req, res) => {
    try {
        const name = String(req.body.name || '').trim();
        if (!name) return res.status(400).json({ error: 'Nombre de categoría requerido.' });
        const cat = await dbGet(`SELECT * FROM categories WHERE id = ?`, [req.params.id]);
        if (!cat) return res.status(404).json({ error: 'Categoría no encontrada.' });

        await dbTransaction(async () => {
            await dbRun(`UPDATE categories SET name = ? WHERE id = ?`, [name, cat.id]);
            await dbRun(`UPDATE products SET category = ? WHERE category = ?`, [name, cat.name]);
        });
        emitUpdate(req, 'update-products');
        res.json({ message: 'Categoría actualizada' });
    } catch (err) {
        if (err.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'Ya existe una categoría con ese nombre.' });
        }
        console.error('[CatalogController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

// Solo se borra si está vacía, para no dejar platillos sin categoría.
const deleteCategory = async (req, res) => {
    try {
        const cat = await dbGet(`SELECT * FROM categories WHERE id = ?`, [req.params.id]);
        if (!cat) return res.status(404).json({ error: 'Categoría no encontrada.' });
        const { n } = await dbGet(`SELECT COUNT(*) AS n FROM products WHERE category = ? AND IFNULL(deleted, 0) = 0`, [cat.name]);
        if (n > 0) {
            return res.status(400).json({ error: `La categoría ${cat.name} tiene ${n} platillo(s). Cámbialos de categoría o bórralos primero.` });
        }
        await dbRun(`DELETE FROM categories WHERE id = ?`, [cat.id]);
        emitUpdate(req, 'update-products');
        res.json({ message: 'Categoría eliminada' });
    } catch (err) {
        console.error('[CatalogController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

// Recibe los ids en el orden deseado.
const reorderCategories = async (req, res) => {
    try {
        const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : [];
        if (!ids.length) return res.status(400).json({ error: 'Orden inválido.' });
        await dbTransaction(async () => {
            for (let i = 0; i < ids.length; i++) {
                await dbRun(`UPDATE categories SET sort_order = ? WHERE id = ?`, [i + 1, ids[i]]);
            }
        });
        emitUpdate(req, 'update-products');
        res.json({ message: 'Orden guardado' });
    } catch (err) {
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

        await dbRun(`INSERT INTO modifiers (name, price) VALUES (?, ?)`, [String(name).trim(), round2(price)]);
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
        const products = await dbAll(`SELECT * FROM products WHERE IFNULL(deleted, 0) = 0`);
        res.json({ products });
    } catch (err) {
        console.error('[CatalogController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const createProduct = async (req, res) => {
    try {
        const { name, price, station, category } = req.body;
        if (!name || !String(name).trim()) return res.status(400).json({ error: 'Nombre de producto requerido.' });
        if (!(round2(price) >= 0)) return res.status(400).json({ error: 'Precio inválido.' });

        await dbRun(
            `INSERT INTO products (name, price, station, category, is_available) VALUES (?, ?, ?, ?, 1)`,
            [String(name).trim(), round2(price), station || 'COCINA', category || 'GENERAL']
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
        if (!name || !String(name).trim()) return res.status(400).json({ error: 'Nombre de producto requerido.' });
        if (!(round2(price) >= 0)) return res.status(400).json({ error: 'Precio inválido.' });
        await dbRun(
            `UPDATE products SET name=?, price=?, station=?, category=? WHERE id=?`,
            [String(name).trim(), round2(price), station || 'COCINA', category || 'GENERAL', req.params.id]
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

        // Si ya aparece en cuentas anteriores se oculta (las reimpresiones y el historial lo siguen mostrando)
        const used = await dbGet(`SELECT 1 AS x FROM order_items WHERE product_id = ? LIMIT 1`, [req.params.id]);
        if (used) await dbRun(`UPDATE products SET deleted = 1, is_available = 0 WHERE id = ?`, [req.params.id]);
        else await dbRun(`DELETE FROM products WHERE id = ?`, [req.params.id]);

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
            `INSERT INTO audit_logs (action, details, performed_by, created_at) VALUES (?, ?, ?, datetime('now', '-6 hours'))`,
            ['CAMBIO_PIN', 'La clave de Administrador fue actualizada.', 'Admin']
        );

        res.json({ message: 'PIN actualizado' });
    } catch (err) {
        console.error('[CatalogController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

// ========================================================
// DATOS DE LOS TICKETS (WhatsApp para facturación)
// ========================================================
const DEFAULT_WHATSAPP = '287 134 7643';

const getTicketConfig = async (req, res) => {
    try {
        const row = await dbGet(`SELECT value FROM settings WHERE key = 'whatsapp_factura'`);
        res.json({ whatsapp: row ? row.value : DEFAULT_WHATSAPP });
    } catch (err) {
        console.error('[CatalogController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const saveTicketConfig = async (req, res) => {
    try {
        const whatsapp = String(req.body.whatsapp || '').trim();
        if (!/^[\d +()-]{7,20}$/.test(whatsapp)) return res.status(400).json({ error: 'Número de WhatsApp inválido.' });
        await dbRun(`INSERT OR REPLACE INTO settings (key, value) VALUES ('whatsapp_factura', ?)`, [whatsapp]);
        emitUpdate(req, 'update-products');
        res.json({ message: 'Guardado', whatsapp });
    } catch (err) {
        console.error('[CatalogController]', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

module.exports = {
    getTicketConfig,
    saveTicketConfig,
    logoutAdmin,
    getTables,
    createTable,
    deleteTable,
    getCategories,
    createCategory,
    renameCategory,
    deleteCategory,
    reorderCategories,
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