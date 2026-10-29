// Corte de caja.
// Scripts clásicos que comparten el ámbito global; se cargan en orden desde index.html.
const corteDatePicker = document.getElementById('corte-date-picker');
const corteTitleDisplay = document.getElementById('corte-title-display');
if (corteDatePicker) { corteDatePicker.addEventListener('change', () => { loadCorteData(); }); }

const auditDatePicker = document.getElementById('audit-date-picker');
if (auditDatePicker) { auditDatePicker.addEventListener('change', () => { loadFullAuditLogs(); }); }

async function loadCorteData() {
    if (corteDatePicker && !corteDatePicker.value) { corteDatePicker.value = obtenerFechaLocal(); }
    const dateVal = corteDatePicker ? corteDatePicker.value : obtenerFechaLocal();
    if(corteTitleDisplay) corteTitleDisplay.textContent = `Corte de Caja: ${dateVal}`; 
    
    const resFondo = await fetch(`/api/reports/fondo?date=${dateVal}`);
    const dataFondo = await resFondo.json();
    const fondoAmount = dataFondo.fondo || 0;
    document.getElementById('corte-fondo').textContent = fmtMoney(fondoAmount);

    const response = await fetch(`/api/reports/corte?date=${dateVal}`); 
    const data = await response.json();
    
    if (response.ok) {
        const sum = data.summary;
        desgloseGastosActual = sum.desglose_gastos || []; // 💡 Guardamos los gastos en la memoria
        document.getElementById('corte-total').textContent = fmtMoney(sum.total_general);
        document.getElementById('corte-efectivo').textContent = fmtMoney(sum.total_efectivo);
        document.getElementById('corte-tarjeta').textContent = fmtMoney(sum.total_tarjeta);
        document.getElementById('corte-propinas-tarjeta').textContent = fmtMoney(sum.propinas_tarjeta);
        document.getElementById('corte-propinas-efectivo').textContent = fmtMoney(sum.propinas_efectivo);

        const totalGastos = sum.total_gastos || 0;
        document.getElementById('corte-gastos').textContent = fmtMoney(totalGastos);

        const efectivoEsperado = calcularEfectivoEsperado(fondoAmount, sum);
        document.getElementById('corte-esperado').textContent = fmtMoney(efectivoEsperado);
        ultimoEfectivoEsperado = efectivoEsperado;
        pintarComparativo('corte-compare', dateVal, sum.total_general);
        pintarEstadoConteo(dateVal);
        
        // === NUEVO DESGLOSE PARA LA DUEÑA (TPV Y LLEVAR) ===
        let totalLlevar = 0; 
        let totalComedor = 0;
        
        data.orders.forEach(o => { 
            if (o.table_number && o.table_number.toUpperCase().includes('LLEVAR')) { 
                totalLlevar += o.total; 
            } else { 
                totalComedor += o.total; 
            } 
        });

        const wsBox = document.getElementById('waiter-summary-box'); 
        wsBox.innerHTML = `
        <div style="display: flex; gap: 12px; margin-bottom: 20px; width: 100%; flex-wrap: wrap;">
            <div style="background: var(--surface-elevated); padding: 14px 18px; border-radius: var(--radius-md); flex: 1; min-width: 180px; border: 1px solid var(--border-subtle); border-left: 4px solid var(--color-purple); box-shadow: var(--shadow-sm);">
                <span style="font-size: 11px; font-weight: 800; color: var(--text-secondary); letter-spacing: 0.5px;">🛍️ VENTAS PARA LLEVAR</span>
                <h3 style="margin: 6px 0 0; color: #fff; font-size: 22px; font-family: var(--font-mono);">$${fmtMoney(totalLlevar)}</h3>
            </div>
            <div style="background: var(--surface-elevated); padding: 14px 18px; border-radius: var(--radius-md); flex: 1; min-width: 180px; border: 1px solid var(--border-subtle); border-left: 4px solid var(--color-success); box-shadow: var(--shadow-sm);">
                <span style="font-size: 11px; font-weight: 800; color: var(--text-secondary); letter-spacing: 0.5px;">🍽️ VENTAS COMEDOR</span>
                <h3 style="margin: 6px 0 0; color: #fff; font-size: 22px; font-family: var(--font-mono);">$${fmtMoney(totalComedor)}</h3>
            </div>
        </div>
        
        <h4 style="width: 100%; margin: 0 0 10px 0; color: var(--text-secondary); border-bottom: 1px solid var(--border-subtle); padding-bottom: 6px; font-size: 13px; font-weight: 800;">Rendimiento por Mesero:</h4>
        <div id="meseros-grid" style="display: flex; gap: 10px; width: 100%; flex-wrap: wrap;"></div>
        `;
        
        const meserosGrid = document.getElementById('meseros-grid');
        if (Object.keys(sum.ventas_por_mesero).length === 0) { 
            meserosGrid.innerHTML = '<p style="color: var(--text-muted); font-size: 13px;">No hay ventas registradas en esta fecha.</p>'; 
        } else { 
            for (const [waiter, info] of Object.entries(sum.ventas_por_mesero)) { 
                meserosGrid.innerHTML += `<div style="background: var(--surface-elevated); padding: 12px 14px; border-radius: var(--radius-md); border-left: 4px solid var(--brand-primary); border: 1px solid var(--border-subtle); flex: 1; min-width: 160px; box-shadow: var(--shadow-sm);"><span style="font-size: 12px; font-weight: 700; color: var(--text-secondary);">👤 ${waiter}</span><h4 style="margin: 4px 0 0; color: #fff; font-size: 18px; font-family: var(--font-mono);">$${info.total.toFixed(2)}</h4><small style="color: var(--brand-primary); font-weight: 700;">${info.tickets} ${info.tickets === 1 ? 'ticket' : 'tickets'}</small></div>`; 
            } 
        }
        // ====================================================
        
        const tbody = document.getElementById('corte-tbody');
        tbody.innerHTML = '';

        if (data.orders.length === 0) { 
            tbody.innerHTML = '<tr><td colspan="9" style="text-align: center;">Sin tickets en este día</td></tr>'; 
        } else { 
            data.orders.forEach(o => {
                let facturaHtml = '<span style="color: #7f8c8d; font-size: 11px;">N/A</span>';

                if (o.needs_invoice === 1) {
                    if (o.invoice_done === 1) {
                        facturaHtml = `<button onclick="toggleInvoice(${o.id})" style="background: #27ae60; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; font-weight: bold;" title="Clic para cambiar estado">🟢 HECHA</button>`;
                    } else {
                        facturaHtml = `<button onclick="toggleInvoice(${o.id})" style="background: #e74c3c; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; font-weight: bold;" title="Clic para marcar hecha">🔴 PENDIENTE</button>`;
                    }
                }

                tbody.innerHTML += `<tr>
                    <td><b>${escapeHtml(o.folio || '#' + o.id)}</b></td>
                    <td>Mesa ${o.table_number}</td>
                    <td>${o.waiter_name}</td>
                    <td>${escapeHtml(o.payment_method || '')}${(Number(o.cash_amount) > 0 && Number(o.card_amount) > 0) ? `<br><small style="color: var(--text-secondary); font-weight: 600; white-space: nowrap;">Efectivo $${fmtMoney(o.cash_amount)} · Tarjeta $${fmtMoney(o.card_amount)}</small>` : ''}</td>
                    <td><strong>$${o.total.toFixed(2)}</strong></td>
                    <td><span style="color: #27ae60; font-weight: bold;">$${(o.tip_amount || 0).toFixed(2)}</span></td>
                    <td style="text-align: center;">${facturaHtml}</td>
                    <td>${o.closed_at ? o.closed_at.split(' ')[1] : ''}</td>
                    <td>
                        <button onclick="reprintOrder(${o.id}, '${o.table_number}')" class="btn-secondary" style="background:#3498db; border: none; padding: 4px 8px; font-size: 11px; color: white; margin-right: 5px;">🖨️ Ver</button>
                        <button onclick="reopenOrder(${o.id}, ${o.table_id})" class="btn-secondary" style="background:#f39c12; border: none; padding: 4px 8px; font-size: 11px; color: white;">Reabrir</button>
                    </td>
                </tr>`; 
            }); 
        }
    }
}

window.configurarFondo = async function() {
    const pin = await customPrompt('Autorización. Ingrese PIN de Administrador:', 'password');
    if (!pin) return;
    await new Promise(r => setTimeout(r, 200));
    
    const amountStr = await customPrompt('Ingrese con cuánto dinero empieza la caja hoy ($):', 'number');
    if (!amountStr || isNaN(amountStr)) return;

    const dateVal = document.getElementById('corte-date-picker').value || obtenerFechaLocal();
    
    try {
        const res = await fetch('/api/reports/fondo', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin, date: dateVal, amount: parseFloat(amountStr) })
        });
        if (res.ok) {
            await customAlert('Fondo actualizado correctamente', 'success');
            loadCorteData();
        } else {
            const err = await res.json();
            await customAlert(err.error, 'error');
        }
    } catch(e) {
        await customAlert('Error de red', 'error');
    }
}

