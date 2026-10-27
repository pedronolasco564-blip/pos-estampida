const db = require('../config/db');

/**
 * Ejecuta una consulta SELECT que retorna una sola fila.
 * @param {string} sql 
 * @param {Array} params 
 * @returns {Promise<any>}
 */
function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
}

/**
 * Ejecuta una consulta SELECT que retorna múltiples filas.
 * @param {string} sql 
 * @param {Array} params 
 * @returns {Promise<any[]>}
 */
function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows || []);
        });
    });
}

/**
 * Ejecuta una sentencia INSERT, UPDATE o DELETE.
 * @param {string} sql 
 * @param {Array} params 
 * @returns {Promise<{ lastID: number, changes: number }>}
 */
function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) return reject(err);
            resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

/**
 * Ejecuta sentencias SQL arbitrarias (ej. PRAGMAs, scripts).
 * @param {string} sql 
 * @returns {Promise<void>}
 */
function dbExec(sql) {
    return new Promise((resolve, reject) => {
        db.exec(sql, (err) => {
            if (err) return reject(err);
            resolve();
        });
    });
}

/**
 * Ejecuta una serie de operaciones dentro de una transacción atómica.
 * En caso de error, realiza ROLLBACK automático.
 * @param {Function} asyncCallback 
 * @returns {Promise<any>}
 */
async function dbTransaction(asyncCallback) {
    await dbRun('BEGIN IMMEDIATE TRANSACTION');
    try {
        const result = await asyncCallback();
        await dbRun('COMMIT');
        return result;
    } catch (error) {
        try {
            await dbRun('ROLLBACK');
        } catch (rollbackErr) {
            console.error('Error al hacer rollback:', rollbackErr.message);
        }
        throw error;
    }
}

module.exports = {
    db,
    dbGet,
    dbAll,
    dbRun,
    dbExec,
    dbTransaction
};

