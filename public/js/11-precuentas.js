// Precuentas (completa, dividida y por consumo).
// Scripts clásicos que comparten el ámbito global; se cargan en orden desde index.html.
// Precuenta con el formato de 13-formato-tickets.js. fraction > 1: cuenta dividida en partes iguales (un solo papel).
function generatePreCheckHTML(itemsArray, title, fraction = 1, showQR = false, discount = 0) {
    return buildPrecuentaHTML({
        titulo: title, folio: currentFolio || '#' + (currentOrderId || 0), mesa: currentTableSpan.textContent,
        pax: currentPax, mesero: waiterSelect.value, grupos: tkAgrupar(itemsArray), descuento: discount, personas: fraction, factura: showQR
    });
}

function showStandardPreCheck(wantsInvoice) {
    let discount = parseFloat(document.getElementById('pay-discount-display').textContent) || 0;
    // Aquí cambiamos el título feo por "CUENTA DE MESA"
    let html = generatePreCheckHTML(savedOrderItems, 'PRECUENTA', 1, wantsInvoice, discount);
    document.getElementById('ticket-content').innerHTML = html;
    isReprinting = true;
    document.getElementById('ticket-modal').style.display = 'flex';
}

function showDividedPreCheck(personas, wantsInvoice) {
    let discount = parseFloat(document.getElementById('pay-discount-display').textContent) || 0;
    // Un solo papel con el total y lo que paga cada persona (antes se imprimía la lista completa una vez por persona)
    document.getElementById('ticket-content').innerHTML = generatePreCheckHTML(savedOrderItems, 'PRECUENTA', personas, wantsInvoice, discount);
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

    let html = generatePreCheckHTML(selectedItems, 'CUENTA PARCIAL', 1, wantsInvoice, 0);
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

