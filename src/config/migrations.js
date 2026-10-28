const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./paths');

// ========================================================
// MIGRACIONES VERSIONADAS
// Cada cambio a datos existentes se agrega al final con el siguiente número y nunca se edita después.
// La versión aplicada se guarda en PRAGMA user_version, así cada migración corre una sola vez.
// Antes de aplicar alguna, se guarda una copia completa de la BD en respaldos/.
// (Las tablas y columnas nuevas siguen en db.js con CREATE/ALTER, que son seguros de repetir.)
// ========================================================
const MIGRATIONS = [
    {
        version: 1,
        name: 'Montos con 2 decimales exactos',
        sql: [
            `UPDATE orders SET total = ROUND(total, 2), remaining_balance = ROUND(remaining_balance, 2),
                tip_amount = ROUND(tip_amount, 2), discount_amount = ROUND(discount_amount, 2),
                amount_paid = ROUND(amount_paid, 2), change_amount = ROUND(change_amount, 2),
                cash_amount = ROUND(cash_amount, 2), card_amount = ROUND(card_amount, 2)`,
            `UPDATE products SET price = ROUND(price, 2)`,
            `UPDATE order_items SET extra_price = ROUND(extra_price, 2)`,
            `UPDATE modifiers SET price = ROUND(price, 2)`,
            `UPDATE expenses SET amount = ROUND(amount, 2)`,
        ],
    },
    {
        version: 2,
        name: 'Precio guardado en cada platillo de las cuentas',
        sql: [
            // Las cuentas anteriores no lo tenían: se toma el precio actual del menú (el mismo que ya mostraban)
            `UPDATE order_items SET unit_price = (SELECT ROUND(price, 2) FROM products WHERE products.id = order_items.product_id)
             WHERE unit_price IS NULL`,
        ],
    },
];

const LATEST_VERSION = MIGRATIONS.length ? MIGRATIONS[MIGRATIONS.length - 1].version : 0;

function runMigrations(db) {
    const get = (sql) => new Promise((res, rej) => db.get(sql, (e, r) => (e ? rej(e) : res(r))));
    const exec = (sql) => new Promise((res, rej) => db.exec(sql, (e) => (e ? rej(e) : res())));
    const run = (sql, params) => new Promise((res, rej) => db.run(sql, params, (e) => (e ? rej(e) : res())));

    return (async () => {
        const current = (await get('PRAGMA user_version')).user_version;
        const pending = MIGRATIONS.filter(m => m.version > current);
        if (!pending.length) return;

        // Respaldo previo (solo si ya hay datos: una BD nueva no tiene nada que perder)
        const { n } = await get('SELECT COUNT(*) AS n FROM orders');
        if (n > 0) {
            const dir = path.join(DATA_DIR, 'respaldos');
            fs.mkdirSync(dir, { recursive: true });
            const dest = path.join(dir, `antes-de-actualizar-v${current}-a-v${LATEST_VERSION}.db`);
            if (fs.existsSync(dest)) fs.unlinkSync(dest);
            await run('VACUUM INTO ?', [dest]);
            console.log(`🗄️ Respaldo previo a migrar: ${dest}`);
        }

        for (const m of pending) {
            await exec('BEGIN');
            try {
                for (const sql of m.sql) await exec(sql);
                await exec(`PRAGMA user_version = ${m.version}`);
                await exec('COMMIT');
                console.log(`✅ Migración ${m.version} aplicada: ${m.name}`);
            } catch (err) {
                await exec('ROLLBACK').catch(() => {});
                throw new Error(`Migración ${m.version} (${m.name}) falló: ${err.message}`);
            }
        }
    })();
}

module.exports = { runMigrations, MIGRATIONS, LATEST_VERSION };
