// Cobro, división de cuenta, tickets y reimpresión.
// Scripts clásicos que comparten el ámbito global; se cargan en orden desde index.html.
// ========================================================
// SISTEMA INTELIGENTE DE COBRO EN TIEMPO REAL
// ========================================================
// ========================================================
// SELECTOR POR CONSUMO: una fila por platillo con cantidades (−/+/Todo) en lugar de una casilla por unidad.
// Lo usan el cobro (caja) y la cuenta por consumo (mesero). seleccion = { [order_item id]: cantidad }
// ========================================================
const precioUnidad = (it) => (Number(it.price) || 0) + (Number(it.extra_price) || 0);
const totalSeleccion = (items, sel) => Math.round(items.reduce((acc, it) => acc + (sel[it.id] || 0) * precioUnidad(it) * 100, 0)) / 100;

function renderSelectorConsumo(container, items, seleccion, onChange, titulo = '') {
    if (!items.length) { container.innerHTML = '<p class="pay-items-title">No hay platillos pendientes.</p>'; return; }
    container.innerHTML = (titulo ? `<div class="pay-items-title">${titulo}</div>` : '') + items.map(it => {
        const n = seleccion[it.id] || 0;
        const nota = it.notes ? ` · ${escapeHtml(it.notes)}` : '';
        return `<div class="pc-row ${n ? 'on' : ''}" data-id="${it.id}">
            <div class="pc-name">${escapeHtml(it.name)}<small>${it.quantity} × $${fmtMoney(precioUnidad(it))}${nota}</small></div>
            <div class="pc-ctrl"><button type="button" data-d="-1">−</button><b>${n}</b><button type="button" data-d="1">+</button><button type="button" class="pc-all" data-d="all">Todo</button></div>
            <div class="pc-sub">$${fmtMoney(precioUnidad(it) * n)}</div>
        </div>`;
    }).join('');
    container.onclick = (e) => {
        const b = e.target.closest('button[data-d]');
        if (!b) return;
        const it = items.find(x => x.id === Number(b.closest('.pc-row').dataset.id));
        if (!it) return;
        let n = seleccion[it.id] || 0;
        n = b.dataset.d === 'all' ? (n === it.quantity ? 0 : it.quantity) : Math.max(0, Math.min(it.quantity, n + Number(b.dataset.d)));
        if (n) seleccion[it.id] = n; else delete seleccion[it.id];
        renderSelectorConsumo(container, items, seleccion, onChange, titulo);
        onChange();
    };
}

// ========================================================
// COBRO: modo normal (toda la cuenta) o por consumo (con botones "Persona 1, 2..." si el mesero ya separó la cuenta)
// ========================================================
let payModoConsumo = false;
let paySeleccion = {};
let payGroups = [];

const pendientesPago = () => savedOrderItems.filter(i => i.paid !== 1);
function parseGrupos(raw) { try { const g = JSON.parse(raw || '[]'); return Array.isArray(g) ? g : []; } catch (_) { return []; } }

// Lo que aún falta pagar de cada persona (ya se descuenta lo cobrado)
function seleccionDeGrupo(g, pend) {
    const sel = {};
    if (g.paid) return sel;
    (g.items || []).forEach(({ id, qty }) => {
        const it = pend.find(x => x.id === id);
        if (!it) return;
        const n = Math.min(qty, it.quantity - (sel[id] || 0));
        if (n > 0) sel[id] = (sel[id] || 0) + n;
    });
    return sel;
}

function renderPayGroups() {
    const el = document.getElementById('pay-groups');
    const pend = pendientesPago();
    if (!payModoConsumo || !payGroups.length) { el.innerHTML = ''; return; }
    const actual = JSON.stringify(paySeleccion);
    el.innerHTML = payGroups.map((g, i) => {
        const sel = seleccionDeGrupo(g, pend);
        const monto = totalSeleccion(pend, sel);
        const on = monto > 0 && JSON.stringify(sel) === actual;
        return `<button type="button" class="pay-group-btn ${on ? 'on' : ''}" data-g="${i}" ${monto > 0 ? '' : 'disabled'}>${escapeHtml(g.name)} · ${monto > 0 ? `$${fmtMoney(monto)}` : '✓ pagado'}</button>`;
    }).join('');
    el.onclick = (e) => {
        const b = e.target.closest('button[data-g]');
        if (!b) return;
        const sel = seleccionDeGrupo(payGroups[Number(b.dataset.g)], pendientesPago());
        paySeleccion = JSON.stringify(sel) === JSON.stringify(paySeleccion) ? {} : sel;
        renderPayItems();
        syncSeleccionPago();
    };
}

function renderPayItems() {
    const cont = document.getElementById('items-to-pay-container');
    const pend = pendientesPago();
    document.getElementById('btn-split-items').classList.toggle('on', payModoConsumo);
    if (!payModoConsumo) {
        // Vista de la cuenta (solo lectura; en la PC aparece a la izquierda)
        cont.classList.add('pay-items-readonly');
        cont.onclick = null;
        cont.innerHTML = pend.length ? '<div class="pay-items-title">Cuenta</div>' + pend.map(it => `<div class="pc-row readonly">
            <div class="pc-name">${it.quantity}× ${escapeHtml(it.name)}${it.notes ? `<small>${escapeHtml(it.notes)}</small>` : ''}</div>
            <div class="pc-sub">$${fmtMoney(precioUnidad(it) * it.quantity)}</div></div>`).join('') : '';
    } else {
        cont.classList.remove('pay-items-readonly');
        renderSelectorConsumo(cont, pend, paySeleccion, syncSeleccionPago, 'Elige lo que paga esta persona');
    }
    renderPayGroups();
}

function syncSeleccionPago() {
    selectedItemsToPay = Object.entries(paySeleccion).map(([id, qty]) => ({ id: Number(id), qty }));
    inputAmountPaid.value = getMontoEsperado().toFixed(2);
    calcularCambioEnVivo();
    renderPayGroups();
}

// Índice de la persona cuyo grupo coincide con lo elegido (se manda al cobrar para marcarla como pagada)
function grupoSeleccionado() {
    if (!payModoConsumo || !selectedItemsToPay.length) return null;
    const actual = JSON.stringify(paySeleccion), pend = pendientesPago();
    const i = payGroups.findIndex(g => JSON.stringify(seleccionDeGrupo(g, pend)) === actual);
    return i >= 0 ? i : null;
}

function getMontoEsperado() {
    if (payModoConsumo && selectedItemsToPay.length > 0) return totalSeleccion(pendientesPago(), paySeleccion);
    return currentRemainingBalance;
}

function calcularCambioEnVivo() {
    const montoIngresado = parseFloat(inputAmountPaid.value) || 0;
    const esperado = getMontoEsperado();
    const displayTexto = document.getElementById('change-display-text');
    // El total del pie: toda la cuenta, o solo lo elegido (por persona o por consumo)
    const parcial = payModoConsumo && selectedItemsToPay.length > 0;
    document.getElementById('pay-cobrar-label').textContent = parcial ? 'ESTA PARTE:' : 'POR COBRAR:';
    document.getElementById('pay-remaining-display').textContent = esperado.toFixed(2);
    const btnConfirmar = document.getElementById('btn-confirm-pay');

    // 💡 REPARACIÓN MATEMÁTICA: Redondeo estricto a 2 decimales
    const diferencia = Math.round((montoIngresado - esperado) * 100) / 100;

    if (diferencia < 0) {
        displayTexto.innerHTML = `⚠️ ABONO (Restan: $${Math.abs(diferencia).toFixed(2)})`;
        displayTexto.style.color = '#f39c12'; // Color naranja (alerta visual)
        
        // 💡 SOLUCIÓN: Botón 100% encendido y desbloqueado para permitir pagos mixtos
        btnConfirmar.style.opacity = '1';
        btnConfirmar.style.pointerEvents = 'auto'; 
    } else {
        displayTexto.innerHTML = diferencia === 0 ? '✅ PAGO EXACTO' : `💵 CAMBIO: $${diferencia.toFixed(2)}`;
        displayTexto.style.color = '#2ecc71'; // Verde seguro
        
        // Botón encendido
        btnConfirmar.style.opacity = '1';
        btnConfirmar.style.pointerEvents = 'auto'; 
    }
}

// El escuchador que hace la magia cada vez que tecleas
inputAmountPaid.addEventListener('input', calcularCambioEnVivo);

// ========================================================
// FASE 1: BILLETES RÁPIDOS (QUICK CASH) PARA CAJA
// ========================================================
window.setQuickCash = function(val) {
    if (!inputAmountPaid) return;
    const esperado = getMontoEsperado();

    if (val === 'exact') {
        inputAmountPaid.value = esperado.toFixed(2);
    } else if (val === 'add100') {
        const current = parseFloat(inputAmountPaid.value) || 0;
        inputAmountPaid.value = (current + 100).toFixed(2);
    } else {
        // Asignación directa de billete ($50, $100, $200, $500, $1000)
        inputAmountPaid.value = parseFloat(val).toFixed(2);
    }

    calcularCambioEnVivo();
};

window.clearQuickCash = function() {
    if (!inputAmountPaid) return;
    inputAmountPaid.value = '';
    calcularCambioEnVivo();
};

btnPayOrder.onclick = async () => {
    const invoiceCheckbox = document.getElementById('require-invoice');
    if(invoiceCheckbox) invoiceCheckbox.checked = false;

    document.getElementById('pay-table-name').textContent = currentTableSpan.textContent;

    // Datos frescos del servidor: lo ya pagado, el saldo real y la división por persona que haya guardado el mesero
    payGroups = [];
    try {
        const r = await fetch(`/api/orders/${currentOrderId}`);
        if (r.ok) {
            const o = (await r.json()).order;
            if (o.status !== 'ABIERTA') {
                await customAlert('Esta cuenta ya fue cobrada desde otro dispositivo.', 'warning', 'Cuenta cerrada');
                clearTableSelection(); loadTables();
                return;
            }
            savedOrderItems = o.items || savedOrderItems;
            currentRemainingBalance = o.remaining_balance !== null && o.remaining_balance !== undefined ? o.remaining_balance : o.total;
            payGroups = parseGrupos(o.split_groups);
        }
    } catch (_) { /* sin red: se usa lo que ya tiene la pantalla */ }

    const totalToPay = parseFloat(orderTotalSpan.textContent);
    currentRemainingBalance = currentRemainingBalance > 0 ? currentRemainingBalance : totalToPay;
    document.getElementById('pay-total-display').textContent = totalToPay.toFixed(2);

    // Si el mesero ya separó la cuenta por persona, se abre directo en modo por consumo con sus botones
    paySeleccion = {}; selectedItemsToPay = [];
    const pend = pendientesPago();
    payModoConsumo = payGroups.some(g => totalSeleccion(pend, seleccionDeGrupo(g, pend)) > 0);
    document.getElementById('items-to-pay-container').style.display = '';
    renderPayItems();

    inputAmountPaid.value = currentRemainingBalance.toFixed(2);
    document.getElementById('tip-amount').value = '';

    calcularCambioEnVivo();
    paymentPanel.style.display = 'flex'; // Ahora se abre como Modal Gigante
    const body = paymentPanel.querySelector('.pay-body'); if (body) body.scrollTop = 0;
    // En la PC el cursor queda listo en "Recibí en caja"; en celular no (abriría el teclado encima de todo)
    if (window.matchMedia('(pointer: fine)').matches) setTimeout(() => { inputAmountPaid.focus(); inputAmountPaid.select(); }, 100);
};

document.getElementById('btn-cancel-pay').onclick = () => {
    paymentPanel.style.display = 'none';
    paySeleccion = {}; payModoConsumo = false;
    selectedItemsToPay = [];
};

document.getElementById('btn-split-equal').onclick = async () => { 
    const personasStr = await customPrompt('¿Entre cuántas personas se va a dividir?', 'number', '2'); 
    if (!personasStr) return; 
    const personas = parseInt(personasStr); 
    if (personas <= 0) return; 
    const porPersona = montoPorPersona(currentRemainingBalance, personas); 
    inputAmountPaid.value = porPersona.toFixed(2); 
    calcularCambioEnVivo();
    await customAlert(`Cada persona pagará: $${porPersona.toFixed(2)}`, 'info'); 
};

document.getElementById('btn-split-items').onclick = () => {
    payModoConsumo = !payModoConsumo;
    paySeleccion = {};
    renderPayItems();
    syncSeleccionPago();
};

document.getElementById('btn-confirm-pay').onclick = async () => {
    const amountPaid = parseFloat(inputAmountPaid.value); const method = document.getElementById('payment-method').value; const tipAmount = parseFloat(document.getElementById('tip-amount').value) || 0; let requireInvoice = false; const invoiceCheckbox = document.getElementById('require-invoice'); if (invoiceCheckbox) requireInvoice = invoiceCheckbox.checked;
    
    const esperado = getMontoEsperado();
    // 💡 REPARACIÓN: Permitimos que pongan menos dinero para registrar un "Abono" o "Pago Mixto"
    if (isNaN(amountPaid) || amountPaid <= 0) { 
        await customAlert('Ingrese un monto válido.', 'error'); return; 
    }
    if (!navigator.onLine) { await customAlert('No hay red.', 'error'); return; }

    // 🛡️ INICIO DEL ESCUDO ANTI-DOBLE CLIC
    const btnCobrar = document.getElementById('btn-confirm-pay');
    const textoOriginal = btnCobrar.textContent;
    btnCobrar.style.pointerEvents = 'none'; // Desactiva el clic
    btnCobrar.style.opacity = '0.5';
    btnCobrar.textContent = '⏳ COBRANDO...';

    try { 
        const response = await fetch(`/api/orders/${currentOrderId}/pay`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payment_method: method, amount_paid: amountPaid, items_to_pay: selectedItemsToPay, tip_amount: tipAmount, needs_invoice: requireInvoice, split_group: grupoSeleccionado() })});
        const result = await response.json(); 
        
        // 🛡️ DEVOLVER EL BOTÓN A LA NORMALIDAD DESPUÉS DE LA RESPUESTA
        btnCobrar.style.pointerEvents = 'auto';
        btnCobrar.style.opacity = '1';
        btnCobrar.textContent = textoOriginal;

        if (response.ok) { 
            paymentPanel.style.display = 'none'; 
            document.getElementById('items-to-pay-container').style.display = 'none'; 
            lastPaymentFullyPaid = result.fully_paid; 
            showTicket(amountPaid, result.change || 0, method, result.fully_paid, result.remaining_balance || 0, tipAmount, currentOrderId, requireInvoice); 
            currentRemainingBalance = result.fully_paid ? 0 : result.remaining_balance; 
            selectedItemsToPay = []; 
            if (result.fully_paid) { delete tableInstructions[currentTableId]; socket.emit('payment-instruction', { tableId: currentTableId, clear: true }); }
            // Se pagó lo que mostraba la pantalla, pero la cuenta creció mientras tanto (otro dispositivo agregó platillos)
            else if (amountPaid + 0.005 >= esperado) { await customAlert(`Mientras cobrabas se agregaron platillos a esta mesa. Queda un saldo pendiente de $${fmtMoney(result.remaining_balance || 0)}.`, 'warning', 'La cuenta cambió'); }
        } else { await customAlert(`Error: ${result.error}`, 'error'); } 
    } catch (error) { 
        btnCobrar.style.pointerEvents = 'auto';
        btnCobrar.style.opacity = '1';
        btnCobrar.textContent = textoOriginal;
        await customAlert('Fallo de red.', 'error'); 
    }
};

function showTicket(amountPaid, change, method, fullyPaid, remainingBalance, tipAmount = 0, orderIdNum, requireInvoice = false) {
    const ticketModal = document.getElementById('ticket-modal');
    const aplicado = Math.round((amountPaid - change) * 100) / 100;
    const datos = {
        folio: currentFolio || '#' + (orderIdNum || 0), mesa: currentTableSpan.textContent, pax: currentPax, mesero: waiterSelect.value,
        total: aplicado, propina: tipAmount, metodo: method, pagado: amountPaid, cambio: change, saldo: fullyPaid ? 0 : remainingBalance
    };

    if (selectedItemsToPay.length > 0) {
        // Pago por consumo: solo los platillos elegidos
        const elegidos = [];
        selectedItemsToPay.forEach(sitp => {
            const original = savedOrderItems.find(i => i.id === sitp.id);
            if (original) elegidos.push({ ...original, quantity: sitp.qty });
        });
        datos.grupos = tkAgrupar(elegidos);
    } else if (fullyPaid && currentRemainingBalance === parseFloat(orderTotalSpan.textContent)) {
        // Cuenta completa en un solo pago: lista de platillos (y descuento si lo hubo)
        datos.grupos = tkAgrupar(savedOrderItems);
        datos.descuento = Math.max(0, Math.round((tkSuma(datos.grupos) - aplicado) * 100) / 100);
    } else {
        datos.abono = aplicado;
    }

    document.getElementById('ticket-content').innerHTML = buildCobroHTML(datos);
    ticketModal.style.display = 'flex';
}

function closeTicketModal() { 
    document.getElementById('ticket-modal').style.display = 'none'; 
    if (isReprinting) { isReprinting = false; return; } 
    if (lastPaymentFullyPaid) { clearTableSelection(); loadTables(); } 
    else { selectTable({ id: currentTableId, table_number: currentTableSpan.textContent, status: 'OCUPADA' }); loadTables(); } 
}

// contenido: HTML a imprimir (los tickets de celulares); si no se da, el que se ve en la vista previa.
// Devuelve { ok, reason } para que quien lo pidió sepa si salió.
async function printTicket(contenido) {
    const ticketContent = typeof contenido === 'string' ? contenido : document.getElementById('ticket-content').innerHTML;

    // 🚀 MAGIA INALÁMBRICA: Si estamos en el celular (por IP), enviamos el ticket por Wi-Fi a la caja.
    if (!esPantallaDeCaja()) {
        // La caja confirma si imprimió; si no hay caja o falló la impresora, el mesero lo sabe al momento
        const r = await new Promise((resolve) => {
            socket.timeout(25000).emit('impresion-remota', ticketContent, (err, res) => resolve(err ? { ok: false, reason: 'Sin respuesta de la caja' } : res));
        });
        if (!r || !r.ok) await customAlert(`El ticket NO se imprimió: ${escapeHtml((r && r.reason) || 'error')}. Avisa en la caja.`, 'error', 'Impresión');
        return r;
    }

    const ticketDoc = ticketDocument(ticketContent);

    // 🖨️ APP DE ESCRITORIO: directo a la impresora de tickets elegida, sin diálogos
    if (window.posDesktop) {
        const result = await window.posDesktop.printTicket(ticketDoc);
        if (!result || !result.ok) await customAlert(`No se pudo imprimir el ticket: ${escapeHtml(result ? result.reason : 'sin respuesta')}. Revisa la impresora en el icono del POS junto al reloj → Impresora de tickets.`, 'error', 'Impresión');
        return result || { ok: false, reason: 'sin respuesta' };
    }

    // 🖨️ MODO PC en navegador (sistema anterior): Imprime físicamente usando un iframe invisible
    let printFrame = document.getElementById('print-frame');
    if (!printFrame) {
        printFrame = document.createElement('iframe');
        printFrame.id = 'print-frame';
        printFrame.style.display = 'none';
        document.body.appendChild(printFrame);
    }
    const frameDoc = printFrame.contentWindow.document;
    frameDoc.open();
    frameDoc.write(ticketDoc);
    frameDoc.close();

    // Disparamos la impresión directo a la térmica
    setTimeout(() => {
        printFrame.contentWindow.focus();
        printFrame.contentWindow.print();
    }, 500);
    return { ok: true };
}



window.reprintOrder = async function(orderId, tableNumber) { if (!navigator.onLine) { await customAlert('No hay red.', 'error'); return; } try { const response = await fetch(`/api/orders/${orderId}`); const data = await response.json(); if (response.ok) { showReprintTicket(data.order, tableNumber); } else { await customAlert('Error al recuperar el ticket', 'error'); } } catch(e) { await customAlert('Fallo de red.', 'error'); } };
function showReprintTicket(order, tableNumber) {
    document.getElementById('ticket-content').innerHTML = buildReimpresionHTML(order, tableNumber);
    isReprinting = true;
    document.getElementById('ticket-modal').style.display = 'flex';
}

window.reopenOrder = async function(orderId, tableId) {
    const pin = await customPrompt('Autorización requerida. Ingrese PIN de Administrador:', 'password'); if (!pin) return;
    if (!navigator.onLine) { await customAlert('No hay red.', 'error'); return; }
    try { const response = await fetch(`/api/orders/${orderId}/reopen`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) }); if (response.ok) { await customAlert('Cuenta reabierta.', 'success'); loadCorteData(); loadTables(); } else { const err = await response.json(); await customAlert(`Error: ${err.error}`, 'error'); } } catch(e) { await customAlert('Fallo de conexión', 'error'); }
};

