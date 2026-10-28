// Formato de todos los tickets (comanda, cobro, precuenta, reimpresión), impresión térmica y corte en hoja carta.
// Scripts clásicos que comparten el ámbito global; se cargan en orden desde index.html.

// ========================================================
// DATOS DEL NEGOCIO Y WHATSAPP DE FACTURACIÓN
// ========================================================
const NEGOCIO = {
    nombre: 'ASADERO LA ESTAMPIDA',
    calle: 'Blvd. Fco. Fdez. Arteaga #2096',
    ciudad: 'Tuxtepec, Oaxaca',
    telefono: '287 134 7643'
};
let ticketConfig = { whatsapp: NEGOCIO.telefono };

async function loadTicketConfig() {
    try {
        const res = await fetch('/api/catalog/ticket-config');
        if (res.ok) ticketConfig = await res.json();
        const input = document.getElementById('ticket-whatsapp');
        if (input) input.value = ticketConfig.whatsapp || '';
    } catch (_) { /* sin red: se usa el último valor conocido */ }
}
document.addEventListener('DOMContentLoaded', loadTicketConfig);

window.guardarWhatsappFactura = async function() {
    const input = document.getElementById('ticket-whatsapp');
    const whatsapp = (input ? input.value : '').trim();
    try {
        const res = await fetch('/api/catalog/ticket-config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ whatsapp }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return customAlert(data.error || 'No se pudo guardar', 'error');
        ticketConfig = { whatsapp: data.whatsapp };
        customAlert('Los tickets ya muestran este número para facturación.', 'success', 'Guardado');
    } catch (_) { customAlert('Error de red al guardar', 'error'); }
};

// ========================================================
// PIEZAS DEL TICKET (80 mm: texto negro, sin adornos, solo el espacio necesario)
// ========================================================
const TK_CSS = `<style>
.tk { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; line-height: 1.25; color: #000; font-weight: 600; text-align: left; }
.tk * { margin: 0; padding: 0; color: #000; }
.tk .c { text-align: center; }
.tk .b { font-weight: 900; }
.tk .neg { font-size: 13pt; font-weight: 900; letter-spacing: 0.3px; }
.tk .sm { font-size: 8.5pt; }
.tk .sep { border-top: 1px dashed #000; margin: 1.6mm 0; }
.tk .row { display: flex; justify-content: space-between; gap: 2mm; }
.tk .row > span:first-child { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.tk .row > span:last-child { white-space: nowrap; text-align: right; }
.tk .it { margin: 0.5mm 0; }
.tk .pu { font-size: 8.5pt; padding-left: 4mm; }
.tk .tot { font-size: 14pt; font-weight: 900; margin-top: 0.8mm; }
.tk .tag { border: 0.6mm solid #000; text-align: center; font-weight: 900; font-size: 12pt; padding: 0.6mm 0; margin-bottom: 1.5mm; }
.tk .cm-mesa { font-size: 20pt; line-height: 1.1; font-weight: 900; }
.tk .cm-sub { font-size: 11pt; }
.tk .cm-folio { font-size: 14pt; font-weight: 900; white-space: nowrap; }
.tk .cm-area { font-size: 10pt; font-weight: 900; letter-spacing: 1px; margin-bottom: 0.5mm; }
.tk .cm-it { display: flex; gap: 2.5mm; font-size: 13pt; font-weight: 800; margin: 0.8mm 0; }
.tk .cm-it b { min-width: 7mm; text-align: right; }
.tk .cm-nota { font-size: 11pt; font-weight: 700; padding-left: 9.5mm; }
</style>`;

// Tickets para el cliente (cuenta, cobro, reimpresión): formato formal de ticket, letra de máquina y columnas
const TKF_CSS = `<style>
.tkf { font-family: 'Courier New', Courier, monospace; font-size: 9.5pt; line-height: 1.25; color: #000; font-weight: 700; text-align: left; }
.tkf * { margin: 0; padding: 0; color: #000; }
.tkf .c { text-align: center; }
.tkf .f-nom { font-size: 17pt; font-weight: 900; line-height: 1.05; letter-spacing: 1px; margin-bottom: 1mm; }
.tkf .f-dir { font-size: 8.5pt; }
.tkf .f-dbl { border-top: 3px double #000; margin: 1.4mm 0; }
.tkf .f-sep { border-top: 1px dashed #000; margin: 1.4mm 0; }
.tkf .f-tit { font-size: 11pt; font-weight: 900; letter-spacing: 1px; }
.tkf .f-row { display: flex; justify-content: space-between; gap: 2mm; }
.tkf .f-row > span:last-child { white-space: nowrap; text-align: right; }
.tkf .f-tab { display: grid; grid-template-columns: 8mm 1fr 16mm 18mm; column-gap: 1mm; font-size: 9pt; }
.tkf .f-tab .r { text-align: right; white-space: nowrap; }
.tkf .f-th { border-bottom: 1px solid #000; padding-bottom: 0.4mm; margin-bottom: 0.8mm; font-size: 8pt; }
.tkf .f-it { margin-bottom: 0.6mm; }
.tkf .f-tot { display: flex; justify-content: flex-end; gap: 3mm; }
.tkf .f-tot > span:last-child { min-width: 22mm; text-align: right; white-space: nowrap; }
.tkf .f-total { font-size: 13pt; font-weight: 900; margin: 0.8mm 0; }
.tkf .f-tag { border: 0.5mm solid #000; text-align: center; font-weight: 900; padding: 0.5mm 0; margin: 1.2mm 0; }
.tkf .f-pie { font-size: 8.5pt; }
</style>`;

const tkSep = '<div class="sep"></div>';
const tkRow = (left, right, cls = '') => `<div class="row ${cls}"><span>${left}</span><span>${right}</span></div>`;
const tkMoney = (n) => fmtMoney(n);
const tkMesa = (name) => /^\d+$/.test(String(name || '').trim()) ? `Mesa ${name}` : escapeHtml(name || '');
const tkEsLlevar = (name) => String(name || '').toUpperCase().includes('LLEVAR');
const tkMetodo = (m) => ({ EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta', TRANSFERENCIA: 'Transferencia', MIXTO: 'Pago mixto' }[m] || m || '');

function tkFecha(d = new Date()) {
    const f = d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const h = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${f} ${h}`;
}
// "2026-10-27 14:58:03" (guardada en hora local) -> "27/10/2026 14:58"
function tkFechaBD(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(s || '');
    return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : escapeHtml(s || '');
}

// Encabezado formal: nombre en dos renglones, dirección, teléfono y título enmarcado
function tkEncabezado(titulo) {
    return `<div class="c"><div class="f-nom">ASADERO<br>LA ESTAMPIDA</div>`
        + `<div class="f-dir">${NEGOCIO.calle}<br>${NEGOCIO.ciudad}<br>Tel. ${NEGOCIO.telefono}</div></div>`
        + `<div class="f-dbl"></div><div class="c f-tit">${titulo}</div><div class="f-dbl"></div>`;
}

// FOLIO / MESA, fecha / PAX y mesero
function tkDatosCuenta({ folio, mesa, fecha, pax, mesero }) {
    const mesaTxt = /^\d+$/.test(String(mesa || '').trim()) ? `MESA: ${escapeHtml(mesa)}` : escapeHtml(mesa || '');
    let html = `<div class="f-row"><span>FOLIO: ${escapeHtml(folio)}</span><span>${mesaTxt}</span></div>`;
    html += `<div class="f-row"><span>Fecha: ${fecha}</span><span>${pax ? `PAX: ${pax}` : ''}</span></div>`;
    if (mesero) html += `<div>Mesero: ${escapeHtml(mesero)}</div>`;
    return html + '<div class="f-sep"></div>';
}

// Agrupa platillos iguales (mismo nombre y precio) sin importar las notas
function tkAgrupar(items) {
    const grupos = [];
    items.forEach(it => {
        const unit = (Number(it.price) || 0) + (Number(it.extra_price) || 0);
        const g = grupos.find(x => x.name === it.name && Math.abs(x.unit - unit) < 0.005);
        if (g) g.qty += it.quantity; else grupos.push({ name: it.name, unit, qty: it.quantity });
    });
    return grupos;
}
const tkSuma = (grupos) => Math.round(grupos.reduce((acc, g) => acc + g.unit * g.qty * 100, 0)) / 100;

// Tabla de platillos: CANT / DESCRIPCIÓN / P.U. / IMPORTE
function tkItems(grupos) {
    let html = '<div class="f-tab f-th"><span>CANT</span><span>DESCRIPCIÓN</span><span class="r">P.U.</span><span class="r">IMPORTE</span></div>';
    grupos.forEach(g => {
        html += `<div class="f-tab f-it"><span>${g.qty}</span><span>${escapeHtml(g.name)}</span><span class="r">${tkMoney(g.unit)}</span><span class="r">${tkMoney(g.unit * g.qty)}</span></div>`;
    });
    return html + '<div class="f-sep"></div>';
}

// Renglón de totales alineado a la derecha
const tkTot = (label, amount, cls = '') => `<div class="f-tot ${cls}"><span>${label}</span><span>${amount}</span></div>`;

function tkPie({ folio, factura = true, leyenda = 'No es comprobante fiscal' }) {
    let html = '<div class="f-dbl"></div><div class="c"><div>¡Gracias por su preferencia!</div><div>Vuelva pronto</div>';
    if (factura && ticketConfig.whatsapp) {
        html += `<div class="f-pie" style="margin-top:1.5mm">Facturación: envíe su folio ${escapeHtml(folio)} por WhatsApp al <span style="white-space:nowrap">${escapeHtml(ticketConfig.whatsapp)}</span></div>`;
    }
    return html + `<div class="f-pie" style="margin-top:1mm">* ${leyenda} *</div></div>`;
}

// ========================================================
// COMANDA (cocina y barra): grande, sin precios
// ========================================================
function buildComandaHTML(items, folio, mesa, mesero, esAgregado) {
    const llevar = tkEsLlevar(mesa);
    const etiquetas = [llevar ? 'PARA LLEVAR' : '', esAgregado ? 'AGREGADO' : ''].filter(Boolean).join(' · ');
    const hora = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });

    let html = `${TK_CSS}<div class="tk">`;
    if (etiquetas) html += `<div class="tag">${etiquetas}</div>`;
    // El folio va en el segundo renglón (a la derecha quedaba pegado al borde y no se alcanzaba a imprimir)
    html += `<div class="cm-mesa">${llevar ? escapeHtml(mesa) : `MESA ${escapeHtml(mesa)}`}</div>`;
    html += `<div class="cm-sub"><span class="cm-folio">${escapeHtml(folio)}</span> · ${escapeHtml(mesero)} · ${hora}</div>`;

    const areas = [...new Set(['COCINA', 'BARRA', ...items.map(i => i.station || 'COCINA')])];
    areas.forEach(area => {
        const lista = items.filter(i => (i.station || 'COCINA') === area);
        if (!lista.length) return;
        html += `${tkSep}<div class="cm-area">${escapeHtml(area)}</div>`;
        lista.forEach(it => {
            const llevarItem = it.is_takeaway && !llevar ? ' · LLEVAR' : '';
            html += `<div class="cm-it"><b>${it.quantity}</b><span>${escapeHtml(String(it.name).toUpperCase())}${llevarItem}</span></div>`;
            if (it.notes) html += `<div class="cm-nota">- ${escapeHtml(String(it.notes).toUpperCase())}</div>`;
        });
    });
    return html + '</div>';
}

// ========================================================
// TICKET DE COBRO
// ========================================================
function buildCobroHTML({ folio, mesa, pax, mesero, grupos, abono, descuento = 0, total, propina = 0, metodo, pagado, cambio, saldo = 0 }) {
    let html = `${TKF_CSS}<div class="tkf">${tkEncabezado('TICKET DE COBRO')}`;
    html += tkDatosCuenta({ folio, mesa, fecha: tkFecha(), pax, mesero });

    if (grupos) {
        html += tkItems(grupos);
        if (descuento > 0.005) html += tkTot('SUBTOTAL', tkMoney(total + descuento)) + tkTot('DESCUENTO', `-${tkMoney(descuento)}`);
    } else {
        html += tkTot('ABONO A CUENTA', tkMoney(abono)) + '<div class="f-sep"></div>';
    }
    if (propina > 0) html += tkTot('CONSUMO', tkMoney(total)) + tkTot('PROPINA', tkMoney(propina));
    html += tkTot('TOTAL', `$${tkMoney(total + propina)}`, 'f-total');
    html += '<div class="f-sep"></div>';
    html += tkTot(tkMetodo(metodo).toUpperCase(), tkMoney(pagado));
    if (cambio > 0.005) html += tkTot('CAMBIO', tkMoney(cambio));
    if (saldo > 0.005) html += `<div class="f-tag">SALDO PENDIENTE: $${tkMoney(saldo)}</div>`;
    return html + tkPie({ folio }) + '</div>';
}

// ========================================================
// CUENTA DE MESA (completa, dividida o parcial por consumo)
// ========================================================
function buildPrecuentaHTML({ titulo = 'CUENTA DE MESA', folio, mesa, pax, mesero, grupos, descuento = 0, personas = 1, factura = false }) {
    const subtotal = tkSuma(grupos);
    const total = Math.max(0, Math.round((subtotal - descuento) * 100) / 100);
    let html = `${TKF_CSS}<div class="tkf">${tkEncabezado(titulo)}`;
    html += tkDatosCuenta({ folio, mesa, fecha: tkFecha(), pax, mesero });
    html += tkItems(grupos);
    if (descuento > 0.005) html += tkTot('SUBTOTAL', tkMoney(subtotal)) + tkTot('DESCUENTO', `-${tkMoney(descuento)}`);
    html += tkTot('TOTAL A PAGAR', `$${tkMoney(total)}`, 'f-total');
    if (personas > 1) html += `<div class="f-tag">ENTRE ${personas} PERSONAS: $${tkMoney(montoPorPersona(total, personas))} C/U</div>`;
    return html + tkPie({ folio, factura, leyenda: 'No es comprobante de pago' }) + '</div>';
}

// ========================================================
// REIMPRESIÓN DE UN TICKET YA COBRADO
// ========================================================
function buildReimpresionHTML(order, mesa) {
    const folio = order.folio || `#${order.id}`;
    const grupos = tkAgrupar(order.items || []);
    const total = Number(order.total) || 0;
    const propina = Number(order.tip_amount) || 0;
    const descuento = Number(order.discount_amount) || 0;
    const efectivo = Number(order.cash_amount) || 0;
    const tarjeta = Number(order.card_amount) || 0;

    let html = `${TKF_CSS}<div class="tkf">${tkEncabezado('REIMPRESIÓN DE TICKET')}`;
    html += tkDatosCuenta({ folio, mesa, fecha: tkFechaBD(order.closed_at || order.created_at), pax: order.guests, mesero: order.waiter_name });
    html += tkItems(grupos);
    if (descuento > 0.005) html += tkTot('SUBTOTAL', tkMoney(total + descuento)) + tkTot('DESCUENTO', `-${tkMoney(descuento)}`);
    if (propina > 0) html += tkTot('CONSUMO', tkMoney(total)) + tkTot('PROPINA', tkMoney(propina));
    html += tkTot('TOTAL', `$${tkMoney(total + propina)}`, 'f-total');
    html += '<div class="f-sep"></div>';
    if (efectivo > 0 && tarjeta > 0) {
        html += tkTot('EFECTIVO', tkMoney(efectivo)) + tkTot('TARJETA/TRANSF.', tkMoney(tarjeta));
    } else {
        html += tkTot(tkMetodo(order.payment_method || 'EFECTIVO').toUpperCase(), tkMoney(order.amount_paid || total));
    }
    if ((Number(order.change_amount) || 0) > 0.005) html += tkTot('CAMBIO', tkMoney(order.change_amount));
    return html + tkPie({ folio }) + '</div>';
}

// ========================================================
// IMPRESIÓN TÉRMICA: el papel se corta justo donde termina el ticket
// ========================================================
function ticketDocument(content) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Ticket</title><style>
        @page { margin: 0; }
        html, body { margin: 0; background: #fff; }
        /* La TM-T20II no imprime los últimos milímetros del lado derecho: se deja margen extra ahí */
        body { width: 80mm; box-sizing: border-box; padding: 1mm 7mm 3mm 4mm; -webkit-font-smoothing: none; text-rendering: geometricPrecision; }
    </style></head><body>${content}</body></html>`;
}

// ========================================================
// CORTE DE CAJA EN HOJA CARTA
// ========================================================
function buildCorteCartaHTML({ fecha, sum, orders, fondo, conteo, mesasAbiertas }) {
    const $ = (n) => `$${fmtMoney(n)}`;
    const esperado = calcularEfectivoEsperado(fondo, sum);
    const [y, m, d] = fecha.split('-').map(Number);
    const fechaTexto = new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const fechaLarga = fechaTexto.charAt(0).toUpperCase() + fechaTexto.slice(1);
    const promedio = sum.num_tickets ? sum.total_general / sum.num_tickets : 0;

    const meseros = Object.entries(sum.ventas_por_mesero || {}).sort((a, b) => b[1].total - a[1].total)
        .map(([n, v]) => `<tr><td>${escapeHtml(n)}</td><td class="r">${v.tickets}</td><td class="r">${$(v.total)}</td></tr>`).join('')
        || '<tr><td colspan="3" class="vacio">Sin ventas</td></tr>';
    const gastos = (sum.desglose_gastos || []).map(g => `<tr><td>${escapeHtml(g.concept)}</td><td>${escapeHtml(g.category || '')}</td><td class="r">${$(g.amount)}</td></tr>`).join('')
        || '<tr><td colspan="3" class="vacio">Sin gastos</td></tr>';
    const tickets = [...orders].sort((a, b) => String(a.closed_at).localeCompare(String(b.closed_at))).map(o => {
        const ef = Number(o.cash_amount) || 0, tj = Number(o.card_amount) || 0;
        const metodo = ef > 0 && tj > 0 ? 'Mixto' : tkMetodo(o.payment_method);
        return `<tr><td>${escapeHtml(o.folio || '#' + o.id)}</td><td>${escapeHtml((o.closed_at || '').slice(11, 16))}</td><td>${tkMesa(o.table_number)}</td><td>${escapeHtml(o.waiter_name || '')}</td><td>${metodo}</td><td class="r">${o.tip_amount > 0 ? $(o.tip_amount) : ''}</td><td class="r">${$(o.total)}</td></tr>`;
    }).join('') || '<tr><td colspan="7" class="vacio">Sin tickets cobrados</td></tr>';

    let conteoHtml = '<p class="nota">No se guardó conteo de caja para este día.</p>';
    if (conteo) {
        const dif = Number(conteo.difference) || 0;
        const etiqueta = Math.abs(dif) < 0.005 ? 'Exacto' : dif < 0 ? 'Faltante' : 'Sobrante';
        conteoHtml = `<table class="flujo">
            <tr><td>Efectivo contado</td><td class="r">${$(conteo.counted)}</td></tr>
            <tr class="fuerte"><td>${etiqueta}</td><td class="r">${$(Math.abs(dif))}</td></tr>
            ${conteo.next_fondo !== null && conteo.next_fondo !== undefined ? `<tr><td>Fondo para el día siguiente</td><td class="r">${$(conteo.next_fondo)}</td></tr>` : ''}
        </table>`;
    }

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Corte ${fecha}</title><style>
        @page { size: letter; margin: 14mm; }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: 'Segoe UI', Arial, sans-serif; font-size: 10pt; color: #111; }
        h1 { font-size: 17pt; margin: 0; }
        h2 { font-size: 11pt; margin: 16px 0 6px; padding-bottom: 3px; border-bottom: 1.5px solid #111; text-transform: uppercase; letter-spacing: 0.5px; }
        .cab { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2.5px solid #111; padding-bottom: 8px; }
        .cab .sub { font-size: 11pt; margin-top: 2px; }
        .cab .gen { font-size: 8.5pt; color: #555; text-align: right; }
        .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 12px; }
        .kpi { border: 1px solid #bbb; border-radius: 6px; padding: 7px 9px; }
        .kpi .l { font-size: 8pt; color: #555; text-transform: uppercase; letter-spacing: 0.4px; }
        .kpi .v { font-size: 13.5pt; font-weight: 700; margin-top: 2px; }
        .dos { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 4px 6px; border-bottom: 1px solid #ddd; text-align: left; vertical-align: top; }
        th { font-size: 8.5pt; text-transform: uppercase; color: #444; border-bottom: 1.5px solid #888; }
        .r { text-align: right; white-space: nowrap; }
        .flujo td { border-bottom: 1px dotted #bbb; }
        .fuerte td { font-weight: 700; font-size: 11pt; border-top: 1.5px solid #111; border-bottom: none; }
        .vacio, .nota { color: #777; text-align: center; }
        .nota { text-align: left; margin: 4px 0; }
        .aviso { margin-top: 10px; padding: 7px 10px; border: 1.5px solid #111; font-weight: 700; }
        .tickets td, .tickets th { font-size: 9pt; padding: 3px 6px; }
        .tickets tr { break-inside: avoid; }
        .firmas { display: flex; gap: 40px; margin-top: 40px; break-inside: avoid; }
        .firmas div { flex: 1; border-top: 1px solid #111; padding-top: 4px; text-align: center; font-size: 9pt; }
    </style></head><body>
        <div class="cab">
            <div><h1>Corte de caja · ${NEGOCIO.nombre}</h1><div class="sub">${fechaLarga}</div></div>
            <div class="gen">Generado ${tkFecha()}</div>
        </div>
        ${mesasAbiertas > 0 ? `<div class="aviso">Atención: había ${mesasAbiertas} mesa(s) sin cobrar al generar este corte; no están incluidas.</div>` : ''}
        <div class="kpis">
            <div class="kpi"><div class="l">Venta total</div><div class="v">${$(sum.total_general)}</div></div>
            <div class="kpi"><div class="l">Tickets</div><div class="v">${sum.num_tickets}</div></div>
            <div class="kpi"><div class="l">Ticket promedio</div><div class="v">${$(promedio)}</div></div>
            <div class="kpi"><div class="l">Gastos</div><div class="v">${$(sum.total_gastos || 0)}</div></div>
            <div class="kpi"><div class="l">Efectivo</div><div class="v">${$(sum.total_efectivo)}</div></div>
            <div class="kpi"><div class="l">Tarjeta / transf.</div><div class="v">${$(sum.total_tarjeta)}</div></div>
            <div class="kpi"><div class="l">Comedor</div><div class="v">${$(sum.total_comedor || 0)}</div></div>
            <div class="kpi"><div class="l">Para llevar</div><div class="v">${$(sum.total_llevar || 0)}</div></div>
        </div>
        <div class="dos">
            <div>
                <h2>Efectivo en caja</h2>
                <table class="flujo">
                    <tr><td>Fondo inicial</td><td class="r">${$(fondo)}</td></tr>
                    <tr><td>+ Ventas en efectivo</td><td class="r">${$(sum.total_efectivo)}</td></tr>
                    <tr><td>− Gastos y retiros</td><td class="r">${$(sum.total_gastos || 0)}</td></tr>
                    <tr><td>− Propinas pagadas con tarjeta</td><td class="r">${$(sum.propinas_tarjeta || 0)}</td></tr>
                    <tr class="fuerte"><td>Efectivo esperado</td><td class="r">${$(esperado)}</td></tr>
                </table>
            </div>
            <div>
                <h2>Conteo de caja</h2>
                ${conteoHtml}
                <h2>Propinas</h2>
                <table class="flujo">
                    <tr><td>En efectivo</td><td class="r">${$(sum.propinas_efectivo || 0)}</td></tr>
                    <tr><td>Con tarjeta</td><td class="r">${$(sum.propinas_tarjeta || 0)}</td></tr>
                </table>
            </div>
        </div>
        <div class="dos">
            <div><h2>Ventas por mesero</h2><table><tr><th>Mesero</th><th class="r">Tickets</th><th class="r">Venta</th></tr>${meseros}</table></div>
            <div><h2>Gastos</h2><table><tr><th>Concepto</th><th>Categoría</th><th class="r">Monto</th></tr>${gastos}</table></div>
        </div>
        <h2>Tickets cobrados</h2>
        <table class="tickets"><tr><th>Folio</th><th>Hora</th><th>Mesa</th><th>Mesero</th><th>Pago</th><th class="r">Propina</th><th class="r">Total</th></tr>${tickets}</table>
        <div class="firmas"><div>Entregó</div><div>Recibió</div></div>
    </body></html>`;
}

// modo: 'imprimir' (impresora de hojas) o 'pdf' (guardar en Documentos)
window.imprimirCorte = async function(modo = 'imprimir') {
    const fecha = (document.getElementById('corte-date-picker') || {}).value || obtenerFechaLocal();
    try {
        const [corteRes, fondoRes, conteoRes] = await Promise.all([
            fetch(`/api/reports/corte?date=${fecha}`),
            fetch(`/api/reports/fondo?date=${fecha}`),
            fetch(`/api/reports/cash-count?date=${fecha}`)
        ]);
        const corte = await corteRes.json();
        if (!corteRes.ok) return customAlert(corte.error || 'No se pudo generar el corte', 'error');
        const fondo = Number((await fondoRes.json()).fondo) || 0;
        const conteo = conteoRes.ok ? (await conteoRes.json()).count : null;
        const html = buildCorteCartaHTML({ fecha, sum: corte.summary, orders: corte.orders || [], fondo, conteo, mesasAbiertas: corte.open_tables || 0 });

        if (window.posDesktop && window.posDesktop.printReport) {
            const r = modo === 'pdf'
                ? await window.posDesktop.saveReportPdf(html, `Corte ${fecha}`)
                : await window.posDesktop.printReport(html);
            if (!r || !r.ok) return customAlert(escapeHtml(r ? r.reason : 'Sin respuesta'), 'error', 'Corte');
            return customAlert(modo === 'pdf' ? 'PDF guardado en Documentos › Cortes La Estampida.' : 'Corte enviado a la impresora de hojas.', 'success', 'Corte');
        }
        // En el navegador: se abre el reporte y se usa la impresión del sistema (permite guardar como PDF)
        const w = window.open('', '_blank');
        if (!w) return customAlert('Permite las ventanas emergentes para imprimir el corte.', 'warning');
        w.document.write(html); w.document.close();
        setTimeout(() => { w.focus(); w.print(); }, 400);
    } catch (e) {
        customAlert('Error de red al generar el corte', 'error');
    }
};
