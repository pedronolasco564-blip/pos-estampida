const db = require('../config/db');

// Obtener todos los productos activos
const getProducts = (req, res) => {
    const query = `SELECT * FROM products WHERE active = 1`;
    db.all(query, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ products: rows });
    });
};

// Obtener todas las mesas y su estado
const getTables = (req, res) => {
    const query = `SELECT * FROM tables`;
    db.all(query, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ tables: rows });
    });
};

module.exports = {
    getProducts,
    getTables
};