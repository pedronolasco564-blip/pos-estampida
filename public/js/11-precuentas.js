// Precuentas (completa, dividida y por consumo).
// Scripts clásicos que comparten el ámbito global; se cargan en orden desde index.html.
function generatePreCheckHTML(itemsArray, title, fraction = 1, showQR = false, discount = 0) {
    let date = new Date().toLocaleDateString('es-MX');
    let time = new Date().toLocaleTimeString('es-MX', {hour: '2-digit', minute: '2-digit'});
    
    let html = `
    <div style="width: 100%; max-width: 300px; margin: 0 auto; font-family: 'Courier New', Courier, monospace; color: #000; page-break-after: always; margin-bottom: 20px;">
        <!-- CABECERA -->
        <div style="text-align: center; margin-bottom: 10px;">
            <h2 style="margin: 0; font-size: 22px; font-weight: 900; letter-spacing: 1px; line-height: 1.1;">ASADERO<br>LA ESTAMPIDA</h2>
            <p style="margin: 2px 0; font-size: 12px;">Blvd Fco. Fdez. Arteaga #2096</p>
            <p style="margin: 2px 0; font-size: 12px;">Tuxtepec, Oaxaca</p>
            <p style="margin: 2px 0; font-size: 13px; font-weight: bold;">Tel: 287 134 7643</p>
            <p style="margin: 8px 0 5px 0; font-size: 15px; font-weight: bold; text-decoration: underline;">*** ${title} ***</p>
        </div>
        
        <!-- DATOS DE LA MESA (FOLIO Y PAX DESTACADOS) -->
        <div style="margin-bottom: 10px; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 5px 0;">
            <div style="display: flex; justify-content: space-between; font-weight: 900; font-size: 14px;">
                <span>FOLIO: ${escapeHtml(currentFolio || '#' + (currentOrderId || 0))}</span>
                <span>MESA: ${currentTableSpan.textContent}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 12px; margin-top: 4px;">
                <span>Fecha: ${date} ${time}</span>
                <span>PAX: ${currentPax}</span>
            </div>
            <div style="font-size: 12px; margin-top: 2px;">Mesero: ${waiterSelect.value}</div>
        </div>
        
        <div style="text-align: left; font-size: 12px;">
            <div style="display: flex; justify-content: space-between; font-weight: bold; border-bottom: 1px solid #000; margin-bottom: 5px; padding-bottom: 3px;">
                <span style="width: 12%;">Cant</span>
                <span style="width: 43%;">Descripción</span>
                <span style="width: 20%; text-align: right;">P.U.</span>
                <span style="width: 25%; text-align: right;">Total</span>
            </div>`;

    let totalTicket = 0;
    
    // === MAGIA DE AGRUPACIÓN (IGNORANDO NOTAS) ===
    let groupedItems = [];
    itemsArray.forEach(item => {
        let itemFullPrice = item.price + (item.extra_price || 0);
        let existing = groupedItems.find(g => g.name === item.name && (g.price + (g.extra_price || 0)) === itemFullPrice);
        if (existing) { existing.quantity += item.quantity; } else { groupedItems.push({...item}); }
    });

    groupedItems.forEach(item => {
        let itemFullPrice = item.price + (item.extra_price || 0);
        let subtotal = (itemFullPrice * item.quantity) / fraction;
        html += `
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px; align-items: flex-start;">
                <span style="width: 12%;">${item.quantity}</span>
                <span style="width: 43%; padding-right: 5px;">${item.name}</span>
                <span style="width: 20%; text-align: right;">$${itemFullPrice.toFixed(2)}</span>
                <span style="width: 25%; text-align: right;">$${subtotal.toFixed(2)}</span>
            </div>`;
        totalTicket += subtotal;
    });

    html += `</div>
        <hr style="border-top: 1px dashed #000; margin: 10px 0;">
        
        <div style="text-align: right; font-size: 13px;">`;

    if (discount > 0) {
        let discountFrac = discount / fraction;
        html += `<div style="display: flex; justify-content: flex-end; gap: 15px; margin-bottom: 3px; color: #555;"><span>Subtotal:</span> <span>$${totalTicket.toFixed(2)}</span></div>`;
        html += `<div style="display: flex; justify-content: flex-end; gap: 15px; margin-bottom: 3px; color: #000;"><span>Descuento:</span> <span>-$${discountFrac.toFixed(2)}</span></div>`;
        totalTicket -= discountFrac;
    }
    // Cuenta dividida: el total de cada parte se redondea al centavo hacia arriba (igual que en el cobro)
    if (fraction > 1) totalTicket = montoPorPersona(totalTicket * fraction, fraction);

    html += `
            <div style="display: flex; justify-content: flex-end; gap: 15px; margin-top: 5px; font-size: 18px; font-weight: 900;">
                <span>TOTAL A PAGAR:</span> <span>$${totalTicket.toFixed(2)}</span>
            </div>
        </div>`;

    if (showQR) {
        html += `
        <div style="text-align: center; margin-top: 15px;">
            <p style="font-size: 12px; font-weight: bold; margin-bottom: 5px;">FACTURACIÓN</p>
            <div style="width: 100px; height: 100px; border: 2px solid #000; margin: 0 auto; display: flex; align-items: center; justify-content: center; font-size: 10px; background: #eee; color: #000;">[ 🔲 QR FACTURA ]</div>
        </div>`;
    }
    
    html += `
        <div style="text-align: center; margin-top: 15px; font-size: 12px;">
            <p style="margin: 10px 0 0 0; font-size: 9px; color: #555;">* Este documento no es un comprobante fiscal *</p>
        </div>
    </div>`;
    return html;
}

function showStandardPreCheck(wantsInvoice) {
    let discount = parseFloat(document.getElementById('pay-discount-display').textContent) || 0;
    // Aquí cambiamos el título feo por "CUENTA DE MESA"
    let html = generatePreCheckHTML(savedOrderItems, 'CUENTA DE MESA', 1, wantsInvoice, discount);
    document.getElementById('ticket-content').innerHTML = html;
    isReprinting = true;
    document.getElementById('ticket-modal').style.display = 'flex';
}

function showDividedPreCheck(personas, wantsInvoice) {
    let discount = parseFloat(document.getElementById('pay-discount-display').textContent) || 0;
    let fullHtml = '';
    
    for (let i = 1; i <= personas; i++) {
        // Ahora enumera correctamente: (1/3), (2/3), (3/3)
        let singleTicketHtml = generatePreCheckHTML(savedOrderItems, `CUENTA DIVIDIDA (${i}/${personas})`, personas, wantsInvoice, discount);
        fullHtml += singleTicketHtml;
        
        // Si NO es el último pedazo de papel, obligamos a la impresora a cortar
        if (i < personas) {
            fullHtml += `<div style="page-break-after: always; break-after: page;"></div>`;
        }
    }
    
    document.getElementById('ticket-content').innerHTML = fullHtml;
    isReprinting = true;
    document.getElementById('ticket-modal').style.display = 'flex';
}

window.openPrintConsumoModal = function() {
    if (unprintedConsumoItems.length === 0) {
        customAlert('Todos los platillos han sido impresos.', 'success');
        document.getElementById('print-consumo-modal').style.display = 'none';
        return;
    }
    const container = document.getElementById('print-consumo-items');
    container.innerHTML = '';
    unprintedConsumoItems.forEach((item, idx) => {
        let itemFullPrice = item.price + (item.extra_price || 0);
        const label = document.createElement('label');
        label.style.display = 'block'; label.style.fontSize = '14px'; label.style.marginBottom = '8px'; label.style.color = '#fff';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox'; checkbox.value = idx;
        checkbox.style.marginRight = '8px'; checkbox.style.transform = 'scale(1.2)';
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(`1x ${item.name} - $${itemFullPrice.toFixed(2)}`));
        container.appendChild(label);
    });
    document.getElementById('print-consumo-modal').style.display = 'flex';
}

window.closePrintConsumo = function() {
    document.getElementById('print-consumo-modal').style.display = 'none';
}

window.printSelectedConsumo = function() {
    const checkboxes = document.querySelectorAll('#print-consumo-items input[type="checkbox"]:checked');
    if (checkboxes.length === 0) return;

    let selectedItems = [];
    let indexesToRemove = [];
    checkboxes.forEach(cb => {
        let idx = parseInt(cb.value);
        selectedItems.push(unprintedConsumoItems[idx]);
        indexesToRemove.push(idx);
    });

    indexesToRemove.sort((a,b) => b - a).forEach(idx => {
        unprintedConsumoItems.splice(idx, 1);
    });

    let wantsInvoice = false;
    if (tableInstructions[currentTableId] && tableInstructions[currentTableId].invoice) {
        wantsInvoice = true;
    }

    let html = generatePreCheckHTML(selectedItems, 'SUB-TICKET', 1, wantsInvoice, 0);
    document.getElementById('ticket-content').innerHTML = html;
    isReprinting = true;
    
    document.getElementById('ticket-modal').style.display = 'flex';
    openPrintConsumoModal();
}

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-product');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            document.querySelectorAll('#category-tabs button').forEach(tab => tab.classList.remove('active'));
            const filtered = allProducts.filter(p => p.name.toLowerCase().includes(term));
            displayProducts(filtered);
        });
    }
});

