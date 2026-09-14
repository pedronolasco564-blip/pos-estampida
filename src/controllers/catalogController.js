const db = require('../config/db');
const crypto = require('crypto');



const getTables = (req, res) => { const query = `SELECT t.*, (SELECT SUM(o.total) FROM orders o WHERE o.table_id = t.id AND o.status = 'ABIERTA') as current_total, (SELECT remaining_balance FROM orders o WHERE o.table_id = t.id AND o.status = 'ABIERTA') as remaining_balance, (SELECT CAST((julianday('now') - julianday(created_at)) * 24 * 60 AS INTEGER) FROM orders o WHERE o.table_id = t.id AND o.status = 'ABIERTA') as minutes_open FROM tables t`; db.all(query, [], (err, tables) => { if (err) return res.status(500).json({ error: err.message }); res.json({tables}); }); };
const createTable = (req, res) => { db.run(`INSERT INTO tables (table_number) VALUES (?)`, [req.body.table_number], function(err) { req.app.get('io').emit('update-tables'); res.json({message: 'Mesa creada'}); }); };
const deleteTable = (req, res) => { db.run(`DELETE FROM tables WHERE id = ?`, [req.params.id], function(err) { req.app.get('io').emit('update-tables'); res.json({message: 'Mesa eliminada'}); }); };

const getCategories = (req, res) => { db.all(`SELECT * FROM categories`, [], (err, categories) => { res.json({categories}); }); };
const createCategory = (req, res) => { db.run(`INSERT INTO categories (name) VALUES (?)`, [req.body.name], function(err) { res.json({message: 'Categoría creada'}); }); };

const getWaiters = (req, res) => { db.all(`SELECT * FROM waiters`, [], (err, waiters) => { res.json({waiters}); }); };
const createWaiter = (req, res) => { db.run(`INSERT INTO waiters (name) VALUES (?)`, [req.body.name], function(err) { res.json({message: 'Mesero creado'}); }); };
const deleteWaiter = (req, res) => { db.run(`DELETE FROM waiters WHERE id = ?`, [req.params.id], function(err) { res.json({message: 'Mesero eliminado'}); }); };

const getModifiers = (req, res) => { db.all(`SELECT * FROM modifiers`, [], (err, modifiers) => { res.json({modifiers}); }); };
const createModifier = (req, res) => { db.run(`INSERT INTO modifiers (name, price) VALUES (?, ?)`, [req.body.name, req.body.price || 0], function(err) { res.json({message: 'Modificador creado'}); }); };
const deleteModifier = (req, res) => { db.run(`DELETE FROM modifiers WHERE id = ?`, [req.params.id], function(err) { res.json({message: 'Modificador eliminado'}); }); };

const getProducts = (req, res) => { db.all(`SELECT * FROM products`, [], (err, products) => { res.json({products}); }); };

const createProduct = (req, res) => { 
    const {name, price, station, category} = req.body; 
    db.run(`INSERT INTO products (name, price, station, category, is_available) VALUES (?, ?, ?, ?, 1)`, [name, price, station, category], function(err) { 
        req.app.get('io').emit('update-products'); // AVISA A TODOS
        res.json({message: 'Producto creado'}); 
    }); 
};

const updateProduct = (req, res) => { 
    const {name, price, station, category} = req.body; 
    db.run(`UPDATE products SET name=?, price=?, station=?, category=? WHERE id=?`, [name, price, station, category, req.params.id], function(err) { 
        req.app.get('io').emit('update-products'); // AVISA A TODOS
        res.json({message: 'Producto actualizado'}); 
    }); 
};

const toggleProduct = (req, res) => {
    const { is_available } = req.body;
    db.run(`UPDATE products SET is_available = ? WHERE id = ?`, [is_available, req.params.id], function(err) {
        if (err) return res.status(500).json({error: err.message});
        req.app.get('io').emit('update-products'); // AVISA A TODOS INSTANTÁNEAMENTE
        res.json({message: 'Estado actualizado'});
    });
};

const deleteProduct = (req, res) => { db.run(`DELETE FROM products WHERE id = ?`, [req.params.id], function(err) { req.app.get('io').emit('update-products'); res.json({message: 'Producto eliminado'}); }); };

const verifyPinEndpoint = (req, res) => { const { pin } = req.body; const hash = crypto.createHash('sha256').update(pin || '').digest('hex'); db.get(`SELECT value FROM settings WHERE key = 'admin_pin'`, [], (err, row) => { if (err) return res.status(500).json({ error: err.message }); if (!row || row.value !== hash) return res.status(403).json({ error: 'PIN INCORRECTO' }); res.json({ success: true }); }); };
const changePin = (req, res) => { const { current_pin, new_pin } = req.body; if (!current_pin || !new_pin) return res.status(400).json({ error: 'Faltan datos' }); const currentHash = crypto.createHash('sha256').update(current_pin).digest('hex'); db.get(`SELECT value FROM settings WHERE key = 'admin_pin'`, [], (err, row) => { if (err) return res.status(500).json({ error: err.message }); if (!row || row.value !== currentHash) return res.status(403).json({ error: 'El PIN actual es incorrecto' }); const newHash = crypto.createHash('sha256').update(new_pin).digest('hex'); db.run(`UPDATE settings SET value = ? WHERE key = 'admin_pin'`, [newHash], function(err) { if (err) return res.status(500).json({ error: err.message }); db.run(`INSERT INTO audit_logs (action, details, performed_by) VALUES (?, ?, ?)`, ['CAMBIO_PIN', 'La clave de Administrador fue actualizada.', 'Admin']); res.json({ message: 'PIN actualizado' }); }); }); };

module.exports = { getTables, createTable, deleteTable, getCategories, createCategory, getWaiters, createWaiter, deleteWaiter, getModifiers, createModifier, deleteModifier, getProducts, createProduct, updateProduct, toggleProduct, deleteProduct, verifyPinEndpoint, changePin };