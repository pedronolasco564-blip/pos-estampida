const { dbGet, dbAll } = require('../utils/dbHelper');
const ThermalPrinter = require("node-thermal-printer").printer;
const PrinterTypes = require("node-thermal-printer").types;

// ========================================================
// ⚙️ CONFIGURACIÓN DE LA IMPRESORA FÍSICA
// ========================================================
const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,       // El protocolo EPSON (ESC/POS) es el estándar
    interface: process.env.POS_PRINTER || '//localhost/CajaEstampida', // Nombre de la impresora compartida en Windows
    characterSet: 'PC858_EURO',    // Soporte para 'ñ', acentos y símbolo de moneda
    removeSpecialCharacters: false,
    lineCharacter: "=",
});

// Cola serial para evitar condiciones de carrera en el buffer de la impresora
let printQueue = Promise.resolve();

function enqueuePrint(nombreDocumento, printFn) {
    printQueue = printQueue
        .catch((err) => {
            console.error(`[ ⚠️ COLA ] Error recuperado de tarea previa:`, err.message);
        })
        .then(async () => {
            try {
                printer.clear();
                await printFn();
                await ejecutarImpresion(nombreDocumento);
            } catch (err) {
                console.error(`[ ❌ IMPRESIÓN ] Fallo al procesar ${nombreDocumento}:`, err.message);
                try { printer.clear(); } catch (_) {}
            }
        });
    return printQueue;
}

// MOTOR DE IMPRESIÓN: Intenta imprimir físicamente, si falla, muestra en consola
async function ejecutarImpresion(nombreDocumento) {
    try {
        await printer.execute();
        console.log(`\n[ ✅ ÉXITO ] ${nombreDocumento} impreso físicamente y papel cortado.`);
    } catch (error) {
        console.log(`\n[ ⚠️ AVISO ] Impresora física no detectada para ${nombreDocumento}. El sistema simuló la impresión en memoria.`);
    } finally {
        printer.clear();
    }
}

// ---------------------------------------------

const printComanda = (orderId) => {
    return enqueuePrint("Comanda", async () => {
        const orderQuery = `
            SELECT o.id, t.table_number, o.waiter_name, o.created_at 
            FROM orders o 
            LEFT JOIN tables t ON o.table_id = t.id 
            WHERE o.id = ?
        `;
        const order = await dbGet(orderQuery, [orderId]);
        if (!order) {
            console.error(`No se encontró la orden #${orderId} para imprimir comanda.`);
            return;
        }

        const itemsQuery = `
            SELECT oi.quantity, p.name, oi.notes, p.station 
            FROM order_items oi 
            JOIN products p ON oi.product_id = p.id 
            WHERE oi.order_id = ?
        `;
        const items = await dbAll(itemsQuery, [orderId]);

        console.log(`\nGenerando Comanda #${order.id}...`);

        printer.alignCenter();
        printer.bold(true);
        printer.println("=== NUEVA COMANDA ===");
        printer.bold(false);
        printer.println(`TICKET: #${order.id.toString().padStart(5, '0')} - MESA: ${order.table_number || 'N/A'}`);
        printer.println(`MESERO: ${(order.waiter_name || '').toUpperCase()}`);
        printer.println("--------------------------------");
        
        printer.alignLeft();
        const cocinaItems = items.filter(i => i.station === 'COCINA');
        const barraItems = items.filter(i => i.station === 'BARRA');
        
        if (cocinaItems.length > 0) {
            printer.bold(true); 
            printer.println('--- COCINA ---'); 
            printer.bold(false);
            cocinaItems.forEach(item => { 
                printer.println(`${item.quantity} x ${item.name.toUpperCase()}`); 
                if (item.notes) printer.println(`   -> ${item.notes.toUpperCase()}`); 
            });
        }
        if (barraItems.length > 0) {
            printer.bold(true); 
            printer.println('--- BARRA ---'); 
            printer.bold(false);
            barraItems.forEach(item => { 
                printer.println(`${item.quantity} x ${item.name.toUpperCase()}`); 
                if (item.notes) printer.println(`   -> ${item.notes.toUpperCase()}`); 
            });
        }
        
        printer.println("================================");
        printer.cut();
    });
};

const printTicket = (orderId, paymentMethod, amountPaid) => {
    return enqueuePrint("Ticket de Cliente", async () => {
        const orderQuery = `
            SELECT o.id, t.table_number, o.waiter_name 
            FROM orders o 
            LEFT JOIN tables t ON o.table_id = t.id 
            WHERE o.id = ?
        `;
        const order = await dbGet(orderQuery, [orderId]);
        if (!order) {
            console.error(`No se encontró la orden #${orderId} para imprimir ticket.`);
            return;
        }

        const itemsQuery = `
            SELECT oi.quantity, p.name, p.price 
            FROM order_items oi 
            JOIN products p ON oi.product_id = p.id 
            WHERE oi.order_id = ?
        `;
        const items = await dbAll(itemsQuery, [orderId]);

        console.log(`\nGenerando Ticket de Cobro #${order.id}...`);

        printer.alignCenter();
        printer.bold(true);
        printer.println("ASADERO LA ESTAMPIDA");
        printer.bold(false);
        printer.println("Blvd Francisco Fdez Arteaga 2096");
        printer.println("Tuxtepec, Oaxaca");
        printer.println("--------------------------------");
        printer.println(`TICKET: #${order.id.toString().padStart(5, '0')} - MESA: ${order.table_number || 'N/A'}`);
        printer.println(`MESERO: ${(order.waiter_name || '').toUpperCase()}`);
        printer.println("--------------------------------");
        
        printer.alignLeft();
        let total = 0;
        items.forEach(item => {
            const subtotal = item.quantity * item.price; 
            total += subtotal;
            printer.leftRight(`${item.quantity}x ${item.name}`, `$${subtotal.toFixed(2)}`);
        });
        
        printer.println("--------------------------------");
        printer.bold(true);
        printer.leftRight("TOTAL", `$${total.toFixed(2)}`);
        printer.bold(false);
        
        const numericPaid = Number(amountPaid) || 0;
        const cambio = numericPaid - total;
        printer.leftRight(`PAGO EN ${(paymentMethod || '').toUpperCase()}`, `$${numericPaid.toFixed(2)}`);
        printer.leftRight("CAMBIO", `$${cambio > 0 ? cambio.toFixed(2) : '0.00'}`);
        
        printer.alignCenter();
        printer.println(" ");
        printer.println("¡Gracias por su visita!");
        printer.println("================================");
        printer.cut();
    });
};

const printAdicion = (orderId, newItems) => {
    if (!newItems || newItems.length === 0) return Promise.resolve();

    return enqueuePrint("Adición", async () => {
        const orderQuery = `
            SELECT o.id, t.table_number, o.waiter_name 
            FROM orders o 
            LEFT JOIN tables t ON o.table_id = t.id 
            WHERE o.id = ?
        `;
        const order = await dbGet(orderQuery, [orderId]);
        if (!order) {
            console.error(`No se encontró la orden #${orderId} para imprimir adición.`);
            return;
        }

        const productIds = newItems.map(i => i.product_id);
        const placeholders = productIds.map(() => '?').join(',');
        const products = await dbAll(`SELECT id, name, station FROM products WHERE id IN (${placeholders})`, productIds);

        console.log(`\nGenerando Adición para Orden #${order.id}...`);

        printer.alignCenter();
        printer.bold(true);
        printer.println("=== ADICION A COMANDA ===");
        printer.bold(false);
        printer.println(`TICKET: #${order.id.toString().padStart(5, '0')} - MESA: ${order.table_number || 'N/A'}`);
        printer.println(`MESERO: ${(order.waiter_name || '').toUpperCase()}`);
        printer.println("--------------------------------");
        
        printer.alignLeft();
        const itemsToPrint = newItems.map(ni => { 
            const prod = products.find(p => p.id === ni.product_id) || { name: 'Item', station: 'COCINA' }; 
            return { ...ni, name: prod.name, station: prod.station }; 
        });
        const cocinaItems = itemsToPrint.filter(i => i.station === 'COCINA');
        const barraItems = itemsToPrint.filter(i => i.station === 'BARRA');
        
        if (cocinaItems.length > 0) { 
            printer.bold(true); 
            printer.println('--- COCINA ---'); 
            printer.bold(false); 
            cocinaItems.forEach(item => { 
                printer.println(`${item.quantity} x ${item.name.toUpperCase()}`); 
                if (item.notes) printer.println(`   -> ${item.notes.toUpperCase()}`); 
            }); 
        }
        if (barraItems.length > 0) { 
            printer.bold(true); 
            printer.println('--- BARRA ---'); 
            printer.bold(false); 
            barraItems.forEach(item => { 
                printer.println(`${item.quantity} x ${item.name.toUpperCase()}`); 
                if (item.notes) printer.println(`   -> ${item.notes.toUpperCase()}`); 
            }); 
        }
        
        printer.println("================================");
        printer.cut();
    });
};

const printCorteZ = (date, summary) => {
    return enqueuePrint("Corte de Caja Z", async () => {
        console.log(`\nGenerando Corte de Caja ...`);

        printer.alignCenter();
        printer.bold(true);
        printer.println("ASADERO LA ESTAMPIDA");
        printer.println("CORTE DE CAJA (Z)");
        printer.bold(false);
        printer.println(`FECHA: ${date}`);
        printer.println("================================");
        
        printer.alignLeft();
        printer.leftRight("TICKETS COBRADOS:", `${summary.num_tickets}`);
        printer.bold(true);
        printer.leftRight("VENTA TOTAL:", `$${(summary.total_general || 0).toFixed(2)}`);
        printer.bold(false);
        printer.println("--------------------------------");
        
        // Desglose de cobros y retiros
        printer.alignCenter();
        printer.bold(true);
        printer.println("--- METODOS DE PAGO ---");
        printer.bold(false);
        printer.alignLeft();
        printer.leftRight("EFECTIVO CAJA:", `$${(summary.total_efectivo || 0).toFixed(2)}`);
        printer.leftRight("TERMINAL (TPV):", `$${(summary.total_tarjeta || 0).toFixed(2)}`);
        
        if (summary.total_gastos && summary.total_gastos > 0) {
            printer.leftRight("RETIROS/GASTOS:", `-$${(summary.total_gastos || 0).toFixed(2)}`);
        }
        printer.println("--------------------------------");

        // Desglose por tipo de servicio
        printer.alignCenter();
        printer.bold(true);
        printer.println("--- TIPO DE SERVICIO ---");
        printer.bold(false);
        printer.alignLeft();
        printer.leftRight("COMEDOR:", `$${(summary.total_comedor || 0).toFixed(2)}`);
        printer.leftRight("PARA LLEVAR:", `$${(summary.total_llevar || 0).toFixed(2)}`);
        printer.println("--------------------------------");
        
        // Desglose por mesero
        if (summary.ventas_por_mesero && Object.keys(summary.ventas_por_mesero).length > 0) {
            printer.alignCenter();
            printer.bold(true);
            printer.println("--- DESGLOSE POR MESERO ---");
            printer.bold(false);
            printer.alignLeft();
            for (const [waiter, info] of Object.entries(summary.ventas_por_mesero)) {
                printer.leftRight(`${waiter} (${info.tickets}t)`, `$${(info.total || 0).toFixed(2)}`);
            }
        }
        
        printer.println("================================");
        printer.println(" ");
        printer.println(" ");
        printer.cut();
    });
};

module.exports = { printComanda, printTicket, printAdicion, printCorteZ };