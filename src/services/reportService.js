const { dbAll } = require('../utils/dbHelper');
const { folioSql } = require('../utils/folio');
const { round2 } = require('../utils/money');

/**
 * Calcula los totales, desgloses y métricas del corte de caja para una fecha determinada.
 * Unifica la lógica de reporte para visualización en pantalla e impresión física.
 * @param {string} targetDate - Fecha en formato YYYY-MM-DD
 * @returns {Promise<{ summary: object, orders: Array }>}
 */
async function calculateCorteData(targetDate) {
    const ordersQuery = `
        SELECT o.*, COALESCE(t.table_number, 'Mesa eliminada') AS table_number, ${folioSql('o')} AS folio
        FROM orders o
        LEFT JOIN tables t ON o.table_id = t.id 
        WHERE o.status = 'PAGADA' AND DATE(o.closed_at) = ?
    `;

    const expensesQuery = `SELECT * FROM expenses WHERE DATE(created_at) = ?`;

    const [orders, expRows] = await Promise.all([
        dbAll(ordersQuery, [targetDate]),
        dbAll(expensesQuery, [targetDate])
    ]);

    let totalGastos = 0;
    const desgloseGastos = [];
    if (expRows && expRows.length > 0) {
        expRows.forEach(row => {
            totalGastos += Number(row.amount) || 0;
            desgloseGastos.push(row);
        });
    }

    let totalGeneral = 0;
    const numTickets = orders.length;
    const ventasPorMesero = {};
    let totalEfectivo = 0;
    let totalTarjeta = 0;
    let propinasEfectivo = 0;
    let propinasTarjeta = 0;
    let totalLlevar = 0;
    let totalComedor = 0;

    orders.forEach(o => {
        const orderTotal = round2(o.total);
        totalGeneral += orderTotal;

        const waiter = o.waiter_name || 'Sin Asignar';
        if (!ventasPorMesero[waiter]) {
            ventasPorMesero[waiter] = { total: 0, tickets: 0 };
        }
        ventasPorMesero[waiter].total = round2(ventasPorMesero[waiter].total + orderTotal);
        ventasPorMesero[waiter].tickets += 1;

        const propina = Number(o.tip_amount) || 0;

        let pagadoEfectivo = Number(o.cash_amount) || 0;
        let pagadoTarjeta = Number(o.card_amount) || 0;

        if (pagadoEfectivo === 0 && pagadoTarjeta === 0) {
            if (o.payment_method === 'EFECTIVO') {
                pagadoEfectivo = orderTotal;
            } else {
                pagadoTarjeta = orderTotal;
            }
        }

        totalEfectivo += pagadoEfectivo;
        totalTarjeta += pagadoTarjeta;

        if (o.payment_method === 'EFECTIVO') {
            propinasEfectivo += propina;
        } else {
            propinasTarjeta += propina;
        }

        if (pagadoEfectivo > 0 && pagadoTarjeta > 0) {
            o.payment_method = 'MIXTO';
        }

        // Clasificación por tipo de servicio (comedor vs para llevar)
        if (o.table_number && o.table_number.toUpperCase().includes('LLEVAR')) {
            totalLlevar += orderTotal;
        } else {
            totalComedor += orderTotal;
        }
    });

    const summary = {
        total_general: round2(totalGeneral),
        total_efectivo: round2(totalEfectivo),
        total_tarjeta: round2(totalTarjeta),
        propinas_efectivo: round2(propinasEfectivo),
        propinas_tarjeta: round2(propinasTarjeta),
        total_gastos: round2(totalGastos),
        desglose_gastos: desgloseGastos,
        total_llevar: round2(totalLlevar),
        total_comedor: round2(totalComedor),
        num_tickets: numTickets,
        ventas_por_mesero: ventasPorMesero
    };

    return { summary, orders };
}

module.exports = {
    calculateCorteData
};

