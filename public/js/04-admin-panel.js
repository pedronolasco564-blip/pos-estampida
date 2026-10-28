// Panel administrativo: navegación, reporte del mes, inicio y auditoría.
// Scripts clásicos que comparten el ámbito global; se cargan en orden desde index.html.
// ========================================================
// PANEL ADMINISTRATIVO: navegación lateral y pestañas de Menú/Ajustes
// ========================================================
const ADMIN_TAB_KEY = 'pos_admin_tab';
const getAdminTab = () => { try { return localStorage.getItem(ADMIN_TAB_KEY) || 'platillos'; } catch (_) { return 'platillos'; } };

function updateAdminNav() {
    const tab = getAdminTab();
    const active = currentViewId === 'admin-hub-view' ? 'inicio'
        : currentViewId === 'corte-view' ? 'corte'
        : currentViewId === 'audit-view' ? 'auditoria'
        : currentViewId === 'report-view' ? 'reporte'
        : currentViewId === 'admin-view' ? ((tab === 'mesas' || tab === 'seguridad') ? 'ajustes' : 'menu')
        : '';
    document.querySelectorAll('.admin-nav-item[data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === active));
}

window.switchAdminTab = function(tab) {
    try { localStorage.setItem(ADMIN_TAB_KEY, tab); } catch (_) {}
    document.querySelectorAll('.admin-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.admin-tab-panel').forEach(p => { p.style.display = p.dataset.panel === tab ? '' : 'none'; });
    if (tab === 'seguridad') loadBackupStatus('settings-backup');
    updateAdminNav();
};

window.adminNavigate = function(section) {
    triggerHaptic(20);
    if (section === 'inicio') setView('admin-hub-view');
    else if (section === 'caja') { goToPOS(); loadProducts(); loadCategories(); }
    else if (section === 'corte') openSubAdmin('corte');
    else if (section === 'menu') { openSubAdmin('menu'); switchAdminTab('platillos'); }
    else if (section === 'ajustes') { openSubAdmin('menu'); switchAdminTab('mesas'); }
    else if (section === 'auditoria') openSubAdmin('audit');
    else if (section === 'reporte') { setView('report-view'); loadMonthlyReport(); }
};

// ========================================================
// REPORTE DEL MES (un renglón por día, como la hoja de Excel)
// ========================================================
window.loadMonthlyReport = async function() {
    const picker = document.getElementById('report-month');
    if (!picker.value) picker.value = obtenerFechaLocal().slice(0, 7);
    const tbody = document.getElementById('report-tbody');
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">Cargando…</td></tr>';
    try {
        const res = await fetch(`/api/reports/monthly?month=${picker.value}`);
        if (!res.ok) return;
        const rep = await res.json();
        const t = rep.totals;
        document.getElementById('report-title').textContent = `Reporte de ${rep.label}`;
        document.getElementById('rep-total').textContent = fmtMoney(t.total);
        document.getElementById('rep-tickets').textContent = `${t.tickets} tickets · ${t.dias_con_venta} ${t.dias_con_venta === 1 ? 'día' : 'días'} con venta`;
        document.getElementById('rep-efectivo').textContent = fmtMoney(t.efectivo);
        document.getElementById('rep-tpv').textContent = fmtMoney(t.tpv);
        document.getElementById('rep-promedio').textContent = fmtMoney(t.promedio_diario);
        document.getElementById('rep-mejor').textContent = t.mejor_dia ? `Mejor día: ${t.mejor_dia.weekday} ${t.mejor_dia.date.slice(8)} ($${fmtMoney(t.mejor_dia.total)})` : '';
        document.getElementById('rep-gastos').textContent = fmtMoney(t.gastos);
        document.getElementById('rep-diferencias').innerHTML = t.dias_contados
            ? `Faltantes <span class="dif-bad">$${fmtMoney(Math.abs(t.faltantes))}</span> · Sobrantes <span class="dif-warn">$${fmtMoney(t.sobrantes)}</span>`
            : 'Ningún día con conteo de caja guardado';

        if (rep.days.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">Sin movimientos en este mes</td></tr>';
        } else {
            tbody.innerHTML = '';
            rep.days.forEach(d => {
                const e = etiquetaDiferencia(d.diferencia);
                const tr = document.createElement('tr');
                tr.className = 'report-row';
                tr.title = 'Abrir el corte de este día';
                tr.innerHTML = `<td><b>${d.date.slice(8)}</b> <span class="report-weekday">${escapeHtml(d.weekday)}</span></td><td>${d.tickets}</td>
                    <td>$${fmtMoney(d.efectivo)}</td><td>$${fmtMoney(d.tpv)}</td><td><b>$${fmtMoney(d.total)}</b></td><td>$${fmtMoney(d.gastos)}</td>
                    <td>$${fmtMoney(d.fondo)}</td><td>$${fmtMoney(d.esperado)}</td><td>${d.contado === null ? '—' : '$' + fmtMoney(d.contado)}</td>
                    <td><span class="dif-badge ${e.clase}">${e.texto}</span></td>`;
                tr.onclick = () => { document.getElementById('corte-date-picker').value = d.date; openSubAdmin('corte'); };
                tbody.appendChild(tr);
            });
        }
        const gtbody = document.getElementById('report-gastos-tbody');
        gtbody.innerHTML = rep.gastos_por_concepto.length
            ? rep.gastos_por_concepto.map(g => `<tr><td><b>${escapeHtml(g.concepto)}</b></td><td>${escapeHtml(g.categoria || '')}</td><td>${g.veces}</td><td>$${fmtMoney(g.total)}</td></tr>`).join('')
            : '<tr><td colspan="4" style="text-align:center;">Sin gastos registrados en este mes</td></tr>';
    } catch (err) { console.error('Reporte mensual:', err); }
};

window.descargarExcelMes = async function() {
    const month = document.getElementById('report-month').value || obtenerFechaLocal().slice(0, 7);
    try {
        const res = await fetch(`/api/reports/monthly.xlsx?month=${month}`);
        if (!res.ok) { await customAlert('No se pudo generar el Excel.', 'error'); return; }
        const url = URL.createObjectURL(await res.blob());
        const a = document.createElement('a');
        a.href = url; a.download = `Ventas_Estampida_${month}.xlsx`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (_) { await customAlert('Error de red al descargar.', 'error'); }
};

// Efectivo que debe haber físicamente en la caja(misma fórmula en el corte y en el resumen)
function calcularEfectivoEsperado(fondo, sum) {
    return fondo + sum.total_efectivo - (sum.total_gastos || 0) - sum.propinas_tarjeta;
}

async function loadBackupStatus(targetId) {
    const el = document.getElementById(targetId);
    if (!el) return;
    try {
        const res = await fetch('/api/reports/backup-status');
        if (!res.ok) return;
        const data = await res.json();
        if (!data.last_backup) {
            el.innerHTML = '⚠️ Aún no hay respaldos automáticos (se crean al abrir la app de escritorio).';
            el.style.color = 'var(--color-warning)';
            return;
        }
        const dias = Math.round((new Date(obtenerFechaLocal()) - new Date(data.last_backup)) / 86400000);
        const cuando = dias <= 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`;
        // Copia fuera de la PC (memoria USB, Google Drive u OneDrive), elegida en el icono del POS junto al reloj
        const ext = data.external;
        const externo = !ext
            ? '⚠️ Sin copia fuera de la PC: elígela en el icono del POS junto al reloj → Copia de respaldo fuera de la PC.'
            : ext.ok ? `✅ Copia fuera de la PC al día (${escapeHtml(ext.last_ok || '—')}).`
            : `⚠️ La copia fuera de la PC falló: ${escapeHtml(ext.error || '')}`;
        const alerta = dias > 2 || !ext || !ext.ok;
        el.innerHTML = `${dias > 2 ? '⚠️' : '✅'} Último respaldo automático: <b>${escapeHtml(data.last_backup)}</b> (${cuando}) · ${data.count} guardados<br>${externo}`;
        el.style.color = alerta ? 'var(--color-warning)' : 'var(--text-secondary)';
    } catch (err) { console.error('Respaldo:', err); }
}

// Resumen del día en la pantalla de Inicio del panel
window.loadDashboard = async function() {
    if (!isAdminSessionActive) return;
    const hoy = obtenerFechaLocal();
    const dateEl = document.getElementById('dash-date');
    if (dateEl) {
        const txt = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Mexico_City' });
        dateEl.textContent = txt.charAt(0).toUpperCase() + txt.slice(1);
    }
    loadBackupStatus('dash-backup');
    try {
        const [resFondo, resCorte, resTables] = await Promise.all([
            fetch(`/api/reports/fondo?date=${hoy}`), fetch(`/api/reports/corte?date=${hoy}`), fetch('/api/catalog/tables')
        ]);
        if (!resFondo.ok || !resCorte.ok || !resTables.ok) return;
        const fondo = (await resFondo.json()).fondo || 0;
        const corte = await resCorte.json();
        const tables = (await resTables.json()).tables || [];
        const sum = corte.summary;

        document.getElementById('dash-ventas').textContent = fmtMoney(sum.total_general);
        pintarComparativo('dash-compare', hoy, sum.total_general);
        const nTickets = corte.orders.length;
        document.getElementById('dash-tickets').textContent = `${nTickets} ${nTickets === 1 ? 'ticket cerrado' : 'tickets cerrados'}`;
        document.getElementById('dash-esperado').textContent = fmtMoney(calcularEfectivoEsperado(fondo, sum));

        const abiertas = tables.filter(t => t.status === 'OCUPADA');
        const pendiente = (t) => (t.remaining_balance !== null && t.remaining_balance !== undefined) ? t.remaining_balance : (t.current_total || 0);
        document.getElementById('dash-por-cobrar').textContent = fmtMoney(abiertas.reduce((acc, t) => acc + pendiente(t), 0));
        document.getElementById('dash-mesas-abiertas').textContent = `${abiertas.length} ${abiertas.length === 1 ? 'mesa abierta' : 'mesas abiertas'}`;

        const drafts = tables.filter(t => t.has_draft).length;
        document.getElementById('dash-drafts').textContent = drafts;
        document.getElementById('dash-drafts-card').style.borderLeftColor = drafts > 0 ? 'var(--brand-primary)' : 'var(--border-subtle)';

        const list = document.getElementById('dash-open-tables');
        const conPendiente = tables.filter(t => t.status === 'OCUPADA' || t.has_draft)
            .sort((a, b) => (b.minutes_open || 0) - (a.minutes_open || 0));
        if (conPendiente.length === 0) {
            list.innerHTML = '<p class="metric-note">No hay mesas abiertas en este momento.</p>';
        } else {
            list.innerHTML = '';
            conPendiente.forEach(t => {
                const mins = t.minutes_open || 0;
                const color = mins > 45 ? 'var(--color-danger)' : mins > 20 ? 'var(--color-warning)' : 'var(--color-success)';
                const row = document.createElement('button');
                row.className = 'dash-row';
                row.innerHTML = `<span class="dash-row-table">Mesa ${escapeHtml(t.table_number)}</span>
                    <span class="dash-row-meta">${t.status === 'OCUPADA' ? `<span style="color:${color}">● ${mins} min</span> · 👤 ${escapeHtml(t.waiter_name || '—')}` : ''}${t.has_draft ? ' <span class="dash-row-draft">📝 sin enviar</span>' : ''}</span>
                    <span class="dash-row-total">${t.status === 'OCUPADA' ? '$' + fmtMoney(pendiente(t)) : ''}</span>`;
                // Abre la mesa directamente en la caja
                row.onclick = () => { adminNavigate('caja'); selectTable(t); };
                list.appendChild(row);
            });
        }
    } catch (err) { console.error('Resumen del día:', err); }
};
window.openSubAdmin = async function(section) {
    if (section === 'corte') { setView('corte-view'); loadCorteData(); } 
    else if (section === 'menu') { setView('admin-view'); switchAdminTab(getAdminTab()); loadAdminProducts(); loadCategories(); loadWaiters(); loadModifiers(); }
    else if (section === 'audit') { setView('audit-view'); loadFullAuditLogs(); }
};

document.getElementById('btn-close-corte').onclick = () => { setView('admin-hub-view'); };
document.getElementById('btn-close-admin').onclick = () => { setView('admin-hub-view'); loadProducts(); loadCategories(); loadTables(); };
document.getElementById('btn-close-audit').onclick = () => { setView('admin-hub-view'); };

function clearTableSelection() {
    draftTableId = null; currentTableId = null; currentOrderId = null; currentFolio = null;currentTableSpan.textContent = 'Ninguna'; btnDeselectTable.style.display = 'none'; btnTransferTable.style.display = 'none'; savedOrderItems = []; newOrderItems = []; paymentPanel.style.display = 'none'; document.getElementById('payment-buttons-container').style.display = 'none'; currentRemainingBalance = 0; selectedItemsToPay = []; document.getElementById('items-to-pay-container').style.display = 'none'; document.getElementById('pay-discount-display-container').style.display = 'none'; waiterSelect.disabled = false; waiterSelect.style.backgroundColor = '#2a2a2a'; waiterSelect.style.color = '#fff'; if(waiterSelect.previousElementSibling) waiterSelect.previousElementSibling.innerHTML = 'Mesero en Turno:'; updateOrderUI();
    document.querySelectorAll('.btn-table').forEach(b => b.classList.remove('selected'));
    closeMobileSheet();
}

// Nombre legible, estilo y grupos de cada movimiento de auditoría
const AUDIT_ACTIONS = {
    CREAR_ORDEN:             { label: 'Orden abierta',        cls: 't-order', groups: ['ordenes'] },
    AGREGAR_ITEMS:           { label: 'Platillos agregados',  cls: 't-order', groups: ['ordenes'] },
    CANCELAR_PLATILLO:       { label: 'Platillo cancelado',   cls: 't-alert', groups: ['ordenes', 'importantes'] },
    CANCELAR_ORDEN_COMPLETA: { label: 'Orden cancelada',      cls: 't-alert', groups: ['ordenes', 'importantes'] },
    DESCUENTO_APLICADO:      { label: 'Descuento',            cls: 't-alert', groups: ['ordenes', 'dinero', 'importantes'] },
    REABRIR_CUENTA:          { label: 'Cuenta reabierta',     cls: 't-alert', groups: ['ordenes', 'importantes'] },
    GASTO_REGISTRADO:        { label: 'Gasto / retiro',       cls: 't-money', groups: ['dinero'] },
    ELIMINAR_GASTO:          { label: 'Gasto eliminado',      cls: 't-alert', groups: ['dinero', 'importantes'] },
    CONTEO_CAJA:             { label: 'Conteo de caja',       cls: 't-money', groups: ['dinero'] },
    CAMBIO_PIN:              { label: 'Cambio de PIN',        cls: 't-alert', groups: ['importantes'] },
    CUENTA_CERRADA:          { label: 'Cerrada con abonos',   cls: 't-money', groups: ['ordenes', 'dinero'] },
};
const auditInfo = (action) => AUDIT_ACTIONS[action] || { label: action, cls: '', groups: [] };
let auditLogs = [];
let auditGroup = 'todos';

async function loadFullAuditLogs() {
    const auditDatePicker = document.getElementById('audit-date-picker');

    // Si el calendario está vacío, ponle la fecha de HOY en automático
    if (auditDatePicker && !auditDatePicker.value) {
        auditDatePicker.value = obtenerFechaLocal();
    }

    const dateVal = auditDatePicker ? auditDatePicker.value : obtenerFechaLocal();
    try {
        // Le mandamos la fecha seleccionada al servidor en la URL
        const response = await fetch(`/api/reports/audit?date=${dateVal}`);
        const data = await response.json();
        auditLogs = data.logs || [];

        // Usuarios del día para el filtro (se conserva la elección si sigue existiendo)
        const userSel = document.getElementById('audit-user-filter');
        if (userSel) {
            const prev = userSel.value;
            const users = [...new Set(auditLogs.map(l => l.performed_by || 'N/A'))].sort();
            userSel.innerHTML = `<option value="">Todos los usuarios</option>` + users.map(u => `<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`).join('');
            userSel.value = users.includes(prev) ? prev : '';
        }
        renderAuditLogs();
    } catch (error) {
        console.error('Error al cargar auditoría:', error);
    }
}

function renderAuditLogs() {
    const tbody = document.getElementById('full-audit-tbody');
    if (!tbody) return;
    const user = (document.getElementById('audit-user-filter') || {}).value || '';
    const text = ((document.getElementById('audit-search') || {}).value || '').trim().toLowerCase();

    const importantes = auditLogs.filter(l => auditInfo(l.action).groups.includes('importantes')).length;
    const chipAlert = document.querySelector('.audit-chip[data-group="importantes"]');
    if (chipAlert) chipAlert.textContent = importantes ? `⚠️ Importantes (${importantes})` : '⚠️ Importantes';
    document.querySelectorAll('.audit-chip').forEach(c => c.classList.toggle('active', c.dataset.group === auditGroup));

    const rows = auditLogs.filter(l => {
        const info = auditInfo(l.action);
        if (auditGroup !== 'todos' && !info.groups.includes(auditGroup)) return false;
        if (user && (l.performed_by || 'N/A') !== user) return false;
        if (text && !`${info.label} ${l.action} ${l.details || ''} ${l.performed_by || ''}`.toLowerCase().includes(text)) return false;
        return true;
    });

    const count = document.getElementById('audit-count');
    if (count) count.textContent = auditLogs.length ? `Mostrando ${rows.length} de ${auditLogs.length} movimientos del día.` : '';

    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center;">${auditLogs.length ? 'Ningún movimiento coincide con el filtro.' : 'No hay registros de auditoría para este día.'}</td></tr>`;
        return;
    }
    tbody.innerHTML = rows.map(log => {
        const info = auditInfo(log.action);
        const hora = (log.created_at || '').split(' ')[1] || log.created_at || '';
        return `<tr class="${info.groups.includes('importantes') ? 'audit-row-alert' : ''}"><td style="white-space: nowrap;">${escapeHtml(hora.slice(0, 5))}</td><td><span class="audit-tag ${info.cls}" title="${escapeHtml(log.action)}">${escapeHtml(info.label)}</span></td><td>${escapeHtml(log.details || '')}</td><td>${escapeHtml(log.performed_by || 'N/A')}</td></tr>`;
    }).join('');
}

window.setAuditGroup = function(group) { auditGroup = group; renderAuditLogs(); };
window.moverDiaAuditoria = function(dias) {
    const picker = document.getElementById('audit-date-picker');
    if (!picker) return;
    picker.value = desplazarFecha(picker.value || obtenerFechaLocal(), dias);
    loadFullAuditLogs();
};

