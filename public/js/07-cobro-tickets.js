// Cobro, división de cuenta, tickets y reimpresión.
// Scripts clásicos que comparten el ámbito global; se cargan en orden desde index.html.
// ========================================================
// SISTEMA INTELIGENTE DE COBRO EN TIEMPO REAL
// ========================================================
function getMontoEsperado() {
    if (selectedItemsToPay.length > 0) {
        let totalParcial = 0;
        document.querySelectorAll('#items-to-pay-container input[type="checkbox"]:checked').forEach(cb => {
            totalParcial += parseFloat(cb.dataset.price);
        });
        return totalParcial;
    }
    return currentRemainingBalance;
}

function calcularCambioEnVivo() {
    const montoIngresado = parseFloat(inputAmountPaid.value) || 0;
    const esperado = getMontoEsperado();
    const displayTexto = document.getElementById('change-display-text');
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

btnPayOrder.onclick = () => {
    const invoiceCheckbox = document.getElementById('require-invoice'); 
    if(invoiceCheckbox) invoiceCheckbox.checked = false;
    
    document.getElementById('pay-table-name').textContent = currentTableSpan.textContent;
    
    const totalToPay = parseFloat(orderTotalSpan.textContent); 
    currentRemainingBalance = currentRemainingBalance > 0 ? currentRemainingBalance : totalToPay; 
    
    document.getElementById('pay-total-display').textContent = totalToPay.toFixed(2); 
    document.getElementById('pay-remaining-display').textContent = currentRemainingBalance.toFixed(2); 
    
    inputAmountPaid.value = currentRemainingBalance.toFixed(2); 
    document.getElementById('tip-amount').value = ''; 
    
    calcularCambioEnVivo();
    paymentPanel.style.display = 'flex'; // Ahora se abre como Modal Gigante
    setTimeout(() => { inputAmountPaid.focus(); inputAmountPaid.select(); }, 100);
};

document.getElementById('btn-cancel-pay').onclick = () => { 
    paymentPanel.style.display = 'none'; 
    document.getElementById('items-to-pay-container').style.display = 'none'; 
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
    const container = document.getElementById('items-to-pay-container');
    if (container.style.display === 'block') { 
        container.style.display = 'none'; 
        selectedItemsToPay = []; 
        inputAmountPaid.value = currentRemainingBalance.toFixed(2);
        calcularCambioEnVivo();
    } else {
        container.style.display = 'block'; 
        container.innerHTML = '<p style="font-size: 13px; margin-top: 0; font-weight: bold; color:#fff;">Selecciona consumos:</p>'; 
        let unpaidItems = savedOrderItems.filter(item => item.paid === 0); 
        if (unpaidItems.length === 0) container.innerHTML += '<p style="font-size: 12px; color: #e74c3c;">Todos pagados.</p>';
        unpaidItems.forEach(item => { 
            for (let i = 0; i < item.quantity; i++) { 
                const label = document.createElement('label'); label.style.display = 'block'; label.style.fontSize = '14px'; label.style.marginBottom = '8px'; 
                const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = item.id; 
                const itemFullPrice = item.price + (item.extra_price || 0); checkbox.dataset.price = itemFullPrice; checkbox.style.marginRight = '8px'; checkbox.style.transform = 'scale(1.2)'; 
                checkbox.onchange = () => { 
                    const checkboxes = document.querySelectorAll('#items-to-pay-container input[type="checkbox"]:checked'); 
                    let currentTotal = 0; let itemCounts = {}; 
                    checkboxes.forEach(cb => { 
                        currentTotal += parseFloat(cb.dataset.price); 
                        let id = parseInt(cb.value); itemCounts[id] = (itemCounts[id] || 0) + 1; 
                    }); 
                    selectedItemsToPay = Object.keys(itemCounts).map(id => ({ id: parseInt(id), qty: itemCounts[id] })); 
                    inputAmountPaid.value = selectedItemsToPay.length > 0 ? currentTotal.toFixed(2) : currentRemainingBalance.toFixed(2); 
                    calcularCambioEnVivo(); // <-- Actualiza el cambio mágicamente al palomear
                }; 
                label.appendChild(checkbox); label.appendChild(document.createTextNode(`1x ${item.name} - $${itemFullPrice.toFixed(2)}`)); container.appendChild(label); 
            } 
        });
    }
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
        const response = await fetch(`/api/orders/${currentOrderId}/pay`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payment_method: method, amount_paid: amountPaid, items_to_pay: selectedItemsToPay, tip_amount: tipAmount, needs_invoice: requireInvoice }) });
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

