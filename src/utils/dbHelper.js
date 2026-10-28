const { AsyncLocalStorage } = require('async_hooks');
const db = require('../config/db');

// ========================================================
// ACCESO A LA BD CON TURNOS
// Todo el servidor comparte UNA conexión de SQLite. Sin turnos, dos meseros enviando a la vez abrían dos
// transacciones en la misma conexión: la segunda fallaba y su ROLLBACK deshacía también la primera.
// Ahora cada transacción espera su turno, y las consultas sueltas esperan a que termine la transacción en curso.
// Dentro de una transacción (mismo flujo async) las consultas corren directo, sin volver a hacer fila.
// ========================================================
const txContext = new AsyncLocalStorage();
let tail = Promise.resolve();

function inTurn(fn) {
    const run = tail.then(fn, fn);
    tail = run.catch(() => {});
    return run;
}
const scheduled = (fn) => (txContext.getStore() ? fn() : inTurn(fn));

function rawGet(sql, params) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    });
}
function rawAll(sql, params) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
    });
}
function rawRun(sql, params) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) return reject(err);
            resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}
function rawExec(sql) {
    return new Promise((resolve, reject) => {
        db.exec(sql, (err) => (err ? reject(err) : resolve()));
    });
}

/**
 * Ejecuta una consulta SELECT que retorna una sola fila.
 * @param {string} sql
 * @param {Array} params
 * @returns {Promise<any>}
 */
const dbGet = (sql, params = []) => scheduled(() => rawGet(sql, params));

/**
 * Ejecuta una consulta SELECT que retorna múltiples filas.
 * @param {string} sql
 * @param {Array} params
 * @returns {Promise<any[]>}
 */
const dbAll = (sql, params = []) => scheduled(() => rawAll(sql, params));

/**
 * Ejecuta una sentencia INSERT, UPDATE o DELETE.
 * @param {string} sql
 * @param {Array} params
 * @returns {Promise<{ lastID: number, changes: number }>}
 */
const dbRun = (sql, params = []) => scheduled(() => rawRun(sql, params));

/**
 * Ejecuta sentencias SQL arbitrarias (ej. PRAGMAs, scripts).
 * @param {string} sql
 * @returns {Promise<void>}
 */
const dbExec = (sql) => scheduled(() => rawExec(sql));

/**
 * Ejecuta una serie de operaciones dentro de una transacción atómica, en su turno.
 * En caso de error, realiza ROLLBACK automático. Una transacción dentro de otra se une a la de afuera.
 * @param {Function} asyncCallback
 * @returns {Promise<any>}
 */
function dbTransaction(asyncCallback) {
    if (txContext.getStore()) return asyncCallback();
    return inTurn(() => txContext.run(true, async () => {
        await rawRun('BEGIN IMMEDIATE TRANSACTION', []);
        try {
            const result = await asyncCallback();
            await rawRun('COMMIT', []);
            return result;
        } catch (error) {
            try {
                await rawRun('ROLLBACK', []);
            } catch (rollbackErr) {
                console.error('Error al hacer rollback:', rollbackErr.message);
            }
            throw error;
        }
    }));
}

module.exports = {
    db,
    dbGet,
    dbAll,
    dbRun,
    dbExec,
    dbTransaction
};
