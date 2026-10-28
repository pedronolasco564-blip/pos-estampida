// Gastos, arqueo de caja, PDF, facturas e impresión remota.
// Scripts clásicos que comparten el ámbito global; se cargan en orden desde index.html.
window.abrirModalGasto = function() {
    document.getElementById('expense-amount').value = '';
    document.getElementById('expense-concept').value = '';
    document.getElementById('expense-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('expense-amount').focus(), 100);
};

window.registrarGasto = async function() {
    const amount = parseFloat(document.getElementById('expense-amount').value);
    const concept = document.getElementById('expense-concept').value;
    const category = document.getElementById('expense-category').value;

    if (isNaN(amount) || amount <= 0 || !concept) {
        await customAlert('Llena todos los campos (monto y concepto).', 'warning'); return;
    }

    try {
        const res = await fetch('/api/reports/expenses', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, concept, category })
        });
        if (res.ok) {
            document.getElementById('expense-modal').style.display = 'none';
            await customAlert('Gasto registrado exitosamente', 'success');
            loadCorteData();
        } else {
            const err = await res.json();
            await customAlert(err.error, 'error');
        }
    } catch(e) { await customAlert('Error de red', 'error'); }
};

// ========================================================
// SISTEMA DE ARQUEO DE CAJA (CORTE CIEGO CORPORATIVO)
// ========================================================
let arqueoRevelado = false;
let ultimoEfectivoEsperado = 0;   // lo calcula loadCorteData; el arqueo lo usa directo
let fondoMananaEditado = false;   // si el usuario escribió el fondo, ya no se sugiere solo

const fechaCorteActual = () => (document.getElementById('corte-date-picker') || {}).value || obtenerFechaLocal();
const totalMonedasArqueo = () => [...document.querySelectorAll('.arq-input[data-key^="m"]')]
    .reduce((acc, i) => acc + (parseInt(i.value) || 0) * parseFloat(i.dataset.val), 0);

function etiquetaDiferencia(dif) {
    if (dif === null || dif === undefined) return { texto: 'Sin contar', clase: 'dif-none' };
    if (Math.abs(dif) < 0.005) return { texto: 'Exacto', clase: 'dif-ok' };
    return dif < 0 ? { texto: `Faltante $${fmtMoney(Math.abs(dif))}`, clase: 'dif-bad' } : { texto: `Sobrante $${fmtMoney(dif)}`, clase: 'dif-warn' };
}

async function pintarEstadoConteo(fecha) {
    const el = document.getElementById('corte-conteo-estado');
    if (!el) return;
    try {
        const res = await fetch(`/api/reports/cash-count?date=${fecha}`);
        const c = res.ok ? (await res.json()).count : null;
        if (!c) { el.innerHTML = 'Caja sin contar todavía'; return; }
        const e = etiquetaDiferencia(c.difference);
        el.innerHTML = `Contado: <b>$${fmtMoney(c.counted)}</b> · <span class="${e.clase}">${e.texto}</span>`;
    } catch (_) { el.textContent = ''; }
}

window.guardarConteo = async function() {
    const denominations = {};
    document.querySelectorAll('.arq-input').forEach(i => { if (parseInt(i.value) > 0) denominations[i.dataset.key] = parseInt(i.value); });
    const fondoTxt = document.getElementById('arq-fondo-manana').value;
    const fecha = fechaCorteActual();
    try {
        const res = await fetch('/api/reports/cash-count', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: fecha, denominations, next_fondo: fondoTxt === '' ? null : parseFloat(fondoTxt) }) });
        const r = await res.json();
        if (!res.ok) { await customAlert(r.error || 'No se pudo guardar el conteo.', 'error'); return; }
        const e = etiquetaDiferencia(r.difference);
        document.getElementById('arqueo-modal').style.display = 'none';
        await customAlert(`Contado: <b>$${fmtMoney(r.counted)}</b><br>Esperado: $${fmtMoney(r.expected)}<br><b class="${e.clase}">${e.texto}</b>`
            + (r.next_fondo !== null ? `<br><br>Fondo para el ${escapeHtml(r.next_date)}: <b>$${fmtMoney(r.next_fondo)}</b>` : ''),
            r.difference < 0 ? 'warning' : 'success', 'Conteo guardado');
        loadCorteData();
    } catch (_) { await customAlert('Error de red al guardar el conteo.', 'error'); }
};
let esperadoReal = 0;

window.abrirArqueo = function() {
    arqueoRevelado = false; 
    esperadoReal = ultimoEfectivoEsperado;
    
    document.getElementById('arq-esperado').textContent = '🔒 Oculto';
    document.getElementById('arq-diferencia').textContent = '🔒 Oculto';
    document.getElementById('arq-diferencia').style.color = '#7f8c8d';
    
    let memoriaBilletes = {};
    try { memoriaBilletes = JSON.parse(localStorage.getItem('memoriaArqueo')) || {}; } catch (_) {}

    document.querySelectorAll('.arq-input').forEach(input => {
        const clave = input.dataset.key;
        input.value = memoriaBilletes[clave] !== undefined ? memoriaBilletes[clave] : '';
    });

    fondoMananaEditado = false;
    document.getElementById('arq-fondo-manana').value = '';
    document.getElementById('arq-guardado').textContent = '';
    calcularArqueo();
    document.getElementById('arqueo-modal').style.display = 'flex';

    // Si ese día ya se guardó un conteo, se carga para revisarlo o corregirlo
    fetch(`/api/reports/cash-count?date=${fechaCorteActual()}`).then(r => r.ok ? r.json() : null).then(data => {
        const c = data && data.count;
        if (!c) return;
        document.querySelectorAll('.arq-input').forEach(i => { i.value = c.denominations[i.dataset.key] || ''; });
        if (c.next_fondo !== null) { document.getElementById('arq-fondo-manana').value = c.next_fondo; fondoMananaEditado = true; }
        document.getElementById('arq-guardado').textContent = `Ya hay un conteo guardado de este día ($${fmtMoney(c.counted)}). Si guardas de nuevo, lo reemplaza.`;
        calcularArqueo();
    }).catch(() => {});
};
document.addEventListener('input', (e) => { if (e.target && e.target.id === 'arq-fondo-manana') fondoMananaEditado = true; });

window.calcularArqueo = function() {
    let totalFisico = 0;
    let memoriaActual = {}; 
    
    document.querySelectorAll('.arq-input').forEach(input => {
        const cantidad = parseInt(input.value) || 0;
        const valor = parseFloat(input.dataset.val);
        totalFisico += cantidad * valor;
        
        if (input.value !== '') {
            memoriaActual[input.dataset.key] = input.value;
        }
    });

    try { localStorage.setItem('memoriaArqueo', JSON.stringify(memoriaActual)); } catch (_) {}
    document.getElementById('arq-total-fisico').textContent = fmtMoney(totalFisico);

    // Sugerencia de fondo para mañana: lo que hay en monedas (como en la hoja de Excel)
    const monedas = totalMonedasArqueo();
    document.getElementById('arq-fondo-hint').textContent = `Sugerido: $${fmtMoney(monedas)} (total en monedas). Mañana aparecerá como fondo inicial.`;
    if (!fondoMananaEditado) document.getElementById('arq-fondo-manana').value = monedas ? monedas : '';
    
    if (arqueoRevelado) {
        document.getElementById('arq-esperado').textContent = fmtMoney(esperadoReal);
        const diferencia = totalFisico - esperadoReal;
        const difSpan = document.getElementById('arq-diferencia');
        
        if (diferencia === 0 && esperadoReal > 0) {
            difSpan.textContent = "✅ CUADRE PERFECTO";
            difSpan.style.color = "#27ae60"; 
        } else if (diferencia > 0) {
            difSpan.textContent = `⚠️ SOBRAN $${fmtMoney(diferencia)}`;
            difSpan.style.color = "#f1c40f"; 
        } else {
            difSpan.textContent = `❌ FALTAN $${fmtMoney(Math.abs(diferencia))}`;
            difSpan.style.color = "#e74c3c"; 
        }
    }
};

window.limpiarArqueo = async function() {
    if (await customConfirm("¿Estás seguro de borrar todo el conteo y empezar de cero?", "Limpiar Arqueo")) {
        localStorage.removeItem('memoriaArqueo'); 
        document.querySelectorAll('.arq-input').forEach(input => input.value = ''); 
        calcularArqueo(); 
    }
};

window.revelarCorteCiego = async function() {
    if (await customConfirm("¿Terminaste de contar el efectivo? El sistema destapará la auditoría.", "Revelar Cuadre")) {
        arqueoRevelado = true;
        calcularArqueo(); 
    }
};



window.toggleInvoice = async function(orderId) {
    try {
        const res = await fetch(`/api/orders/${orderId}/invoice-status`, { method: 'PUT' });
        if (res.ok) {
            loadCorteData(); 
        } else {
            await customAlert('No se pudo actualizar el estado de la factura', 'error');
        }
    } catch(e) {
        await customAlert('Error de red', 'error');
    }
};

window.addEventListener('beforeunload', function (e) {
    if (draftPending > 0) {
        e.preventDefault();
        e.returnValue = 'Se están guardando platillos. Espera un momento antes de salir.';
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const inputAmountPaid = document.getElementById('amount-paid');
    const inputTip = document.getElementById('tip-amount');
    const triggerPay = (e) => { 
        if (e.key === 'Enter') {
            e.preventDefault(); 
            document.getElementById('btn-confirm-pay').click(); 
        }
    };
    if (inputAmountPaid) inputAmountPaid.addEventListener('keypress', triggerPay);
    if (inputTip) inputTip.addEventListener('keypress', triggerPay);

    const cancelPin = document.getElementById('cancel-pin');
    const cancelReason = document.getElementById('cancel-reason');
    const triggerCancel = (e) => { 
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('btn-confirm-cancel').click(); 
        }
    };
    if (cancelPin) cancelPin.addEventListener('keypress', triggerCancel);
    if (cancelReason) cancelReason.addEventListener('keypress', triggerCancel);

    const expAmount = document.getElementById('expense-amount');
    const expConcept = document.getElementById('expense-concept');
    const triggerExpense = (e) => { 
        if (e.key === 'Enter') {
            e.preventDefault();
            registrarGasto(); 
        }
    };
    if (expAmount) expAmount.addEventListener('keypress', triggerExpense);
    if (expConcept) expConcept.addEventListener('keypress', triggerExpense);

    const searchInput = document.getElementById('search-product');
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchInput.blur(); 
            }
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const inputsRapidos = [
        document.getElementById('amount-paid'),
        document.getElementById('tip-amount'),
        document.getElementById('expense-amount')
    ];

    document.querySelectorAll('.arq-input').forEach(input => inputsRapidos.push(input));

    inputsRapidos.forEach(input => {
        if (input) {
            input.addEventListener('focus', function() {
                setTimeout(() => this.select(), 10);
            });
        }
    });
});

window.filtrarTickets = function() {
    const input = document.getElementById('buscador-tickets').value.toLowerCase();
    const filas = document.querySelectorAll('#corte-tbody tr');
    
    filas.forEach(fila => {
        const textoFila = fila.textContent.toLowerCase();
        fila.style.display = textoFila.includes(input) ? '' : 'none';
    });
};

window.filtrarCatalogo = function() {
    const input = document.getElementById('buscador-catalogo').value.toLowerCase();
    const filas = document.querySelectorAll('#admin-products-tbody tr');

    filas.forEach(fila => {
        const textoFila = fila.textContent.toLowerCase();
        fila.style.display = textoFila.includes(input) ? '' : 'none';
    });
};
// 📡 ESCUCHADOR INVISIBLE: La PC de la caja atrapa los tickets de los celulares
socket.on('ejecutar-impresion-pc', async (htmlRemoto, ack) => {
    const responder = typeof ack === 'function' ? ack : () => {};
    if (!esPantallaDeCaja()) return responder({ ok: false, reason: 'No es la caja' });
    {
        // Sanitizar HTML remoto: solo permitir tags seguros para impresión
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlRemoto;
        tempDiv.querySelectorAll('script, iframe, object, embed, form, input').forEach(el => el.remove());
        tempDiv.querySelectorAll('*').forEach(el => {
            [...el.attributes].forEach(attr => {
                if (attr.name.startsWith('on') || attr.name === 'href' && attr.value.startsWith('javascript:')) {
                    el.removeAttribute(attr.name);
                }
            });
        });
        // Se imprime directo (sin pasar por la vista previa, que puede estar usando el cajero)
        try { responder(await printTicket(tempDiv.innerHTML) || { ok: true }); }
        catch (e) { responder({ ok: false, reason: e.message }); }
    }
});
window.verListaGastos = function() {
    const container = document.getElementById('gastos-list-container');
    container.innerHTML = '';
    
    if (desgloseGastosActual.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #7f8c8d;">No hay retiros registrados en esta fecha.</p>';
    } else {
        desgloseGastosActual.forEach(g => {
            // Se dibuja cada gasto con un bote de basura para eliminar
            container.innerHTML += `
                <div style="background: #2c2c2c; padding: 10px; margin-bottom: 8px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; border-left: 4px solid #e74c3c;">
                    <div>
                        <strong style="color: #fff; font-size: 14px;">${escapeHtml(g.concept.toUpperCase())}</strong><br>
                        <small style="color: #bdc3c7;">${escapeHtml(g.category)} - ${g.created_at.split(' ')[1] || ''}</small>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <strong style="color: #e74c3c; font-size: 16px;">$${g.amount.toFixed(2)}</strong>
                        <button onclick="eliminarGasto(${g.id})" style="background: transparent; border: none; font-size: 18px; cursor: pointer;" title="Eliminar Gasto">🗑️</button>
                    </div>
                </div>
            `;
        });
    }
    document.getElementById('gastos-list-modal').style.display = 'flex';
};

window.eliminarGasto = async function(id) {
    const pin = await customPrompt('Seguridad: Ingrese PIN de Administrador para anular este gasto:', 'password');
    if (!pin) return;
    
    try {
        const res = await fetch(`/api/reports/expenses/${id}/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin })
        });
        
        if (res.ok) {
            await customAlert('Gasto anulado exitosamente.', 'success');
            document.getElementById('gastos-list-modal').style.display = 'none';
            loadCorteData(); // Refresca las sumas del corte automáticamente
        } else {
            const err = await res.json();
            await customAlert(err.error, 'error');
        }
    } catch(e) { await customAlert('Error de red', 'error'); }
};