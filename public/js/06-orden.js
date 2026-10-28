// Tomar orden: seleccionar mesa, platillos, notas, enviar y comanda.
// Scripts clásicos que comparten el ámbito global; se cargan en orden desde index.html.
let clienteLlevarActual = null;
let currentPax = 1;

async function selectTable(table) {
    triggerHaptic(20);
    // 1. Limpiamos la selección de todas las mesas
    document.querySelectorAll('.btn-table').forEach(b => b.classList.remove('selected'));
    // 2. Iluminamos solo la mesa que acabamos de tocar
    const activeBtn = document.querySelector(`.btn-table[data-id="${table.id}"]`);
    if (activeBtn) activeBtn.classList.add('selected');
    draftTableId = null; currentFolio = null; currentTableId = table.id; currentTableSpan.textContent = table.table_number;btnDeselectTable.style.display = 'inline-block'; currentOrderId = null; savedOrderItems = []; newOrderItems = []; paymentPanel.style.display = 'none'; document.getElementById('payment-buttons-container').style.display = 'none'; currentRemainingBalance = 0; selectedItemsToPay = []; document.getElementById('items-to-pay-container').style.display = 'none'; document.getElementById('pay-discount-display-container').style.display = 'none'; const waiterLabel = waiterSelect.previousElementSibling;

    if (table.status === 'OCUPADA') {
        clienteLlevarActual = null; 
        const response = await fetch(`/api/orders/table/${table.id}`); const data = await response.json();
        if (data.order) {
            currentPax = data.order.guests || 1;
            currentOrderId = data.order.id; currentFolio = data.order.folio || `#${data.order.id}`; savedOrderItems = data.order.items;currentRemainingBalance = data.order.remaining_balance !== null ? data.order.remaining_balance : data.order.total;
            if (data.order.waiter_name) { waiterSelect.value = data.order.waiter_name; lastSelectedWaiter = data.order.waiter_name; }
            waiterSelect.disabled = true; waiterSelect.style.backgroundColor = '#1e372b'; waiterSelect.style.color = '#2ecc71'; if(waiterLabel) waiterLabel.innerHTML = '👤 Mesero Titular (Protegido):';
            if (data.order.discount_amount && data.order.discount_amount > 0) { document.getElementById('pay-discount-display-container').style.display = 'block'; document.getElementById('pay-discount-display').textContent = data.order.discount_amount.toFixed(2); }
            btnTransferTable.style.display = 'inline-block';
        }
    } else { 
        // === LA MESA ESTÁ LIBRE ===
        btnTransferTable.style.display = 'none'; 
        waiterSelect.disabled = false; 
        waiterSelect.style.backgroundColor = '#2a2a2a'; 
        waiterSelect.style.color = '#fff'; 
        const waiterLabel = waiterSelect.previousElementSibling;
        if(waiterLabel) waiterLabel.innerHTML = 'Mesero en Turno:';
        
        const savedWaiter = getDeviceWaiter() || lastSelectedWaiter;
        if (savedWaiter) {
            waiterSelect.value = savedWaiter;
            lastSelectedWaiter = savedWaiter;
        }
        
        if (table.table_number.toUpperCase().includes('LLEVAR')) {
            currentPax = 1; 
            clienteLlevarActual = null; // Sin interrupciones para Llevar
        } else {
            clienteLlevarActual = null;
            currentPax = 1; // 💡 Asume 1 persona por defecto en Comedor para no estorbar
        }
    }
    await loadDraft(table.id);
    if (currentTableId !== table.id) return;
    updateOrderUI();
}

const transferModal = document.getElementById('transfer-modal'); const btnConfirmTransfer = document.getElementById('btn-confirm-transfer'); const btnCancelTransfer = document.getElementById('btn-cancel-transfer'); const transferNewTable = document.getElementById('transfer-new-table');
btnTransferTable.onclick = async () => { try { const response = await fetch('/api/catalog/tables'); const data = await response.json(); const freeTables = data.tables.filter(t => t.status === 'LIBRE'); if (freeTables.length === 0) { await customAlert('No hay mesas libres para hacer el cambio.', 'warning'); return; } transferNewTable.innerHTML = ''; freeTables.forEach(t => { transferNewTable.innerHTML += `<option value="${t.id}">MESA ${t.table_number}</option>`; }); transferModal.style.display = 'flex'; } catch (error) { console.error(error); } };
btnCancelTransfer.onclick = () => { transferModal.style.display = 'none'; };
btnConfirmTransfer.onclick = async () => { const newTableId = transferNewTable.value; if (!newTableId) return; try { const response = await fetch(`/api/orders/${currentOrderId}/transfer`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ new_table_id: newTableId }) }); if (response.ok) { await customAlert('Mesa transferida con éxito.', 'success', '¡Listo!'); transferModal.style.display = 'none'; clearTableSelection(); loadTables(); } else { const err = await response.json(); await customAlert(`Error: ${err.error}`, 'error'); } } catch (error) { console.error(error); } };
window.toggleTakeaway = function(index) { newOrderItems[index].is_takeaway = !newOrderItems[index].is_takeaway; updateOrderUI(); };

async function addToOrder(product) {
    if (!currentTableId) { await customAlert('Selecciona una mesa primero.', 'warning'); return; }
    triggerHaptic(35);
    
    const esParaLlevar = currentTableSpan.textContent.toUpperCase().includes('LLEVAR');
    
    productClicks[product.id] = (productClicks[product.id] || 0) + 1;
    const existingNewItem = newOrderItems.find(item => item.product_id === product.id && item.notes === '' && item.is_takeaway === esParaLlevar);
    
    if (existingNewItem) { existingNewItem.quantity += 1; updateOrderUI(); } 
    else { newOrderItems.push({ product_id: product.id, name: product.name, price: product.price, quantity: 1, notes: '', is_takeaway: esParaLlevar, station: product.station, extra_price: 0 }); updateOrderUI(); openNoteModal(newOrderItems.length - 1); }
}

function openNoteModal(index) {
    editingItemIndex = index; 
    const item = newOrderItems[index]; 
    tempExtraPrice = item.extra_price || 0;
    noteModalTitle.textContent = `Nota para: ${item.name}`; 
    modalNoteInput.value = item.notes || ''; 
    quickModifiersGrid.innerHTML = '';
    currentModifiers.forEach(mod => {
        const btn = document.createElement('button'); 
        const displayPrice = mod.price > 0 ? ` (+$${mod.price})` : ''; 
        btn.textContent = mod.name + displayPrice;
        btn.className = 'btn-term';
        btn.onclick = () => { 
            const currentVal = modalNoteInput.value.trim(); 
            const additionText = mod.price > 0 ? `${mod.name} (+$${mod.price})` : mod.name; 
            modalNoteInput.value = currentVal ? `${currentVal}, ${additionText}` : additionText; 
            if (mod.price > 0) { 
                tempExtraPrice += mod.price; 
            } 
        };
        quickModifiersGrid.appendChild(btn);
    });
    noteModal.style.display = 'flex'; 
    modalNoteInput.focus();
}

function removeNewItem(index) { newOrderItems.splice(index, 1); updateOrderUI(); }
function openCancelModal(type, itemId = null) { pendingCancelType = type; pendingCancelItemId = itemId; document.getElementById('cancel-pin').value = ''; document.getElementById('cancel-reason').value = 'ERROR DE CAPTURA'; document.getElementById('cancel-modal').style.display = 'flex'; document.getElementById('cancel-pin').focus(); }
document.getElementById('btn-abort-cancel').onclick = () => { document.getElementById('cancel-modal').style.display = 'none'; pendingCancelType = null; pendingCancelItemId = null; };

document.getElementById('btn-confirm-cancel').onclick = async () => {
    const pin = document.getElementById('cancel-pin').value; const reason = document.getElementById('cancel-reason').value;
    if (!pin) { await customAlert('Ingrese el PIN de administrador', 'warning'); return; }
    document.getElementById('cancel-modal').style.display = 'none';
    if (!navigator.onLine) { await customAlert('No hay conexión Wi-Fi.', 'error', 'Sin Red'); return; }

    if (pendingCancelType === 'item') {
        try { const response = await fetch(`/api/orders/${currentOrderId}/cancel-item/${pendingCancelItemId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin, reason }) }); if (response.ok) { selectTable({ id: currentTableId, table_number: currentTableSpan.textContent, status: 'OCUPADA' }); loadTables(); } else { const err = await response.json(); await customAlert(`Error: ${err.error}`, 'error'); } } catch (error) { await customAlert('Error de red al cancelar.', 'error'); console.error(error); }
    } else if (pendingCancelType === 'order') {
        try { const response = await fetch(`/api/orders/${currentOrderId}/cancel-order`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin, reason }) }); if (response.ok) { await customAlert('Cuenta cancelada.', 'success'); clearTableSelection(); loadTables(); } else { const err = await response.json(); await customAlert(`Error: ${err.error}`, 'error'); } } catch (error) { await customAlert('Error de red.', 'error'); console.error(error); }
    }
};

window.editClientName = async function() {
    const nombre = await customPrompt('Nombre del cliente para este pedido:', 'text', clienteLlevarActual || '');
    if (nombre) {
        clienteLlevarActual = nombre.toUpperCase();
        // Actualiza el título de la mesa arriba
        const baseName = currentTableSpan.textContent.split(' (')[0]; 
        currentTableSpan.textContent = `${baseName} (${clienteLlevarActual})`;
        updateOrderUI();
    }
};

window.editPax = async function() {
    const newPaxStr = await customPrompt(`PAX Actual: ${currentPax}. Ingrese el nuevo número de personas:`, 'number', currentPax);
    if (!newPaxStr) return;
    const newPax = parseInt(newPaxStr);
    if (newPax <= 0) return;

    currentPax = newPax; 

    // Si la mesa ya está registrada en el servidor, la actualizamos en la base de datos
    if (currentOrderId) {
        try {
            await fetch(`/api/orders/${currentOrderId}/pax`, { 
                method: 'PUT', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ guests: currentPax }) 
            });
        } catch(e) { console.error("Error al actualizar PAX", e); }
    }
    updateOrderUI(); 
};

function updateOrderUI() {
    syncDraft();
    orderItemsList.innerHTML = ''; 
    let rawItemsSum = 0; // Suma cruda solo para cuando es una mesa nueva sin guardar
    let newItemsTotal = 0;

   // === CAJÓN VISUAL INTELIGENTE (PAX o LLEVAR) ===
    if (currentTableId) {
        const esLlevar = currentTableSpan.textContent.toUpperCase().includes('LLEVAR');
        
        if (esLlevar) {
            const nombreMostrar = clienteLlevarActual ? clienteLlevarActual : 'Sin Nombre (Toca Nombre ->)';
            orderItemsList.innerHTML += `
            <div style="background: var(--surface-card); padding: 8px 12px; border-radius: var(--radius-sm); margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; font-size: 12px; border: 1px solid var(--border-subtle);">
                <span style="color: var(--text-secondary); font-weight: 700;">🛍️ Cliente: <span style="color: #fbbf24; font-size: 14px; font-weight: 800;">${nombreMostrar}</span></span>
                <button onclick="editClientName()" style="background: var(--brand-primary); color: white; border: none; padding: 4px 10px; border-radius: var(--radius-sm); cursor: pointer; font-weight: 700; font-size: 11px;">✏️ Nombre</button>
            </div>`;
        } else {
            orderItemsList.innerHTML += `
            <div style="background: var(--surface-card); padding: 8px 12px; border-radius: var(--radius-sm); margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; font-size: 12px; border: 1px solid var(--border-subtle);">
                <span style="color: var(--text-secondary); font-weight: 700;">👥 Personas (PAX): <span style="color: #fff; font-size: 14px; font-weight: 800; font-family: var(--font-mono);">${currentPax}</span></span>
                <button onclick="editPax()" style="background: var(--surface-elevated); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); padding: 4px 10px; border-radius: var(--radius-sm); cursor: pointer; font-weight: 700; font-size: 11px;">✏️ Cambiar</button>
            </div>`;
        }
    }
    
    // =======================================

    // 1. Dibujamos los items ya guardados en el servidor
    savedOrderItems.forEach(item => {
        const unitPrice = item.price + (item.extra_price || 0); 
        rawItemsSum += unitPrice * item.quantity;
        const isPaid = item.paid === 1; 
        const textStyle = isPaid ? 'text-decoration: line-through; opacity: 0.5;' : 'color: #fff; font-weight: 600;';
        const paidBadge = isPaid ? ' <span style="background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); padding: 2px 6px; border-radius: var(--radius-xs); font-size: 10px; font-weight: 800;">PAGADO</span>' : '';
        const takeawayBadge = item.is_takeaway ? ' <span style="background: rgba(139, 92, 246, 0.2); color: #c084fc; border: 1px solid rgba(139, 92, 246, 0.4); padding: 2px 6px; border-radius: var(--radius-xs); font-size: 10px; font-weight: 800;">🥡 LLEVAR</span>' : '';
        
        orderItemsList.innerHTML += `<div class="order-item-row" style="${textStyle}"><div><span style="font-weight: 700;">${item.quantity}x ${escapeHtml(item.name)}</span>${takeawayBadge}${paidBadge}${item.notes ? `<br><small style="color: #fbbf24; font-weight: 600;">↳ ${escapeHtml(item.notes)}</small>` : ''}</div><div style="display: flex; gap: 8px; align-items: center;"><span style="font-family: var(--font-mono); font-weight: 700;">$${(unitPrice * item.quantity).toFixed(2)}</span>${!isPaid ? `<button onclick="openCancelModal('item', ${item.id})" style="background: transparent; border: none; cursor: pointer; font-size: 15px; opacity: 0.7; padding: 2px;" title="Cancelar Platillo">🗑️</button>` : ''}</div></div>`;
    });

    // 2. Dibujamos los items nuevos que el mesero apenas está pidiendo
    newOrderItems.forEach((item, index) => {
        const unitPrice = item.price + (item.extra_price || 0); 
        newItemsTotal += unitPrice * item.quantity;
        const takeawayBadge = item.is_takeaway ? ' <span style="background: rgba(139, 92, 246, 0.2); color: #c084fc; border: 1px solid rgba(139, 92, 246, 0.4); padding: 2px 6px; border-radius: var(--radius-xs); font-size: 10px; font-weight: 800;">🥡 LLEVAR</span>' : '';
        
        orderItemsList.innerHTML += `<div class="order-item-row" style="border-left: 3px solid var(--brand-primary);"><div onclick="openNoteModal(${index})" style="cursor: pointer; flex: 1;"><span style="color: var(--brand-primary); font-weight: 800;">+ ${item.quantity}x ${escapeHtml(item.name)}</span>${takeawayBadge}${item.notes ? `<br><small style="color: #f87171; font-weight: 700;">↳ ${escapeHtml(item.notes)}</small>` : '<br><small style="color: var(--text-muted); font-size: 11px;">(Toca para nota rápida)</small>'}</div><div style="display: flex; gap: 6px; align-items: center;"><span style="font-family: var(--font-mono); font-weight: 800; color: #fff;">$${(unitPrice * item.quantity).toFixed(2)}</span><button onclick="toggleTakeaway(${index})" style="background: var(--surface-subtle); border: 1px solid var(--border-subtle); border-radius: var(--radius-xs); cursor: pointer; padding: 4px 6px; font-size: 13px;" title="Marcar para llevar">🥡</button><button onclick="openNoteModal(${index})" style="background: var(--surface-subtle); border: 1px solid var(--border-subtle); border-radius: var(--radius-xs); cursor: pointer; padding: 4px 6px; font-size: 13px;" title="Editar nota">✏️</button><button onclick="removeNewItem(${index})" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: var(--radius-xs); color: #f87171; cursor: pointer; padding: 4px 6px; font-size: 13px;" title="Quitar">❌</button></div></div>`;
    });
    
    // --- SOLUCIÓN DEL BUG DE SINCRONIZACIÓN ---
    let displayTotal = 0;
    // Si la orden ya existe en el servidor, usamos su balance oficial (descuentos y abonos ya aplicados)
    if (currentOrderId && currentRemainingBalance !== null && currentRemainingBalance !== undefined) {
        displayTotal = currentRemainingBalance + newItemsTotal;
    } else {
        // Si es una mesa completamente nueva, sumamos desde cero
        displayTotal = rawItemsSum + newItemsTotal;
    }

    orderTotalSpan.textContent = displayTotal.toFixed(2); 
    // ------------------------------------------

    // Lógica de visibilidad de los banners y botones (se mantiene intacta)
    const banner = document.getElementById('cashier-instruction-banner');
    const textSpan = document.getElementById('cashier-instruction-text');
    if (currentOrderId && tableInstructions[currentTableId] && isAdminSessionActive) {
        let info = tableInstructions[currentTableId];
        textSpan.textContent = `${info.instruction} ${info.invoice ? '(Y PIDEN FACTURA)' : ''}`;
        banner.style.display = 'block';
    } else {
        banner.style.display = 'none';
    }
    
    if (newOrderItems.length > 0 && currentTableId) { 
        actionButtonsContainer.style.display = 'flex'; 
        btnSendPrint.textContent = currentOrderId ? '🖨️ ENVIAR ADICIÓN' : '🖨️ ENVIAR COMANDA'; 
        btnSendSave.textContent = currentOrderId ? '💾 ADICIÓN RÁPIDA' : '💾 SOLO REGISTRAR'; 
        btnSendPrint.disabled = false; btnSendSave.disabled = false; 
        document.getElementById('payment-buttons-container').style.display = 'none'; paymentPanel.style.display = 'none'; if(btnCancelOrder) btnCancelOrder.style.display = 'none';
    } else if (currentOrderId) { 
        actionButtonsContainer.style.display = 'none'; 
        document.getElementById('payment-buttons-container').style.display = 'flex'; 
        if(btnCancelOrder) btnCancelOrder.style.display = 'block';
    } else { 
        actionButtonsContainer.style.display = 'flex'; 
        btnSendPrint.textContent = '🖨️ ENVIAR COMANDA'; btnSendSave.textContent = '💾 SOLO REGISTRAR'; 
        btnSendPrint.disabled = true; btnSendSave.disabled = true; 
        document.getElementById('payment-buttons-container').style.display = 'none'; paymentPanel.style.display = 'none'; if(btnCancelOrder) btnCancelOrder.style.display = 'none'; 
    }

    // Actualización de la barra flotante móvil (#mobile-order-bar)
    const mobileOrderBar = document.getElementById('mobile-order-bar');
    const mobileBarTableName = document.getElementById('mobile-bar-table-name');
    const mobileBarCount = document.getElementById('mobile-bar-count');
    const mobileBarTotal = document.getElementById('mobile-bar-total');
    const mobileBarActionBtn = document.getElementById('mobile-bar-action-btn');

    if (mobileOrderBar && mobileBarTableName && mobileBarCount && mobileBarTotal) {
        if (currentTableId) {
            const totalItemsCount = savedOrderItems.reduce((acc, i) => acc + i.quantity, 0) + newOrderItems.reduce((acc, i) => acc + i.quantity, 0);
            mobileBarTableName.textContent = currentTableSpan.textContent || 'Mesa';
            mobileBarCount.textContent = `${totalItemsCount} ${totalItemsCount === 1 ? 'platillo' : 'platillos'}`;
            mobileBarTotal.textContent = `$${displayTotal.toFixed(2)}`;
            if (newOrderItems.length > 0) {
                mobileBarActionBtn.innerHTML = `<span>Ver Comanda (${newOrderItems.length} nuevos)</span> 📋`;
            } else {
                mobileBarActionBtn.innerHTML = `<span>Ver Comanda</span> 📋`;
            }
            mobileOrderBar.classList.add('bar-active');
        } else {
            mobileOrderBar.classList.remove('bar-active');
        }
    }
}

// Clave única por envío: si el Wi-Fi falla después de que el servidor guardó la orden,
// reintentar lo mismo usa la misma clave y el servidor no la duplica en cocina.
let pendingSend = null;
function requestIdFor(tableId, items) {
    const key = `${tableId}|${serializeDraft(items)}`;
    if (!pendingSend || pendingSend.key !== key) {
        const rnd = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        pendingSend = { key, id: rnd };
    }
    return pendingSend.id;
}

async function sendOrderToServer(shouldPrint) {
    if (newOrderItems.length === 0 || !currentTableId) return;
    const selectedWaiter = waiterSelect.value; 
    if (!selectedWaiter) { await customAlert('Selecciona un mesero de la lista.', 'warning'); return; }
    if (!navigator.onLine) { await customAlert('No hay conexión Wi-Fi.', 'error', 'Sin Red'); return; }
    
    btnSendPrint.disabled = true;
    btnSendSave.disabled = true;
    const originalPrintText = btnSendPrint.textContent;
    const originalSaveText = btnSendSave.textContent;
    btnSendPrint.textContent = '⏳ PROCESANDO...';
    btnSendSave.textContent = '⏳ PROCESANDO...';

    if (clienteLlevarActual && newOrderItems.length > 0) {
        newOrderItems[0].notes = newOrderItems[0].notes 
            ? `CLIENTE: ${clienteLlevarActual} - ${newOrderItems[0].notes}` 
            : `CLIENTE: ${clienteLlevarActual}`;
        clienteLlevarActual = null; 
    }

    const requestId = requestIdFor(currentTableId, newOrderItems);
    const itemsToPrint = [...newOrderItems];const itemsForApi = newOrderItems.map(item => ({ product_id: item.product_id, quantity: item.quantity, notes: item.notes, is_takeaway: item.is_takeaway, station: item.station, extra_price: item.extra_price }));
    await draftQueue;
    try {
        const esAgregado = !!currentOrderId; // platillos para una mesa que ya había pedido
        let url = '/api/orders'; let bodyData = { table_id: currentTableId, waiter_name: selectedWaiter, items: itemsForApi, is_printed: shouldPrint, guests: currentPax, device_id: DEVICE_ID, request_id: requestId }; let orderNum = currentOrderId;
        if (currentOrderId) { url = `/api/orders/${currentOrderId}/items`; bodyData = { items: itemsForApi, is_printed: shouldPrint, device_id: DEVICE_ID, request_id: requestId }; }
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyData) }); const result = await response.json();
        if (response.ok) {
            pendingSend = null;
            triggerHaptic(60);
            closeMobileSheet();
            if (!orderNum) orderNum = result.orderId; 
            const folioComanda = result.folio || currentFolio || `#${orderNum}`;
            // merged: otro dispositivo ya había abierto la mesa y los platillos se sumaron a esa cuenta
            if (shouldPrint) { showComanda(itemsToPrint, folioComanda, currentTableSpan.textContent, selectedWaiter, esAgregado || !!result.merged); }
            else { await customAlert('Adición registrada.', 'success'); }
            selectTable({ id: currentTableId, table_number: currentTableSpan.textContent, status: 'OCUPADA' }); loadTables();
        } else {
            // El servidor rechazó el envío (cuenta ya cobrada, platillo eliminado...): los platillos siguen en pantalla
            await customAlert(result.error || 'No se pudo enviar la orden.', 'error', 'Orden no enviada');
            if (response.status === 409 || response.status === 404) { loadTables(); }
        }
    } catch (error) { 
        await customAlert('Falla en la red al enviar la orden.', 'error'); console.error('Network Error:', error); 
    } finally {
        btnSendPrint.disabled = false;
        btnSendSave.disabled = false;
        btnSendPrint.textContent = originalPrintText;
        btnSendSave.textContent = originalSaveText;
    }
}

btnSendPrint.onclick = () => sendOrderToServer(true); btnSendSave.onclick = () => sendOrderToServer(false);

function showComanda(items, folio, mesa, mesero, esAgregado = false) {
    document.getElementById('ticket-content').innerHTML = buildComandaHTML(items, folio, mesa, mesero, esAgregado);
    isReprinting = true;

    // Disparamos la impresión silenciosa directo a la Epson.
    // Solo confirma si de verdad salió (desde el celular la caja responde; si falla, printTicket ya avisó)
    setTimeout(async () => {
        const r = await printTicket();
        if (!r || r.ok) customAlert('Comanda enviada a cocina', 'success', '¡Listo!');
    }, 500);
}

function closeComandaModal() { document.getElementById('comanda-modal').style.display = 'none'; }
async function printComanda() { /* Vacío por compatibilidad */ }
btnCancelOrder.onclick = () => openCancelModal('order');

document.getElementById('btn-apply-discount').onclick = async () => {
    const pin = await customPrompt('Autorización requerida. Ingrese PIN de Administrador:', 'password'); if (!pin) return;
    await new Promise(resolve => setTimeout(resolve, 250));
    const discount = await customPrompt('Ingrese el MONTO EXACTO ($) a descontar:', 'number'); if (!discount || isNaN(discount) || discount <= 0) return;
    if (!navigator.onLine) { await customAlert('No hay red.', 'error'); return; }
    try { const response = await fetch(`/api/orders/${currentOrderId}/discount`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin, discount_amount: parseFloat(discount) }) }); if (response.ok) { await customAlert('Descuento aplicado correctamente.', 'success'); selectTable({ id: currentTableId, table_number: currentTableSpan.textContent, status: 'OCUPADA' }); loadTables(); } else { const err = await response.json(); await customAlert(`Error: ${err.error}`, 'error'); } } catch (error) { await customAlert('Fallo de red.', 'error'); }
};


