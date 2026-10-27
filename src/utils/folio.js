const { dbGet, dbRun } = require('./dbHelper');

// ========================================================
// FOLIOS: comedor y para llevar tienen numeración propia.
//   Comedor:    #35, #36, #37...        (continúa después del último folio del sistema anterior)
//   Para llevar: LL-0001, LL-0002...    (nunca se reinicia)
// Cada tipo usa un contador en settings: un folio cancelado nunca se vuelve a usar.
// Las órdenes anteriores a este cambio no tienen folio propio y se muestran con su id (#33).
// ========================================================

// Expresión SQL con la etiqueta del folio de una orden (alias de la tabla orders)
const folioSql = (alias = 'o') => `CASE
    WHEN ${alias}.folio_type = 'L' THEN 'LL-' || printf('%04d', ${alias}.folio_num)
    WHEN ${alias}.folio_type = 'C' THEN '#' || ${alias}.folio_num
    ELSE '#' || ${alias}.id END`;

function folioLabel(type, num, id) {
    if (type === 'L') return `LL-${String(num).padStart(4, '0')}`;
    if (type === 'C') return `#${num}`;
    return `#${id}`;
}

const isTakeawayTable = (tableNumber) => String(tableNumber || '').toUpperCase().includes('LLEVAR');

// Siguiente folio para una mesa. Debe llamarse dentro de la transacción que crea la orden.
async function nextFolio(tableId) {
    const table = await dbGet(`SELECT table_number FROM tables WHERE id = ?`, [tableId]);
    const type = table && isTakeawayTable(table.table_number) ? 'L' : 'C';
    const key = `folio_seq_${type}`;
    const row = await dbGet(`SELECT value FROM settings WHERE key = ?`, [key]);
    let last = row ? parseInt(row.value, 10) || 0 : 0;
    if (!row && type === 'C') {
        // Primera orden de comedor con folio propio: sigue donde se quedó la numeración anterior
        last = (await dbGet(`SELECT MAX(id) AS m FROM orders`)).m || 0;
    }
    const num = last + 1;
    await dbRun(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [key, String(num)]);
    return { type, num, label: folioLabel(type, num) };
}

// Etiqueta del folio de una orden existente (para mensajes de auditoría)
async function orderFolio(orderId) {
    const row = await dbGet(`SELECT id, folio_type, folio_num FROM orders WHERE id = ?`, [orderId]);
    return row ? folioLabel(row.folio_type, row.folio_num, row.id) : `#${orderId}`;
}

module.exports = { folioSql, folioLabel, nextFolio, orderFolio, isTakeawayTable };
