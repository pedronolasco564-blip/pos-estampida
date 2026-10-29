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
    let html = generatePreCheckHTML(savedOrderItems, 'CUENTA DE MESA', 1, wantsInvoice, discount);
    document.getElementById('ticket-content').innerHTML = html;
    isReprinting = true;
    document.getElementById('ticket-modal').style.display = 'flex';
}

function showDividedPreCheck(personas, wantsInvoice) {
    let discount = parseFloat(document.getElementById('pay-discount-display').textContent) || 0;
    // Un solo papel con el total y lo que paga cada persona (antes se imprimía la lista completa una vez por persona)
    document.getElementById('ticket-content').innerHTML = generatePreCheckHTML(savedOrderItems, 'CUENTA DE MESA', personas, wantsInvoice, discount);
    isReprinting = true;
    document.getElementById('ticket-modal').style.display = 'flex';
}

// ========================================================
// CUENTA POR CONSUMO: cada persona elige sus platillos (con cantidades) y se imprime su cuenta parcial.
// Cada grupo se guarda en la cuenta, para que al cobrar aparezcan los botones "Persona 1, 2..." en cualquier dispositivo.
// ========================================================
let consumoPendientes = [];
let consumoSeleccion = {};
let consumoGrupos = [];

function guardarGruposConsumo() {
    if (!currentOrderId) return;
    fetch(`/api/orders/${currentOrderId}/split-groups`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ groups: consumoGrupos })
    }).catch(() => {});
}

window.iniciarCuentaPorConsumo = function() {
    consumoPendientes = savedOrderItems.filter(i => i.paid !== 1).map(i => ({ ...i }));
    consumoSeleccion = {};
    consumoGrupos = [];
    guardarGruposConsumo();
    openPrintConsumoModal();
};

function actualizarTotalConsumo() {
    document.getElementById('print-consumo-total').textContent = `$${fmtMoney(totalSeleccion(consumoPendientes, consumoSeleccion))}`;
}

window.openPrintConsumoModal = function() {
    const disponibles = consumoPendientes.filter(i => i.quantity > 0);
    if (disponibles.length === 0) {
        customAlert('Todos los platillos ya están en la cuenta de alguien.', 'success');
        document.getElementById('print-consumo-modal').style.display = 'none';
        return;
    }
    document.getElementById('print-consumo-title').textContent = `Cuenta de la persona ${consumoGrupos.length + 1}`;
    renderSelectorConsumo(document.getElementById('print-consumo-items'), disponibles, consumoSeleccion, actualizarTotalConsumo);
    actualizarTotalConsumo();
    document.getElementById('print-consumo-modal').style.display = 'flex';
};

// Para la última persona: elige todo lo que aún no está en la cuenta de nadie
window.seleccionarTodoConsumo = function() {
    consumoSeleccion = {};
    consumoPendientes.forEach(i => { if (i.quantity > 0) consumoSeleccion[i.id] = i.quantity; });
    renderSelectorConsumo(document.getElementById('print-consumo-items'), consumoPendientes.filter(i => i.quantity > 0), consumoSeleccion, actualizarTotalConsumo);
    actualizarTotalConsumo();
};

window.closePrintConsumo = function() {
    document.getElementById('print-consumo-modal').style.display = 'none';
};

window.printSelectedConsumo = function() {
    const ids = Object.keys(consumoSeleccion).map(Number);
    if (ids.length === 0) { customAlert('Elige al menos un platillo de esta persona.', 'warning'); return; }

    const n = consumoGrupos.length + 1;
    const items = [];
    const grupo = { name: `Persona ${n}`, items: [] };
    ids.forEach(id => {
        const it = consumoPendientes.find(x => x.id === id);
        const qty = consumoSeleccion[id];
        if (!it || !qty) return;
        items.push({ ...it, quantity: qty });
        grupo.items.push({ id, qty });
        it.quantity -= qty;
    });
    consumoGrupos.push(grupo);
    consumoSeleccion = {};
    guardarGruposConsumo();

    const wantsInvoice = !!(tableInstructions[currentTableId] && tableInstructions[currentTableId].invoice);
    document.getElementById('ticket-content').innerHTML = generatePreCheckHTML(items, `CUENTA PARCIAL · PERSONA ${n}`, 1, wantsInvoice, 0);
    isReprinting = true;
    document.getElementById('ticket-modal').style.display = 'flex';
    openPrintConsumoModal();
};

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

