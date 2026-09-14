const db = require('./src/config/db');
const ThermalPrinter = require("node-thermal-printer").printer;
const PrinterTypes = require("node-thermal-printer").types;

// ========================================================
// ⚙️ CONFIGURACIÓN DE LA IMPRESORA FÍSICA
// ========================================================
const printer = new ThermalPrinter({
  type: PrinterTypes.EPSON,       // El protocolo EPSON (ESC/POS) es el estándar para casi todas
  interface: 'printer:CajaEstampida',    // <--- AQUÍ PONDRÁS EL NOMBRE DE LA IMPRESORA EN WINDOWS
  characterSet: 'PC858_LATIN',    // Para que salgan bien las 'ñ' y acentos
  removeSpecialCharacters: false,
  lineCharacter: "=",
});

// MOTOR DE IMPRESIÓN: Intenta imprimir físicamente, si falla, muestra en consola
async function ejecutarImpresion(nombreDocumento) {
    try {
        await printer.execute();
        console.log(`\n[ ✅ ÉXITO ] ${nombreDocumento} impreso físicamente y papel cortado.`);
        printer.clear();
    } catch (error) {
        console.log(`\n[ ⚠️ AVISO ] Impresora física no detectada. El sistema simuló la impresión en memoria.`);
        printer.clear(); 
    }
}

// ---------------------------------------------

const printComanda = (orderId) => {
    const orderQuery = `SELECT o.id, t.table_number, o.waiter_name, o.created_at FROM orders o LEFT JOIN tables t ON o.table_id = t.id WHERE o.id = ?`;
    db.get(orderQuery, [orderId], (err, order) => {
        if (err || !order) return console.error('Error al buscar la orden:', err);
        const itemsQuery = `SELECT oi.quantity, p.name, oi.notes, p.station FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?`;
        
        db.all(itemsQuery, [orderId], async (err, items) => {
            console.log(`\nGenerando Comanda #${order.id}...`);

            printer.alignCenter();
            printer.bold(true);
            printer.println("=== NUEVA COMANDA ===");
            printer.bold(false);
            printer.println(`TICKET: #${order.id.toString().padStart(5, '0')} - MESA: ${order.table_number || 'N/A'}`);
            printer.println(`MESERO: ${order.waiter_name.toUpperCase()}`);
            printer.println("--------------------------------");
            
            printer.alignLeft();
            const cocinaItems = items.filter(i => i.station === 'COCINA');
            const barraItems = items.filter(i => i.station === 'BARRA');
            
            if (cocinaItems.length > 0) {
                printer.bold(true); printer.println('--- COCINA ---'); printer.bold(false);
                cocinaItems.forEach(item => { 
                    printer.println(`${item.quantity} x ${item.name.toUpperCase()}`); 
                    if (item.notes) printer.println(`   -> ${item.notes.toUpperCase()}`); 
                });
            }
            if (barraItems.length > 0) {
                printer.bold(true); printer.println('--- BARRA ---'); printer.bold(false);
                barraItems.forEach(item => { 
                    printer.println(`${item.quantity} x ${item.name.toUpperCase()}`); 
                    if (item.notes) printer.println(`   -> ${item.notes.toUpperCase()}`); 
                });
            }
            
            printer.println("================================");
            printer.cut(); // Comando para cortar el papel
            await ejecutarImpresion("Comanda");
        });
    });
};

const printTicket = (orderId, paymentMethod, amountPaid) => {
    const orderQuery = `SELECT o.id, t.table_number, o.waiter_name FROM orders o LEFT JOIN tables t ON o.table_id = t.id WHERE o.id = ?`;
    db.get(orderQuery, [orderId], (err, order) => {
        const itemsQuery = `SELECT oi.quantity, p.name, p.price FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?`;
        
        db.all(itemsQuery, [orderId], async (err, items) => {
            console.log(`\nGenerando Ticket de Cobro #${order.id}...`);

            printer.alignCenter();
            printer.bold(true);
            printer.println("ASADERO LA ESTAMPIDA");
            printer.bold(false);
            printer.println("Blvd Francisco Fdez Arteaga 2096");
            printer.println("Tuxtepec, Oaxaca");
            printer.println("--------------------------------");
            printer.println(`TICKET: #${order.id.toString().padStart(5, '0')} - MESA: ${order.table_number || 'N/A'}`);
            printer.println(`MESERO: ${order.waiter_name.toUpperCase()}`);
            printer.println("--------------------------------");
            
            printer.alignLeft();
            let total = 0;
            items.forEach(item => {
                const subtotal = item.quantity * item.price; total += subtotal;
                printer.leftRight(`${item.quantity}x ${item.name}`, `$${subtotal.toFixed(2)}`);
            });
            
            printer.println("--------------------------------");
            printer.bold(true);
            printer.leftRight("TOTAL", `$${total.toFixed(2)}`);
            printer.bold(false);
            
            const cambio = amountPaid - total;
            printer.leftRight(`PAGO EN ${paymentMethod.toUpperCase()}`, `$${amountPaid.toFixed(2)}`);
            printer.leftRight("CAMBIO", `$${cambio > 0 ? cambio.toFixed(2) : 0}`);
            
            printer.alignCenter();
            printer.println(" ");
            printer.println("¡Gracias por su visita!");
            printer.println("================================");
            printer.cut();
            await ejecutarImpresion("Ticket de Cliente");
        });
    });
};

const printAdicion = (orderId, newItems) => {
    const orderQuery = `SELECT o.id, t.table_number, o.waiter_name FROM orders o LEFT JOIN tables t ON o.table_id = t.id WHERE o.id = ?`;
    db.get(orderQuery, [orderId], (err, order) => {
        const productIds = newItems.map(i => i.product_id).join(',');
        db.all(`SELECT id, name, station FROM products WHERE id IN (${productIds})`, [], async (err, products) => {
            console.log(`\nGenerando Adición para Orden #${order.id}...`);

            printer.alignCenter();
            printer.bold(true);
            printer.println("=== ADICION A COMANDA ===");
            printer.bold(false);
            printer.println(`TICKET: #${order.id.toString().padStart(5, '0')} - MESA: ${order.table_number || 'N/A'}`);
            printer.println(`MESERO: ${order.waiter_name.toUpperCase()}`);
            printer.println("--------------------------------");
            
            printer.alignLeft();
            const itemsToPrint = newItems.map(ni => { const prod = products.find(p => p.id === ni.product_id); return { ...ni, name: prod.name, station: prod.station }; });
            const cocinaItems = itemsToPrint.filter(i => i.station === 'COCINA');
            const barraItems = itemsToPrint.filter(i => i.station === 'BARRA');
            
            if (cocinaItems.length > 0) { printer.bold(true); printer.println('--- COCINA ---'); printer.bold(false); cocinaItems.forEach(item => { printer.println(`${item.quantity} x ${item.name.toUpperCase()}`); if (item.notes) printer.println(`   -> ${item.notes.toUpperCase()}`); }); }
            if (barraItems.length > 0) { printer.bold(true); printer.println('--- BARRA ---'); printer.bold(false); barraItems.forEach(item => { printer.println(`${item.quantity} x ${item.name.toUpperCase()}`); if (item.notes) printer.println(`   -> ${item.notes.toUpperCase()}`); }); }
            
            printer.println("================================");
            printer.cut();
            await ejecutarImpresion("Adición");
        });
    });
};



const printCorteZ = async (date, summary) => {
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
    printer.leftRight("VENTA TOTAL:", `$${summary.total_general.toFixed(2)}`);
    printer.bold(false);
    printer.println("--------------------------------");
    
    // === NUEVO: DESGLOSE DE COBROS Y GASTOS ===
    printer.alignCenter();
    printer.bold(true);
    printer.println("--- METODOS DE PAGO ---");
    printer.bold(false);
    printer.alignLeft();
    printer.leftRight("EFECTIVO CAJA:", `$${(summary.total_efectivo || 0).toFixed(2)}`);
    printer.leftRight("TERMINAL (TPV):", `$${(summary.total_tarjeta || 0).toFixed(2)}`);
    
    if (summary.total_gastos && summary.total_gastos > 0) {
        printer.leftRight("RETIROS/GASTOS:", `-$${summary.total_gastos.toFixed(2)}`);
    }
    printer.println("--------------------------------");

    // === NUEVO: DESGLOSE DE SERVICIO (COMEDOR VS LLEVAR) ===
    printer.alignCenter();
    printer.bold(true);
    printer.println("--- TIPO DE SERVICIO ---");
    printer.bold(false);
    printer.alignLeft();
    printer.leftRight("COMEDOR:", `$${(summary.total_comedor || 0).toFixed(2)}`);
    printer.leftRight("PARA LLEVAR:", `$${(summary.total_llevar || 0).toFixed(2)}`);
    printer.println("--------------------------------");
    
    // === DESGLOSE DE MESEROS ===
    printer.alignCenter();
    printer.bold(true);
    printer.println("--- DESGLOSE POR MESERO ---");
    printer.bold(false);
    printer.alignLeft();
    for (const [waiter, info] of Object.entries(summary.ventas_por_mesero)) {
        printer.leftRight(`${waiter} (${info.tickets}t)`, `$${info.total.toFixed(2)}`);
    }
    
    printer.println("================================");
    printer.println(" ");
    printer.println(" ");
    printer.cut();
    await ejecutarImpresion("Corte de Caja Z");
};

module.exports = { printComanda, printTicket, printAdicion, printCorteZ };