const { dbGet, dbAll, dbRun } = require('../utils/dbHelper');
const { calculateCorteData } = require('./reportService');

// ========================================================
// CAJA: conteo físico guardado, fondo del día siguiente y reporte mensual
// ========================================================

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Denominaciones del arqueo (b = billete, m = moneda; hay billete y moneda de $20)
const DENOMINATIONS = {
    b1000: 1000, b500: 500, b200: 200, b100: 100, b50: 50, b20: 20,
    m20: 20, m10: 10, m5: 5, m2: 2, m1: 1, m050: 0.5
};

const round2 = (n) => Math.round(n * 100) / 100;
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const isMonth = (s) => /^\d{4}-\d{2}$/.test(String(s || ''));

function nextDate(date) {
    const [y, m, d] = date.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    return next.toISOString().slice(0, 10);
}

async function getFondo(date) {
    const row = await dbGet(`SELECT value FROM settings WHERE key = ?`, [`fondo_${date}`]);
    return row ? parseFloat(row.value) || 0 : 0;
}

// Misma fórmula que la pantalla del corte: fondo + efectivo vendido − gastos − propinas pagadas con tarjeta
function expectedCash(fondo, summary) {
    return round2(fondo + summary.total_efectivo - (summary.total_gastos || 0) - summary.propinas_tarjeta);
}

// Valida las piezas contadas y calcula el total; null si los datos no son válidos
function sanitizeDenominations(input) {
    if (!input || typeof input !== 'object') return null;
    const clean = {};
    let total = 0;
    for (const [key, value] of Object.entries(DENOMINATIONS)) {
        const qty = input[key] === undefined || input[key] === '' ? 0 : Number(input[key]);
        if (!Number.isInteger(qty) || qty < 0 || qty > 100000) return null;
        if (qty > 0) clean[key] = qty;
        total += qty * value;
    }
    return { clean, total: round2(total) };
}

async function getCashCount(date) {
    const row = await dbGet(`SELECT * FROM cash_counts WHERE count_date = ?`, [date]);
    if (!row) return null;
    return { ...row, denominations: JSON.parse(row.denominations) };
}

// Guarda el conteo del día (el último conteo reemplaza al anterior) y, si se indica, el fondo de mañana
async function saveCashCount(date, denominations, nextFondo) {
    const parsed = sanitizeDenominations(denominations);
    if (!parsed) throw Object.assign(new Error('Conteo inválido'), { status: 400 });
    if (nextFondo !== null && nextFondo !== undefined && (!(Number(nextFondo) >= 0) || Number(nextFondo) > 1000000)) {
        throw Object.assign(new Error('Fondo para mañana inválido'), { status: 400 });
    }

    const { summary } = await calculateCorteData(date);
    const fondo = await getFondo(date);
    const expected = expectedCash(fondo, summary);
    const difference = round2(parsed.total - expected);
    const fondoNext = nextFondo === null || nextFondo === undefined || nextFondo === '' ? null : round2(Number(nextFondo));

    await dbRun(
        `INSERT INTO cash_counts (count_date, denominations, counted, expected, difference, next_fondo, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now', '-6 hours'))
         ON CONFLICT(count_date) DO UPDATE SET denominations = excluded.denominations, counted = excluded.counted,
             expected = excluded.expected, difference = excluded.difference, next_fondo = excluded.next_fondo, updated_at = excluded.updated_at`,
        [date, JSON.stringify(parsed.clean), parsed.total, expected, difference, fondoNext]
    );
    if (fondoNext !== null) {
        await dbRun(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [`fondo_${nextDate(date)}`, fondoNext]);
    }
    const etiqueta = difference === 0 ? 'cuadre exacto' : difference < 0 ? `faltante $${Math.abs(difference).toFixed(2)}` : `sobrante $${difference.toFixed(2)}`;
    await dbRun(
        `INSERT INTO audit_logs (action, details, performed_by, created_at) VALUES (?, ?, ?, datetime('now', '-6 hours'))`,
        ['CONTEO_CAJA', `Conteo del ${date}: contado $${parsed.total.toFixed(2)}, esperado $${expected.toFixed(2)} (${etiqueta})${fondoNext !== null ? `; fondo para ${nextDate(date)}: $${fondoNext.toFixed(2)}` : ''}`, 'Admin']
    );
    return { count_date: date, counted: parsed.total, expected, difference, next_fondo: fondoNext, next_date: nextDate(date) };
}

// Un renglón por día del mes con movimiento + totales + gastos agrupados por concepto
async function calculateMonthly(month) {
    const [y, m] = month.split('-').map(Number);
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();

    const counts = await dbAll(`SELECT * FROM cash_counts WHERE count_date LIKE ?`, [`${month}-%`]);
    const countByDate = Object.fromEntries(counts.map(c => [c.count_date, c]));

    const days = [];
    for (let d = 1; d <= daysInMonth; d++) {
        const date = `${month}-${String(d).padStart(2, '0')}`;
        const { summary } = await calculateCorteData(date);
        const count = countByDate[date];
        if (summary.num_tickets === 0 && !summary.total_gastos && !count) continue;
        const fondo = await getFondo(date);
        days.push({
            date,
            weekday: DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()],
            tickets: summary.num_tickets,
            efectivo: round2(summary.total_efectivo),
            tpv: round2(summary.total_tarjeta),
            total: round2(summary.total_general),
            gastos: round2(summary.total_gastos || 0),
            propinas_tarjeta: round2(summary.propinas_tarjeta),
            fondo: round2(fondo),
            esperado: expectedCash(fondo, summary),
            contado: count ? count.counted : null,
            diferencia: count ? count.difference : null
        });
    }

    const sum = (k) => round2(days.reduce((acc, d) => acc + (d[k] || 0), 0));
    const withSales = days.filter(d => d.total > 0);
    const best = withSales.reduce((a, b) => (b.total > (a ? a.total : -1) ? b : a), null);
    const diferencias = days.filter(d => d.diferencia !== null);
    const totals = {
        tickets: days.reduce((acc, d) => acc + d.tickets, 0),
        efectivo: sum('efectivo'),
        tpv: sum('tpv'),
        total: sum('total'),
        gastos: sum('gastos'),
        dias_con_venta: withSales.length,
        promedio_diario: withSales.length ? round2(sum('total') / withSales.length) : 0,
        mejor_dia: best ? { date: best.date, weekday: best.weekday, total: best.total } : null,
        faltantes: round2(diferencias.filter(d => d.diferencia < 0).reduce((acc, d) => acc + d.diferencia, 0)),
        sobrantes: round2(diferencias.filter(d => d.diferencia > 0).reduce((acc, d) => acc + d.diferencia, 0)),
        dias_contados: diferencias.length
    };

    const gastos_por_concepto = await dbAll(
        `SELECT UPPER(TRIM(concept)) AS concepto, MAX(category) AS categoria, ROUND(SUM(amount), 2) AS total, COUNT(*) AS veces
         FROM expenses WHERE strftime('%Y-%m', created_at) = ?
         GROUP BY UPPER(TRIM(concept)) ORDER BY total DESC`,
        [month]
    );

    return { month, label: `${MESES[m - 1]} ${y}`, days, totals, gastos_por_concepto };
}

// Archivo Excel del mes: hoja de resumen diario y hoja de gastos por concepto
async function buildMonthlyWorkbook(report) {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'POS La Estampida';
    const money = '"$"#,##0.00';
    const header = (row) => {
        row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD35400' } }; c.alignment = { horizontal: 'center' }; });
    };

    const ws = wb.addWorksheet(`Resumen ${report.label}`.slice(0, 31));
    ws.columns = [
        { key: 'date', width: 12 }, { key: 'weekday', width: 11 }, { key: 'tickets', width: 9 },
        { key: 'efectivo', width: 14 }, { key: 'tpv', width: 14 }, { key: 'total', width: 14 },
        { key: 'gastos', width: 14 }, { key: 'fondo', width: 13 }, { key: 'esperado', width: 15 },
        { key: 'contado', width: 15 }, { key: 'diferencia', width: 14 }, { key: 'estado', width: 12 }
    ];
    ws.mergeCells('A1:L1');
    ws.getCell('A1').value = `ASADERO LA ESTAMPIDA · Ventas de ${report.label}`;
    ws.getCell('A1').font = { bold: true, size: 14 };
    header(ws.addRow(['Fecha', 'Día', 'Tickets', 'Efectivo', 'TPV', 'Total', 'Gastos', 'Fondo (F.C)', 'Esperado en caja', 'Contado', 'Diferencia', 'Estado']));
    const first = ws.rowCount + 1;
    report.days.forEach(d => {
        ws.addRow({
            ...d,
            estado: d.diferencia === null ? 'Sin contar' : d.diferencia < 0 ? 'Faltante' : d.diferencia > 0 ? 'Sobrante' : 'Exacto'
        });
    });
    const last = ws.rowCount;
    const totalRow = ws.addRow(['TOTAL', '', report.totals.tickets]);
    ['D', 'E', 'F', 'G'].forEach(col => {
        totalRow.getCell(col).value = report.days.length ? { formula: `SUM(${col}${first}:${col}${last})`, result: report.totals[{ D: 'efectivo', E: 'tpv', F: 'total', G: 'gastos' }[col]] } : 0;
    });
    totalRow.font = { bold: true };
    ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'].forEach(col => { ws.getColumn(col).numFmt = money; });
    for (let r = first; r <= last; r++) {
        const cell = ws.getCell(`K${r}`);
        if (typeof cell.value === 'number' && cell.value < 0) cell.font = { color: { argb: 'FFC0392B' }, bold: true };
    }
    ws.addRow([]);
    ws.addRow(['Promedio diario', '', '', '', '', report.totals.promedio_diario]).font = { bold: true };
    if (report.totals.mejor_dia) ws.addRow(['Mejor día', `${report.totals.mejor_dia.weekday} ${report.totals.mejor_dia.date}`, '', '', '', report.totals.mejor_dia.total]);
    ws.addRow(['Faltantes del mes', '', '', '', '', report.totals.faltantes]);
    ws.addRow(['Sobrantes del mes', '', '', '', '', report.totals.sobrantes]);

    const wg = wb.addWorksheet('Gastos por concepto');
    wg.columns = [{ width: 28 }, { width: 18 }, { width: 10 }, { width: 15 }];
    header(wg.addRow(['Concepto', 'Categoría', 'Veces', 'Total']));
    report.gastos_por_concepto.forEach(g => wg.addRow([g.concepto, g.categoria, g.veces, g.total]));
    wg.addRow(['TOTAL', '', '', report.totals.gastos]).font = { bold: true };
    wg.getColumn(4).numFmt = money;

    return wb.xlsx.writeBuffer();
}

module.exports = { DENOMINATIONS, isDate, isMonth, nextDate, getFondo, expectedCash, getCashCount, saveCashCount, calculateMonthly, buildMonthlyWorkbook };
