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
    const ticketContent = document.getElementById('ticket-content'); 
    
    let date = new Date().toLocaleDateString('es-MX');
    let time = new Date().toLocaleTimeString('es-MX', {hour: '2-digit', minute: '2-digit'});
    
    let html = `
    <div style="width: 100%; max-width: 300px; margin: 0 auto; font-family: 'Courier New', Courier, monospace; color: #000;">
        <!-- CABECERA -->
        <div style="text-align: center; margin-bottom: 10px;">
            <h2 style="margin: 0; font-size: 22px; font-weight: 900; letter-spacing: 1px; line-height: 1.1;">ASADERO<br>LA ESTAMPIDA</h2>
            <p style="margin: 2px 0; font-size: 12px;">Blvd Fco. Fdez. Arteaga #2096</p>
            <p style="margin: 2px 0; font-size: 12px;">Tuxtepec, Oaxaca</p>
            <p style="margin: 2px 0; font-size: 13px; font-weight: bold;">Tel: 287 134 7643</p>
            <p style="margin: 8px 0 5px 0; font-size: 15px; font-weight: bold; text-decoration: underline;">*** TICKET DE COBRO ***</p>
        </div>
        
        <!-- DATOS DE LA MESA -->
        <div style="margin-bottom: 10px; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 5px 0;">
            <div style="display: flex; justify-content: space-between; font-weight: 900; font-size: 14px;">
                <span>FOLIO: ${escapeHtml(currentFolio || '#' + (orderIdNum || 0))}</span>
                <span>MESA: ${currentTableSpan.textContent}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 12px; margin-top: 4px;">
                <span>Fecha: ${date} ${time}</span>
                <span>PAX: ${currentPax}</span> 
            </div>
            <div style="font-size: 12px; margin-top: 2px;">Mesero: ${waiterSelect.value}</div>
        </div>
        
        <!-- ENCABEZADOS DE PRODUCTOS -->
        <div style="text-align: left; font-size: 12px;">
            <div style="display: flex; justify-content: space-between; font-weight: bold; border-bottom: 1px solid #000; margin-bottom: 5px; padding-bottom: 3px;">
                <span style="width: 12%;">Cant</span>
                <span style="width: 43%;">Descripción</span>
                <span style="width: 20%; text-align: right;">P.U.</span>
                <span style="width: 25%; text-align: right;">Total</span>
            </div>`; 
            
    let totalTicket = 0;
    
    if (selectedItemsToPay.length > 0) { 
        html += `<p style="font-weight: bold; text-align: center; margin: 5px 0;">-- PAGO DIVIDIDO --</p>`; 
        
        let groupedSelected = [];
        selectedItemsToPay.forEach(sitp => { 
            let originalItem = savedOrderItems.find(i => i.id === sitp.id); 
            if (originalItem) { 
                let itemFullPrice = originalItem.price + (originalItem.extra_price || 0);
                let existing = groupedSelected.find(g => g.name === originalItem.name && (g.price + (g.extra_price || 0)) === itemFullPrice);
                
                if (existing) { existing.qty += sitp.qty; } 
                else { groupedSelected.push({ name: originalItem.name, price: originalItem.price, extra_price: originalItem.extra_price, qty: sitp.qty }); }
            } 
        });
        
        groupedSelected.forEach(item => {
            let itemFullPrice = item.price + (item.extra_price || 0); 
            let subtotal = itemFullPrice * item.qty; 
            html += `
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px; align-items: flex-start;">
                <span style="width: 12%;">${item.qty}</span>
                <span style="width: 43%; padding-right: 5px;">${item.name}</span>
                <span style="width: 20%; text-align: right;">$${itemFullPrice.toFixed(2)}</span>
                <span style="width: 25%; text-align: right;">$${subtotal.toFixed(2)}</span>
            </div>`; 
            totalTicket += subtotal; 
        });
    } else {
        if (fullyPaid && currentRemainingBalance === parseFloat(orderTotalSpan.textContent)) { 
            
            let groupedItems = [];
            savedOrderItems.forEach(item => {
                let itemFullPrice = item.price + (item.extra_price || 0);
                let existing = groupedItems.find(g => g.name === item.name && (g.price + (g.extra_price || 0)) === itemFullPrice);
                if (existing) { existing.quantity += item.quantity; } else { groupedItems.push({...item}); }
            });

            groupedItems.forEach(item => { 
                let itemFullPrice = item.price + (item.extra_price || 0); 
                html += `
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px; align-items: flex-start;">
                    <span style="width: 12%;">${item.quantity}</span>
                    <span style="width: 43%; padding-right: 5px;">${item.name}</span>
                    <span style="width: 20%; text-align: right;">$${itemFullPrice.toFixed(2)}</span>
                    <span style="width: 25%; text-align: right;">$${(itemFullPrice * item.quantity).toFixed(2)}</span>
                </div>`; 
            }); 
            totalTicket = amountPaid - change;
        } else { 
            html += `<p style="font-weight: bold; text-align: center; margin: 5px 0;">-- ABONO A CUENTA --</p>
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span style="width: 75%;">Abono Aplicado</span>
                <span style="width: 25%; text-align: right;">$${(amountPaid - change).toFixed(2)}</span>
            </div>`; 
            totalTicket = amountPaid - change; 
        }
    }
    
    html += `</div>
        <hr style="border-top: 1px dashed #000; margin: 10px 0;">
        
        <div style="text-align: right; font-size: 13px;">
            <div style="display: flex; justify-content: flex-end; gap: 15px; margin-bottom: 3px;"><span>SUBTOTAL:</span> <strong>$${totalTicket.toFixed(2)}</strong></div>`; 
            
    let granTotal = totalTicket; 
    if (tipAmount > 0) { 
        granTotal += tipAmount; 
        html += `<div style="display: flex; justify-content: flex-end; gap: 15px; margin-bottom: 3px;"><span>PROPINA:</span> <strong>$${tipAmount.toFixed(2)}</strong></div>`; 
    } 
    
    html += `
            <div style="display: flex; justify-content: flex-end; gap: 15px; margin-top: 5px; font-size: 18px; font-weight: 900;"><span>TOTAL:</span> <span>$${granTotal.toFixed(2)}</span></div>
            <div style="display: flex; justify-content: flex-end; gap: 15px; margin-top: 10px; font-size: 12px;"><span>Pagó con ${method}:</span> <span>$${amountPaid.toFixed(2)}</span></div>
            <div style="display: flex; justify-content: flex-end; gap: 15px; margin-bottom: 5px; font-size: 12px;"><span>Cambio:</span> <span>$${change.toFixed(2)}</span></div>`; 
            
    if (!fullyPaid) { 
        html += `<div style="text-align: center; font-size: 14px; font-weight: bold; border: 1px solid #000; padding: 5px; margin-top: 10px;">SALDO EN MESA: $${remainingBalance.toFixed(2)}</div>`; 
    } 
    
    html += `</div>`; 
    
    if (requireInvoice) { 
        html += `<hr style="border-top: 1px dashed #000; margin: 15px 0;">
        <div style="text-align: center;">
            <p style="font-size: 12px; font-weight: bold; margin-bottom: 5px;">¿REQUIERE FACTURA?</p>
            <div style="width: 100px; height: 100px; border: 2px solid #000; margin: 0 auto; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #555; background-color: #eee;">[ 🔲 QR FACTURA ]</div>
            <p style="font-size: 11px; margin-top: 5px;">Escanee e ingrese el TICKET ${escapeHtml(currentFolio || '#' + (orderIdNum || 0))}</p>
        </div>`; 
    } 
    
    html += `
        <div style="text-align: center; margin-top: 15px; font-size: 12px;">
            <p style="margin: 2px 0; font-weight: bold;">¡Gracias por su visita!</p>
            <p style="margin: 2px 0;">Vuelva pronto</p>
            <p style="margin: 10px 0 0 0; font-size: 9px; color: #555;">* Este comprobante no es fiscal *</p>
        </div>
    </div>`; 
    
    ticketContent.innerHTML = html; 
    ticketModal.style.display = 'flex';
}

function closeTicketModal() { 
    document.getElementById('ticket-modal').style.display = 'none'; 
    if (isReprinting) { isReprinting = false; return; } 
    if (lastPaymentFullyPaid) { clearTableSelection(); loadTables(); } 
    else { selectTable({ id: currentTableId, table_number: currentTableSpan.textContent, status: 'OCUPADA' }); loadTables(); } 
}

async function printTicket() { 
    const ticketContent = document.getElementById('ticket-content').innerHTML;
    
    // 🚀 MAGIA INALÁMBRICA: Si estamos en el celular (por IP), enviamos el ticket por Wi-Fi a la caja.
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        socket.emit('impresion-remota', ticketContent);
        return; // El celular termina su trabajo aquí sin abrir diálogos de PDF
    }

    // 🖨️ APP DE ESCRITORIO: el ticket va directo a la impresora de tickets elegida (sin depender de la predeterminada)
    if (window.posDesktop) {
        const ticketDoc = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Ticket_Estampida</title><style>
            @page { margin: 0; }
            body { margin: 0; padding: 5mm; width: 70mm; background: #fff; color: #000 !important; font-weight: bold !important; -webkit-font-smoothing: none; text-rendering: geometricPrecision; font-family: Arial, sans-serif; }
            * { color: #000 !important; }
        </style></head><body>${ticketContent}</body></html>`;
        const result = await window.posDesktop.printTicket(ticketDoc);
        if (!result || !result.ok) await customAlert(`No se pudo imprimir el ticket: ${escapeHtml(result ? result.reason : 'sin respuesta')}. Revisa la impresora en el icono del POS junto al reloj → Impresora de tickets.`, 'error', 'Impresión');
        return;
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
    frameDoc.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Ticket_Estampida</title>
            <style>
                @page { margin: 0; } 
                body { margin: 0; padding: 5mm; width: 70mm; background: #fff; color: #000 !important; font-weight: bold !important; -webkit-font-smoothing: none; text-rendering: geometricPrecision; }
                * { color: #000 !important; }
            </style>
        </head>
        <body>
            ${ticketContent}
        </body>
        </html>
    `);
    frameDoc.close();

    // Disparamos la impresión directo a la térmica
    setTimeout(() => {
        printFrame.contentWindow.focus();
        printFrame.contentWindow.print();
    }, 500);
}



window.reprintOrder = async function(orderId, tableNumber) { if (!navigator.onLine) { await customAlert('No hay red.', 'error'); return; } try { const response = await fetch(`/api/orders/${orderId}`); const data = await response.json(); if (response.ok) { showReprintTicket(data.order, tableNumber); } else { await customAlert('Error al recuperar el ticket', 'error'); } } catch(e) { await customAlert('Fallo de red.', 'error'); } };
function showReprintTicket(order, tableNumber) {
    const ticketModal = document.getElementById('ticket-modal'); 
    const ticketContent = document.getElementById('ticket-content'); 
    let date = order.closed_at || order.created_at; 
    let method = order.payment_method || 'EFECTIVO'; 
    let change = order.change_amount || 0; 
    let tipAmount = order.tip_amount || 0; 
    let html = `
    <div style="width: 100%; max-width: 300px; margin: 0 auto; font-family: 'Courier New', Courier, monospace; color: #000;">
        <h2 style="margin: 0; font-size: 18px; font-weight: 900; text-align: center;">ASADERO LA ESTAMPIDA</h2>
        <p style="margin: 3px 0; font-size: 12px; text-align: center;">Blvd Francisco Fernández Arteaga #2096</p>
        <p style="margin: 3px 0; font-size: 12px; text-align: center;">Tuxtepec, Oaxaca</p>
        <p style="margin: 3px 0; font-size: 12px; text-align: center;">Fecha Cierre: ${date}</p>
        <p style="margin: 8px 0 5px 0; font-size: 15px; font-weight: bold; color: #000; text-align: center;">TICKET ${escapeHtml(order.folio || '#' + order.id)} <spanstyle="font-size: 10px; color:#555;">(Reimpresión)</span></p>
        <div style="display: flex; justify-content: space-between; font-size: 12px; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 4px 0; margin: 6px 0;">
            <span>Mesa: ${tableNumber}</span>
            <span>Mesero: ${order.waiter_name}</span>
        </div>
        <div style="text-align: left; font-size: 12px;">
            <div style="display: flex; justify-content: space-between; font-weight: bold; border-bottom: 1px solid #000; margin-bottom: 5px; padding-bottom: 3px;">
                <span style="width: 12%;">Cant</span>
                <span style="width: 43%;">Descripción</span>
                <span style="width: 20%; text-align: right;">P.U.</span>
                <span style="width: 25%; text-align: right;">Total</span>
            </div>`; 
    let totalTicket = 0; 
    let groupedItems = [];
    order.items.forEach(item => {
        let itemFullPrice = item.price + (item.extra_price || 0);
        let existing = groupedItems.find(g => g.name === item.name && (g.price + (g.extra_price || 0)) === itemFullPrice);
        if (existing) { existing.quantity += item.quantity; } else { groupedItems.push({...item}); }
    });
    groupedItems.forEach(item => { 
        let itemFullPrice = item.price + (item.extra_price || 0); 
        let subtotal = itemFullPrice * item.quantity; 
        totalTicket += subtotal; 
        html += `
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px; align-items: flex-start;">
            <span style="width: 12%;">${item.quantity}</span>
            <span style="width: 43%; padding-right: 5px;">${item.name}</span>
            <span style="width: 20%; text-align: right;">$${itemFullPrice.toFixed(2)}</span>
            <span style="width: 25%; text-align: right;">$${subtotal.toFixed(2)}</span>
        </div>`; 
    });  
    html += `</div>
        <hr style="border-top: 1px dashed #000; margin: 10px 0;">
        <div style="text-align: right; font-size: 13px;">`; 
    if (order.discount_amount > 0) { 
        html += `<p style="font-size: 14px; margin-bottom: 5px; color: #555;"><strong>Descuento: -$${order.discount_amount.toFixed(2)}</strong></p>`; 
    } 
    html += `<p style="font-size: 15px; margin-bottom: 5px;"><strong>SUBTOTAL: $${order.total.toFixed(2)}</strong></p>`; 
    let granTotal = order.total + tipAmount; 
    if (tipAmount > 0) { 
        html += `<p style="font-size: 14px; margin-bottom: 5px; color: #555;"><strong>Propina: $${tipAmount.toFixed(2)}</strong></p>`; 
    } 
    html += `
            <p style="font-size: 18px; margin-bottom: 10px; font-weight: 900;">TOTAL COBRADO: $${granTotal.toFixed(2)}</p>
            <p>Pagó con ${method}</p>
            <p>Cambio: $${change.toFixed(2)}</p>
        </div>
        <p style="margin-top: 20px; font-size: 11px; text-align: center; font-weight: bold;">¡Gracias por su preferencia!</p>
    </div>`; 
    ticketContent.innerHTML = html; 
    isReprinting = true; 
    ticketModal.style.display = 'flex';
}

window.reopenOrder = async function(orderId, tableId) {
    const pin = await customPrompt('Autorización requerida. Ingrese PIN de Administrador:', 'password'); if (!pin) return;
    if (!navigator.onLine) { await customAlert('No hay red.', 'error'); return; }
    try { const response = await fetch(`/api/orders/${orderId}/reopen`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) }); if (response.ok) { await customAlert('Cuenta reabierta.', 'success'); loadCorteData(); loadTables(); } else { const err = await response.json(); await customAlert(`Error: ${err.error}`, 'error'); } } catch(e) { await customAlert('Fallo de conexión', 'error'); }
};

