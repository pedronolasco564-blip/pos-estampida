// Función global BLINDADA para obtener la fecha local exacta de Tuxtepec
function obtenerFechaLocal() {
    const fechaMexico = new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" });
    const d = new Date(fechaMexico);
    
    const anio = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    
    return `${anio}-${mes}-${dia}`;
}

// 🛡️ Sanitizador anti-XSS: escapa caracteres HTML peligrosos antes de inyectar en innerHTML
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const str = String(text);
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return str.replace(/[&<>"']/g, (c) => map[c]);
}

// Montos con separador de miles ($4,245.00). Solo para mostrar: nunca se leen de vuelta de la pantalla.
const fmtMoney = (n) => (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
// Fecha AAAA-MM-DD desplazada N días (sin depender de la zona horaria)
// Parte de una cuenta dividida en partes iguales, redondeada al centavo hacia arriba:
// $100 entre 3 = $33.34 por persona, así la mesa nunca queda debiendo $0.01 (el último recibe su cambio).
const montoPorPersona = (total, personas) => Math.ceil(Math.round(total * 100) / personas) / 100;

function desplazarFecha(fecha, dias) {
    const [y, m, d] = fecha.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}
const diaSemana = (fecha) => { const [y, m, d] = fecha.split('-').map(Number); return DIAS_SEMANA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; };

// Comparativo contra el mismo día de la semana pasada (ej. "▲ 12% vs lunes pasado ($3,780.00)")
async function pintarComparativo(elId, fecha, totalHoy) {
    const el = document.getElementById(elId);
    if (!el) return;
    try {
        const res = await fetch(`/api/reports/corte?date=${desplazarFecha(fecha, -7)}`);
        if (!res.ok) { el.textContent = ''; return; }
        const prev = (await res.json()).summary.total_general;
        const dia = diaSemana(fecha);
        if (!prev) { el.textContent = `Sin ventas el ${dia} anterior`; el.style.color = 'var(--text-muted)'; return; }
        const pct = Math.round(((totalHoy - prev) / prev) * 100);
        el.textContent = `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs ${dia} anterior ($${fmtMoney(prev)})`;
        el.style.color = pct >= 0 ? 'var(--color-success)' : 'var(--color-danger)';
    } catch (_) { el.textContent = ''; }
}

let modalCloseTimeout; 
function showCustomModal({ type = 'info', title = 'Atención', text = '', showInput = false, inputType = 'text', inputValue = '', showCancel = false, choices = null, currentChoice = '' }) {
    return new Promise((resolve) => {
        clearTimeout(modalCloseTimeout); 
        const overlay = document.getElementById('custom-alert-overlay'); const box = document.getElementById('custom-alert-box'); const icon = document.getElementById('custom-alert-icon'); const titleEl = document.getElementById('custom-alert-title'); const textEl = document.getElementById('custom-alert-text'); const inputEl = document.getElementById('custom-alert-input'); const btnOk = document.getElementById('custom-alert-ok'); const btnCancel = document.getElementById('custom-alert-cancel');
        const typeStyles = { 'success': { icon: '✅', color: '#27ae60' }, 'error': { icon: '❌', color: '#e74c3c' }, 'warning': { icon: '⚠️', color: '#f39c12' }, 'info': { icon: '💡', color: '#3498db' } };
        icon.textContent = typeStyles[type].icon; btnOk.style.backgroundColor = typeStyles[type].color; titleEl.textContent = title; textEl.innerHTML = text;
        if (showInput) { inputEl.type = inputType; inputEl.value = inputValue; inputEl.style.display = 'block'; setTimeout(() => inputEl.focus(), 100); } else { inputEl.style.display = 'none'; }
        btnCancel.style.display = showCancel ? 'block' : 'none'; overlay.style.display = 'flex';
        setTimeout(() => { overlay.style.opacity = '1'; box.style.transform = 'scale(1)'; }, 10);
        const closeModal = (result) => { overlay.style.opacity = '0'; box.style.transform = 'scale(0.9)'; modalCloseTimeout = setTimeout(() => { overlay.style.display = 'none'; }, 200); btnOk.onclick = null; btnCancel.onclick = null; inputEl.onkeypress = null; resolve(result); };
        btnOk.onclick = () => closeModal(showInput ? inputEl.value : true); btnCancel.onclick = () => { const l = document.getElementById('custom-alert-choices'); if (l) l.remove(); closeModal(showInput || choices ? null : false); };
        if (showInput) { inputEl.onkeypress = (e) => { if (e.key === 'Enter') btnOk.click(); }; }
        // Lista de opciones: se elige tocando un botón (sin escribir), el resultado es el texto elegido.
        btnOk.style.display = choices ? 'none' : '';
        const oldList = document.getElementById('custom-alert-choices'); if (oldList) oldList.remove();
        if (choices) {
            const list = document.createElement('div');
            list.id = 'custom-alert-choices';
            list.style.cssText = 'display:flex; flex-direction:column; gap:8px; margin-bottom:16px; max-height:45vh; overflow-y:auto;';
            choices.forEach((name) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.textContent = name === currentChoice ? `✓ ${name}` : name;
                b.className = name === currentChoice ? 'btn-primary' : 'btn-secondary';
                b.style.cssText = 'padding:14px; font-size:15px; font-weight:700; width:100%;';
                b.onclick = () => { list.remove(); closeModal(name); };
                list.appendChild(b);
            });
            textEl.insertAdjacentElement('afterend', list);
        }
    });
}
const customAlert = (text, type = 'info', title = 'Atención') => showCustomModal({ type, title, text });
const customSelect = (text, choices, currentChoice = '', title = 'Seleccionar') => showCustomModal({ type: 'info', title, text, showCancel: true, choices, currentChoice });
const customConfirm = (text, title = 'Confirmar') => showCustomModal({ type: 'warning', title, text, showCancel: true });
const customPrompt = (text, inputType = 'text', inputValue = '', title = 'Entrada requerida') => showCustomModal({ type: 'info', title, text, showInput: true, inputType, inputValue, showCancel: true });

// ========================================================
// SESIÓN DE ADMINISTRADOR (el servidor es quien decide; esto solo guarda el token)
// ========================================================
const ADMIN_TOKEN_KEY = 'pos_admin_token';
const getAdminToken = () => { try { return localStorage.getItem(ADMIN_TOKEN_KEY) || ''; } catch (_) { return ''; } };
const setAdminToken = (t) => { try { t ? localStorage.setItem(ADMIN_TOKEN_KEY, t) : localStorage.removeItem(ADMIN_TOKEN_KEY); } catch (_) {} };

// Toda petición a /api lleva el token automáticamente; si el servidor lo rechaza, se cierra el panel.
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const isApi = url.startsWith('/api/');
    const token = getAdminToken();
    if (isApi && token) init = { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } };
    const res = await nativeFetch(input, init);
    if (isApi && res.status === 401 && isAdminSessionActive) handleAdminExpired();
    return res;
};

function handleAdminExpired() {
    isAdminSessionActive = false; setAdminToken(''); localStorage.setItem('isAdminSessionActive', 'false');
    if (btnMasterAdmin) { btnMasterAdmin.innerHTML = '👑 Panel de Administrador'; btnMasterAdmin.style.backgroundColor = '#1a1a1a'; }
    setView('welcome-view');
    customAlert('La sesión de administrador expiró. Vuelve a ingresar tu PIN.', 'warning', 'Sesión cerrada');
}

let isAdminSessionActive = localStorage.getItem('isAdminSessionActive') === 'true' && !!getAdminToken();
// Al recargar, confirma con el servidor que la sesión sigue vigente (un 401 cierra el panel).
if (isAdminSessionActive) fetch('/api/catalog/session').catch(() => {});
let currentViewId = localStorage.getItem('currentViewId') || 'welcome-view';

const welcomeView = document.getElementById('welcome-view');
const mainHeader = document.getElementById('main-header');
const posView = document.getElementById('pos-view'); 
const adminHubView = document.getElementById('admin-hub-view');
const adminView = document.getElementById('admin-view'); 
const corteView = document.getElementById('corte-view'); 
const auditView = document.getElementById('audit-view');
const reportView = document.getElementById('report-view');

// ========================================================
// NAVEGACIÓN Y UX (Transiciones Suaves y Botón Atrás)
// ========================================================
window.addEventListener('popstate', (e) => {
    if (e.state && e.state.view) { setView(e.state.view, false); }
});

const ADMIN_VIEWS = ['admin-hub-view', 'corte-view', 'admin-view', 'audit-view', 'report-view'];

function setView(viewId, pushHistory = true) {
    if(welcomeView) welcomeView.style.display = 'none';
    if(posView) posView.style.display = 'none';
    if(adminHubView) adminHubView.style.display = 'none';
    if(corteView) corteView.style.display = 'none';
    if(adminView) adminView.style.display = 'none';
    if(auditView) auditView.style.display = 'none';
    if(reportView) reportView.style.display = 'none';
    
const target = document.getElementById(viewId);
    if (target) { 
        target.style.opacity = '0';
        target.style.display = (viewId === 'welcome-view') ? 'flex' : (viewId === 'pos-view' ? '' : 'block'); 
        setTimeout(() => { 
            target.style.transition = 'opacity 0.2s ease-in-out';
            target.style.opacity = '1'; 
        }, 10);
    }
    
    if (mainHeader) { mainHeader.style.display = (viewId === 'welcome-view') ? 'none' : 'flex'; }
    
    localStorage.setItem('currentViewId', viewId);
    currentViewId = viewId;

    // Barra lateral del panel: solo en vistas de administración y con sesión de admin
    const isAdminView = ADMIN_VIEWS.includes(viewId) && isAdminSessionActive;
    document.body.classList.toggle('admin-mode', isAdminView);
    const adminNav = document.getElementById('admin-nav');
    if (adminNav) adminNav.style.display = isAdminView ? '' : 'none';
    if (isAdminView) updateAdminNav();
    if (viewId === 'admin-hub-view' && isAdminSessionActive) loadDashboard();

    if (pushHistory) {
        window.history.pushState({ view: viewId }, '', `#${viewId}`);
    }
}

let currentFolio = null; // etiqueta del folio de la cuenta abierta (#35 comedor, LL-0012 para llevar)
let currentTableId = null; let currentOrderId = null;let savedOrderItems = []; let newOrderItems = []; let allProducts = []; let lastSelectedWaiter = ''; let currentModifiers = []; let currentRemainingBalance = 0; let selectedItemsToPay = []; let lastPaymentFullyPaid = false; let pendingCancelType = null; let pendingCancelItemId = null; let isReprinting = false; let productClicks = {};
let desgloseGastosActual = [];

let tableInstructions = {};

const tablesGrid = document.getElementById('tables-grid'); const menuGrid = document.getElementById('menu-grid'); const currentTableSpan = document.getElementById('current-table'); const orderItemsList = document.getElementById('order-items'); const orderTotalSpan = document.getElementById('order-total');
const btnSendPrint = document.getElementById('btn-send-print'); const btnSendSave = document.getElementById('btn-send-save'); const actionButtonsContainer = document.getElementById('action-buttons-container');
const btnPayOrder = document.getElementById('btn-pay-order'); const btnCancelOrder = document.getElementById('btn-cancel-order'); const btnDeselectTable = document.getElementById('btn-deselect-table'); const btnTransferTable = document.getElementById('btn-transfer-table'); 
const paymentPanel = document.getElementById('payment-panel'); const inputAmountPaid = document.getElementById('amount-paid'); const waiterSelect = document.getElementById('waiter-select');
const noteModal = document.getElementById('note-modal'); const modalNoteInput = document.getElementById('modal-note-input'); const noteModalTitle = document.getElementById('note-modal-title'); const quickModifiersGrid = document.getElementById('quick-modifiers-grid');

// ========================================================
// BORRADOR DE ORDEN: lo que se va tomando se guarda en el servidor por mesa,
// así no se pierde al cambiar de mesa y lo ven todos los dispositivos.
// ========================================================
const DEVICE_ID = (() => {
    try {
        let id = localStorage.getItem('pos_device_id');
        if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('pos_device_id', id); }
        return id;
    } catch (_) { return Math.random().toString(36).slice(2); }
})();
let draftTableId = null;       // mesa cuyo borrador ya se cargó (solo entonces se guardan cambios)
let draftSynced = '[]';        // último contenido enviado al servidor
let draftQueue = Promise.resolve();
let draftPending = 0;

const serializeDraft = (items) => JSON.stringify(items.map(i => ({ product_id: i.product_id, name: i.name, price: i.price, quantity: i.quantity, notes: i.notes || '', is_takeaway: !!i.is_takeaway, station: i.station, extra_price: i.extra_price || 0 })));

// Se llama en cada redibujo de la comanda: si cambió algo, lo manda (en orden) al servidor.
function syncDraft() {
    if (!currentTableId || draftTableId !== currentTableId) return;
    const snapshot = serializeDraft(newOrderItems);
    if (snapshot === draftSynced) return;
    draftSynced = snapshot;
    const tableId = currentTableId;
    const waiter = waiterSelect ? waiterSelect.value : '';
    draftPending++;
    draftQueue = draftQueue.then(async () => {
        try {
            const res = await fetch(`/api/orders/drafts/${tableId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: JSON.parse(snapshot), waiter_name: waiter, device_id: DEVICE_ID }) });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch (err) {
            console.error('No se pudo guardar el borrador:', err);
            if (draftTableId === tableId && draftSynced === snapshot) draftSynced = null; // se reintenta en el próximo cambio
        } finally { draftPending--; }
    });
}

async function loadDraft(tableId) {
    await draftQueue; // primero que lleguen los cambios que este dispositivo ya mandó
    try {
        const res = await fetch(`/api/orders/drafts/${tableId}`);
        const data = await res.json();
        if (currentTableId !== tableId) return; // se cambió de mesa mientras cargaba
        newOrderItems = data.items || [];
        draftSynced = serializeDraft(newOrderItems);
        draftTableId = tableId;
    } catch (err) {
        console.error('No se pudo cargar el borrador:', err); // sin conexión: se trabaja local, sin pisar el del servidor
    }
}
let editingItemIndex = null; 
let tempExtraPrice = 0; 

const statusBar = document.getElementById('status-bar');
function updateNetworkStatus() { if (navigator.onLine) { statusBar.innerHTML = '🟢 Conectado'; statusBar.style.color = '#2ecc71'; statusBar.style.fontWeight = 'bold'; } else { statusBar.innerHTML = '🔴 Sin Red'; statusBar.style.color = '#e74c3c'; statusBar.style.fontWeight = 'bold'; } }
window.addEventListener('online', updateNetworkStatus); window.addEventListener('offline', updateNetworkStatus);

// ========================================================
// FASE 2: ERGONOMÍA MÓVIL Y PERSISTENCIA DE MESERO
// ========================================================
function triggerHaptic(duration = 35) {
    try {
        if ('vibrate' in navigator) {
            navigator.vibrate(duration);
        }
    } catch (_) {}
}

function getDeviceWaiter() {
    return localStorage.getItem('pos_waiter_device') || '';
}

function setDeviceWaiter(name) {
    const trimmed = (name || '').trim();
    if (trimmed) {
        localStorage.setItem('pos_waiter_device', trimmed);
        lastSelectedWaiter = trimmed;
    } else {
        localStorage.removeItem('pos_waiter_device');
        lastSelectedWaiter = '';
    }
    updateDeviceWaiterBadge();
    if (waiterSelect && !waiterSelect.disabled) {
        waiterSelect.value = trimmed;
    }
}

function updateDeviceWaiterBadge() {
    const badgeName = document.getElementById('header-waiter-name');
    if (badgeName) {
        const waiter = getDeviceWaiter();
        badgeName.textContent = waiter || 'Asignar Mesero';
    }
}

const SIN_ASIGNAR = 'Sin asignar';
window.changeDeviceWaiter = async function() {
    triggerHaptic(25);
    try {
        const res = await fetch('/api/catalog/waiters');
        const data = await res.json();
        const waiters = (data.waiters || []).map(w => w.name);
        if (waiters.length === 0) {
            await customAlert('No hay meseros registrados en el sistema.', 'warning');
            return;
        }
        const selected = await customSelect(
            'Toca el mesero asignado a este dispositivo:',
            [...waiters, SIN_ASIGNAR],
            getDeviceWaiter(),
            'Asignar Mesero a este Celular'
        );
        if (selected !== null) {
            if (selected === SIN_ASIGNAR) {
                setDeviceWaiter('');
            } else {
                setDeviceWaiter(selected);
                await customAlert(`Dispositivo asignado a: ${escapeHtml(selected)}`, 'success');
            }
            loadTables();
        }
    } catch (err) {
        console.error('Error al cambiar mesero:', err);
    }
};

window.openMobileSheet = function() {
    triggerHaptic(30);
    const sheet = document.getElementById('order-section');
    const backdrop = document.getElementById('mobile-sheet-backdrop');
    if (sheet) sheet.classList.add('sheet-open');
    if (backdrop) backdrop.classList.add('active');
};

window.closeMobileSheet = function() {
    const sheet = document.getElementById('order-section');
    const backdrop = document.getElementById('mobile-sheet-backdrop');
    if (sheet) sheet.classList.remove('sheet-open');
    if (backdrop) backdrop.classList.remove('active');
};

window.addQuickTerm = function(term) {
    triggerHaptic(25);
    const input = document.getElementById('modal-note-input');
    if (!input) return;
    const currentVal = input.value.trim();
    if (currentVal) {
        if (!currentVal.toLowerCase().includes(term.toLowerCase())) {
            input.value = `${currentVal}, ${term}`;
        }
    } else {
        input.value = term;
    }
};

let filterOnlyMyTables = false;

window.toggleMyTablesFilter = function() {
    triggerHaptic(30);
    filterOnlyMyTables = !filterOnlyMyTables;
    const btn = document.getElementById('btn-toggle-my-tables');
    const indicator = document.getElementById('my-tables-indicator');
    if (btn && indicator) {
        if (filterOnlyMyTables) {
            btn.style.background = '#d35400';
            btn.style.color = '#fff';
            btn.style.borderColor = '#e67e22';
            indicator.textContent = '🟢';
        } else {
            btn.style.background = '#252525';
            btn.style.color = '#bdc3c7';
            btn.style.borderColor = '#444';
            indicator.textContent = '⚪';
        }
    }
    loadTables();
};

const btnMasterAdmin = document.getElementById('btn-master-admin');

document.addEventListener('DOMContentLoaded', () => {
    updateNetworkStatus(); 
    updateDeviceWaiterBadge();
    loadTables(); loadCategories(); loadProducts(); loadWaiters(); loadModifiers();
    if (waiterSelect) {
        waiterSelect.addEventListener('change', (e) => {
            lastSelectedWaiter = e.target.value;
            if (e.target.value) {
                setDeviceWaiter(e.target.value);
            }
        });
    }
    if (btnDeselectTable) {
        btnDeselectTable.onclick = async () => {
            // Los platillos sin enviar quedan guardados en la mesa
            clearTableSelection();
        };
    }
    document.getElementById('btn-save-note').onclick = () => { 
        if (editingItemIndex !== null) { 
            newOrderItems[editingItemIndex].notes = modalNoteInput.value.trim(); 
            newOrderItems[editingItemIndex].extra_price = tempExtraPrice;
            updateOrderUI(); 
        } 
        noteModal.style.display = 'none'; 
    };
    document.getElementById('btn-cancel-note').onclick = () => { noteModal.style.display = 'none'; };
    document.getElementById('btn-clear-note').onclick = () => { 
        modalNoteInput.value = ''; 
        tempExtraPrice = 0;
    };

    if (isAdminSessionActive && btnMasterAdmin) { btnMasterAdmin.innerHTML = '👑 Volver al Panel (Desbloqueado)'; btnMasterAdmin.style.backgroundColor = '#d35400'; }
    setView(currentViewId);
    if(currentViewId === 'corte-view') loadCorteData();
    if(currentViewId === 'admin-view') { switchAdminTab(getAdminTab()); loadAdminProducts(); loadCategories(); loadWaiters(); loadModifiers(); }
    if(currentViewId === 'audit-view') loadFullAuditLogs();
    if(currentViewId === 'report-view') loadMonthlyReport();
});

const loginModal = document.getElementById('login-modal'); const loginPinInput = document.getElementById('login-pin-input'); const loginErrorMsg = document.getElementById('login-error-msg'); 

window.enterAsWaiter = function() { setView('pos-view'); loadTables(); };
window.enterAsAdmin = function() { loginPinInput.value = ''; loginErrorMsg.style.display = 'none'; loginModal.style.display = 'flex'; setTimeout(() => loginPinInput.focus(), 100); };
if(btnMasterAdmin) { 
        btnMasterAdmin.onclick = async () => { 
            // Los platillos sin enviar quedan guardados en la mesa
            if (newOrderItems.length > 0) clearTableSelection();
            if (isAdminSessionActive) { 
                setView('admin-hub-view'); 
            } else { 
                loginPinInput.value = ''; loginErrorMsg.style.display = 'none'; loginModal.style.display = 'flex'; setTimeout(() => loginPinInput.focus(), 100); 
            } 
        }; 
    }
document.getElementById('btn-login-cancel').onclick = () => { loginModal.style.display = 'none'; };

document.getElementById('btn-login-submit').onclick = async () => {
    const pin = loginPinInput.value; if (!pin) return;
    try {
        const response = await fetch('/api/catalog/verify-pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) });
        if (response.ok) { 
            const loginData = await response.json();
            setAdminToken(loginData.token);
            loginModal.style.display = 'none'; 
            isAdminSessionActive = true; localStorage.setItem('isAdminSessionActive', 'true');
            btnMasterAdmin.innerHTML = '👑 Volver al Panel (Desbloqueado)'; btnMasterAdmin.style.backgroundColor = '#d35400'; 
            setView('admin-hub-view');
        } else { loginErrorMsg.style.display = 'block'; loginPinInput.value = ''; loginPinInput.focus(); }
    } catch (err) { console.error('Error PIN', err); }
};
loginPinInput.addEventListener('keypress', function (e) { if (e.key === 'Enter') document.getElementById('btn-login-submit').click(); });

document.getElementById('btn-exit-admin').onclick = async () => {
    if (!(await customConfirm('¿Deseas bloquear el panel y cerrar tu sesión?', 'Seguridad'))) return;
    try { await fetch('/api/catalog/logout', { method: 'POST' }); } catch (_) {}
    setAdminToken('');
    isAdminSessionActive = false; localStorage.setItem('isAdminSessionActive', 'false');
    btnMasterAdmin.innerHTML = '👑 Panel de Administrador'; btnMasterAdmin.style.backgroundColor = '#1a1a1a'; 
    setView('welcome-view'); clearTableSelection(); loadTables(); await customAlert('Sesión cerrada. El sistema está protegido.', 'success');
};

window.goToPOS = function() { setView('pos-view'); loadTables(); };

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
        el.innerHTML = `${dias > 2 ? '⚠️' : '✅'} Último respaldo automático: <b>${escapeHtml(data.last_backup)}</b> (${cuando}) · ${data.count} guardados`;
        el.style.color = dias > 2 ? 'var(--color-warning)' : 'var(--text-secondary)';
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

async function loadModifiers() { try { const response = await fetch('/api/catalog/modifiers'); const data = await response.json(); currentModifiers = data.modifiers; const adminModifiersList = document.getElementById('admin-modifiers-list'); if (adminModifiersList) { adminModifiersList.innerHTML = ''; currentModifiers.forEach(m => { const displayPrice = m.price > 0 ? ` (+$${m.price})` : ''; adminModifiersList.innerHTML += `<span style="background: #2c2c2c; padding: 4px 8px; border-radius: 4px; border: 1px solid #444; display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: bold;">${m.name}${displayPrice} <button onclick="deleteModifier(${m.id})" style="background: #c39bd3; color: white; border: none; border-radius: 3px; padding: 2px 6px; cursor: pointer;">✕</button></span>`; }); } } catch (error) { console.error('Error:', error); } }

let currentCategories = [];
async function loadCategories() {
    try {
        const response = await fetch('/api/catalog/categories');
        const data = await response.json();
        currentCategories = data.categories || [];
        renderAdminCategories();
        const tabsContainer = document.getElementById('category-tabs'); 
        if (tabsContainer) { 
            tabsContainer.innerHTML = `<button class="btn-category" onclick="filterCategory('TOP', this)" style="border-color: #e74c3c; color: #e74c3c;">⭐ </button>`;
            tabsContainer.innerHTML += `<button class="btn-category active" onclick="filterCategory('ALL', this)">Todo</button>`; 
            data.categories.forEach(cat => tabsContainer.innerHTML += `<button class="btn-category" onclick="filterCategory('${escapeHtml(cat.name)}', this)">${escapeHtml(cat.name)}</button>`); 
        } 
        const selectCategory = document.getElementById('new-category'); 
        if (selectCategory) { 
            selectCategory.innerHTML = `<option value="">Selecciona Categoría</option>`; 
            data.categories.forEach(cat => selectCategory.innerHTML += `<option value="${escapeHtml(cat.name)}">${escapeHtml(cat.name)}</option>`); 
        } 
    } catch (error) { console.error('Error:', error); } 
}

function renderAdminCategories() {
    const list = document.getElementById('admin-categories-list');
    if (!list) return;
    const last = currentCategories.length - 1;
    list.innerHTML = currentCategories.map((c, i) => `
        <div class="admin-cat-row">
            <span class="admin-cat-name">${escapeHtml(c.name)}<span class="admin-cat-count">${c.product_count} platillo${c.product_count === 1 ? '' : 's'}</span></span>
            <button title="Subir" onclick="moveCategory(${i}, -1)" ${i === 0 ? 'disabled' : ''}>▲</button>
            <button title="Bajar" onclick="moveCategory(${i}, 1)" ${i === last ? 'disabled' : ''}>▼</button>
            <button title="Renombrar" onclick="renameCategory(${c.id})">✏️</button>
            <button title="Eliminar" class="cat-del" onclick="deleteCategory(${c.id})">✕</button>
        </div>`).join('') || '<p class="admin-hint">Aún no hay categorías.</p>';
}

window.moveCategory = async function(index, dir) {
    const target = index + dir;
    if (target < 0 || target >= currentCategories.length) return;
    const ids = currentCategories.map(c => c.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try {
        const response = await fetch('/api/catalog/categories/order', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
        if (!response.ok) await customAlert('No se pudo cambiar el orden', 'error');
        loadCategories();
    } catch (e) { await customAlert('Error de red al ordenar categorías', 'error'); }
};

window.renameCategory = async function(id) {
    const c = currentCategories.find(x => x.id === id);
    if (!c) return;
    const name = await customPrompt(`Nuevo nombre para ${c.name}. Sus ${c.product_count} platillo(s) se moverán solos.`, 'text', c.name, 'Renombrar categoría');
    if (!name || !name.trim() || name.trim() === c.name) return;
    try {
        const response = await fetch(`/api/catalog/categories/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            await customAlert(err.error || 'Error al renombrar', 'error');
        }
        loadCategories(); loadProducts(); loadAdminProducts();
    } catch (e) { await customAlert('Error de red al renombrar categoría', 'error'); }
};

window.deleteCategory = async function(id) {
    const c = currentCategories.find(x => x.id === id);
    if (!c) return;
    if (c.product_count > 0) {
        await customAlert(`${c.name} tiene ${c.product_count} platillo(s). Cámbialos de categoría con "Editar" o bórralos primero.`, 'warning');
        return;
    }
    if (!(await customConfirm(`¿Eliminar la categoría ${c.name}?`))) return;
    try {
        const response = await fetch(`/api/catalog/categories/${id}`, { method: 'DELETE' });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            await customAlert(err.error || 'Error al eliminar', 'error');
        }
        loadCategories();
    } catch (e) { await customAlert('Error de red al eliminar categoría', 'error'); }
};

function displayProducts(productsToDisplay) { 
    menuGrid.innerHTML = ''; 
    productsToDisplay.forEach(product => { 
        const btn = document.createElement('button'); 
        btn.className = 'btn-product'; 
        
        if (product.station === 'COCINA') {
            btn.style.boxShadow = 'inset 0 4px 0 rgba(211, 84, 0, 0.8)'; /* Brillo superior Naranja */
        } else if (product.station === 'BARRA') {
            btn.style.boxShadow = 'inset 0 4px 0 rgba(52, 152, 219, 0.8)'; /* Brillo superior Azul */
        }

        const isAvailable = product.is_available !== 0; 
        if (!isAvailable) {
            btn.style.background = 'rgba(20, 20, 20, 0.8)'; 
            btn.style.color = '#7f8c8d'; 
            btn.style.cursor = 'not-allowed';
            btn.style.boxShadow = 'inset 0 4px 0 rgba(34, 34, 34, 0.8)'; /* Borde gris apagado */
            btn.innerHTML = `<span style="text-decoration: line-through;">${escapeHtml(product.name)}</span><br><span style="color: #e74c3c; font-weight: bold; font-size: 11px;">🚫 AGOTADO</span>`;
            btn.onclick = () => customAlert('Este platillo está marcado como AGOTADO.', 'warning');
        } else {
            btn.textContent = `${escapeHtml(product.name)} - $${product.price}`; 
            btn.onclick = () => addToOrder(product); 
        }
        menuGrid.appendChild(btn); 
    }); 
}

function filterCategory(category, btnElement) { 
    document.querySelectorAll('#category-tabs button').forEach(tab => tab.classList.remove('active')); 
    if(btnElement) btnElement.classList.add('active'); 
    
    const searchInput = document.getElementById('search-product');
    if (searchInput) searchInput.value = '';

    if (category === 'ALL') {
        displayProducts(allProducts); 
    } else if (category === 'TOP') {
        const sortedTop = [...allProducts].sort((a, b) => (productClicks[b.id] || 0) - (productClicks[a.id] || 0)).slice(0, 8);
        displayProducts(sortedTop);
    } else { 
        displayProducts(allProducts.filter(p => p.category === category)); 
    } 
}

// ========================================================
// SISTEMA DE PESTAÑAS PARA MESAS (Comedor vs Mostrador)
// ========================================================
let currentTableTab = 'COMEDOR';

window.switchTableTab = function(tabName) {
    currentTableTab = tabName;
    loadTables();
};

async function loadTables() {
    try {
        const response = await fetch('/api/catalog/tables'); 
        const data = await response.json(); 
        
        tablesGrid.innerHTML = `
            <div class="table-tabs-container">
                <button onclick="switchTableTab('COMEDOR')" class="table-tab-btn ${currentTableTab === 'COMEDOR' ? 'active' : ''}">🍽️ COMEDOR</button>
                <button onclick="switchTableTab('LLEVAR')" class="table-tab-btn ${currentTableTab === 'LLEVAR' ? 'active-llevar' : ''}">🛍️ LLEVAR</button>
            </div>
            
            <div id="grid-comedor" style="display: ${currentTableTab === 'COMEDOR' ? 'flex' : 'none'}; flex-direction: column; gap: 10px; width: 100%;"></div>
            <div id="grid-llevar" style="display: ${currentTableTab === 'LLEVAR' ? 'flex' : 'none'}; flex-direction: column; gap: 10px; width: 100%;"></div>
        `;
        
        const gridComedor = document.getElementById('grid-comedor');
        const gridLlevar = document.getElementById('grid-llevar');

        let tablesList = data.tables || [];
        if (filterOnlyMyTables) {
            const currentMyWaiter = (getDeviceWaiter() || '').toLowerCase().trim();
            if (currentMyWaiter) {
                tablesList = tablesList.filter(t => {
                    if (t.status === 'LIBRE') return true;
                    return t.waiter_name && t.waiter_name.toLowerCase().trim() === currentMyWaiter;
                });
            }
        }

        tablesList.forEach(table => {
            const esLlevar = table.table_number.toUpperCase().includes('LLEVAR');
            const btn = document.createElement('button'); 
            btn.className = `btn-table ${table.status === 'OCUPADA' ? 'ocupada' : ''}`;
            
            // Forzamos el botón a ocupar el 100% de la columna angosta
            btn.style.width = '100%';
            btn.style.minHeight = '75px';
            btn.style.margin = '0';
            btn.style.padding = '8px';
            btn.style.display = 'flex';
            btn.style.flexDirection = 'column';
            btn.style.justifyContent = 'center';
            btn.style.alignItems = 'center';

            if (esLlevar) {
                btn.style.border = '2px dashed #9b59b6';
                if (table.status === 'OCUPADA') btn.style.background = 'linear-gradient(145deg, #2c3e50, #8e44ad)';
            }

            let displayTotal = table.current_total || 0; 
            if (table.remaining_balance !== null && table.remaining_balance !== undefined) { displayTotal = table.remaining_balance; }
            
            // CREACIÓN DE TIPOGRAFÍA DE ALTO CONTRASTE
            const textoMesa = `<span style="font-weight:300; font-size: 11px; letter-spacing: 2px; color: #7f8c8d;">MESA</span><br><span style="font-weight:900; font-size: 24px; line-height: 1.1; color: #fff;">${escapeHtml(table.table_number)}</span>`;

            const draftBadge = table.has_draft
                ? `<div style="background: #f39c12; color: #1a1a1a; font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 4px; margin-top: 4px; max-width: 95%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">📝 SIN ENVIAR${table.status !== 'OCUPADA' && table.draft_waiter ? ' · ' + escapeHtml(table.draft_waiter) : ''}</div>`
                : '';

            if (table.status === 'OCUPADA') {
                const mins = table.minutes_open || 0; 
                let timeClass = 'time-green';
                let timeIcon = '🟢';
                if (mins > 45) {
                    timeClass = 'time-red';
                    timeIcon = '🔴';
                } else if (mins > 20) {
                    timeClass = 'time-orange';
                    timeIcon = '🟡';
                }
                
                // Etiqueta dinámica de Folio (solo aparece si el backend lo manda)
                const etiquetaFolio = table.active_folio 
                    ? `<div style="background: #e74c3c; color: #fff; font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 4px; margin: 4px 0 0 0;">Folio: ${escapeHtml(table.active_folio_label || '#' + table.active_folio)}</div>` 
                    : '';

                const badgeSemaforo = `<div class="badge-time ${timeClass}"><span>${timeIcon}</span> <span>${mins}m</span></div>`;

                const waiterBadge = table.waiter_name 
                    ? `<div style="font-size: 10px; color: #3498db; font-weight: bold; margin-top: 3px; max-width: 95%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">👤 ${escapeHtml(table.waiter_name)}</div>` 
                    : '';

                if (displayTotal > 0) { 
                    btn.innerHTML = `${textoMesa}${etiquetaFolio}${badgeSemaforo}${waiterBadge}${draftBadge}<span style="font-size: 14px; color: #f1c40f; font-weight: 900; margin-top: 2px;">$${displayTotal.toFixed(2)}</span>`; 
                } else { 
                    btn.innerHTML = `${textoMesa}${etiquetaFolio}${badgeSemaforo}${waiterBadge}${draftBadge}`; 
                }
            } else { 
                btn.innerHTML = `${textoMesa}${draftBadge}`; 
            }
            btn.dataset.id = table.id;
            btn.onclick = () => selectTable(table);
            if (esLlevar) { gridLlevar.appendChild(btn); } else { gridComedor.appendChild(btn); }
        });

        const adminTablesList = document.getElementById('admin-tables-list'); 
        if (adminTablesList) { 
            adminTablesList.innerHTML = ''; 
            data.tables.forEach(table => adminTablesList.innerHTML += `<span style="background: #2c2c2c; padding: 6px 12px; border-radius: 4px; border: 1px solid #444; display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: bold;">🪑 ${escapeHtml(table.table_number)} <button onclick="deleteTable(${table.id})" style="background: #e74c3c; color: white; border: none; border-radius: 3px; padding: 2px 6px; cursor: pointer;">✕</button></span>`); 
        }
    } catch (error) { console.error('Error:', error); }
}

window.deleteTable = async function(id) { 
    if (!(await customConfirm('¿Estás seguro de eliminar esta mesa?', 'Eliminar Mesa'))) return; 
    try {
        const response = await fetch(`/api/catalog/tables/${id}`, { method: 'DELETE' }); 
        if (response.ok) {
            loadTables(); 
        } else { 
            const err = await response.json().catch(() => ({})); 
            await customAlert(`Error: ${err.error || 'No se pudo eliminar la mesa'}`, 'error'); 
        } 
    } catch(e) {
        await customAlert('Error de red al eliminar mesa', 'error');
    }
};
async function loadWaiters() { 
    try { 
        const response = await fetch('/api/catalog/waiters'); 
        const data = await response.json(); 
        if (waiterSelect) { 
            waiterSelect.innerHTML = `<option value="">Seleccione mesero...</option>`; 
            data.waiters.forEach(w => waiterSelect.innerHTML += `<option value="${escapeHtml(w.name)}">${escapeHtml(w.name)}</option>`); 
            const savedDeviceWaiter = getDeviceWaiter() || lastSelectedWaiter;
            if (savedDeviceWaiter) { 
                waiterSelect.value = savedDeviceWaiter; 
                lastSelectedWaiter = savedDeviceWaiter;
            } 
        } 
        updateDeviceWaiterBadge();
        const adminWaitersList = document.getElementById('admin-waiters-list'); 
        if (adminWaitersList) { 
            adminWaitersList.innerHTML = ''; 
            data.waiters.forEach(w => adminWaitersList.innerHTML += `<span style="background: #2c2c2c; padding: 6px 12px; border-radius: 4px; border: 1px solid #444; display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: bold;">👤 ${escapeHtml(w.name)} <button onclick="deleteWaiter(${w.id})" style="background: #e74c3c; color: white; border: none; border-radius: 3px; padding: 2px 6px; cursor: pointer;">✕</button></span>`); 
        } 
    } catch (error) { 
        console.error('Error:', error); 
    } 
}

async function loadProducts() { try { const response = await fetch('/api/catalog/products'); const data = await response.json(); allProducts = data.products; displayProducts(allProducts); } catch (error) { console.error('Error:', error); } }

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

    const itemsToPrint = [...newOrderItems]; const itemsForApi = newOrderItems.map(item => ({ product_id: item.product_id, quantity: item.quantity, notes: item.notes, is_takeaway: item.is_takeaway, station: item.station, extra_price: item.extra_price }));
    await draftQueue;
    try {
        let url = '/api/orders'; let bodyData = { table_id: currentTableId, waiter_name: selectedWaiter, items: itemsForApi, is_printed: shouldPrint, guests: currentPax, device_id: DEVICE_ID }; let orderNum = currentOrderId;
        if (currentOrderId) { url = `/api/orders/${currentOrderId}/items`; bodyData = { items: itemsForApi, is_printed: shouldPrint, device_id: DEVICE_ID }; }
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyData) }); const result = await response.json();
        if (response.ok) { 
            triggerHaptic(60);
            closeMobileSheet();
            if (!orderNum) orderNum = result.orderId; 
            const folioComanda = result.folio || currentFolio || `#${orderNum}`;
            if (shouldPrint) { showComanda(itemsToPrint, folioComanda, currentTableSpan.textContent, selectedWaiter); } 
            else { await customAlert('Adición registrada.', 'success'); } 
            selectTable({ id: currentTableId, table_number: currentTableSpan.textContent, status: 'OCUPADA' }); loadTables(); 
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

function showComanda(items, folio, mesa, mesero) {
    let time = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    
    let encabezadoHTML = mesa.toUpperCase().includes('LLEVAR')
        ? `<div style="background: #000; color: #fff; text-align: center; padding: 6px; font-size: 16px; font-weight: 900; border: 2px dashed #000; margin-bottom: 10px;">¡PEDIDO PARA LLEVAR!</div><div style="display: flex; justify-content: space-between; font-weight: bold;"><span>COMANDA ${escapeHtml(folio)}</span><span>${mesa}</span></div>`
        : `<div style="display: flex; justify-content: space-between; font-weight: bold;"><span>COMANDA ${escapeHtml(folio)}</span><span>MESA ${mesa}</span></div>`;

    const itemsCocina = items.filter(item => item.station === 'COCINA'); const itemsBarra = items.filter(item => item.station === 'BARRA');
    
    // Ajustado al formato estricto de 80mm de tu sistema
    let html = `<div style="width: 100%; max-width: 300px; margin: 0 auto; font-family: 'Courier New', Courier, monospace; color: #000;"><div style="border: 2px dashed #000; padding: 15px;"><p style="text-align: center; font-weight: bold; margin: 0 0 10px 0;">================================</p>${encabezadoHTML}<div style="display: flex; justify-content: space-between; margin-top:5px;"><span>MESERO: ${mesero.toUpperCase()}</span><span>${time}</span></div><p style="text-align: center; margin: 10px 0;">--------------------------------</p>`;
    
    if (itemsCocina.length > 0) { html += `<p style="font-weight: bold; text-decoration: underline; font-size: 16px; margin: 10px 0 5px 0;">COCINA</p>`; itemsCocina.forEach(item => { const takeaway = item.is_takeaway ? ' (LLEVAR)' : ''; html += `<p style="margin: 3px 0; font-weight: bold; font-size: 14px;">${item.quantity}x ${item.name.toUpperCase()}${takeaway}</p>`; if (item.notes) { html += `<p style="margin: 0 0 5px 20px; font-style: italic; font-size: 12px;">- ${item.notes.toUpperCase()}</p>`; } }); }
    if (itemsBarra.length > 0) { html += `<p style="font-weight: bold; text-decoration: underline; font-size: 16px; margin: 15px 0 5px 0;">BARRA</p>`; itemsBarra.forEach(item => { const takeaway = item.is_takeaway ? ' (LLEVAR)' : ''; html += `<p style="margin: 3px 0; font-weight: bold; font-size: 14px;">${item.quantity}x ${item.name.toUpperCase()}${takeaway}</p>`; if (item.notes) { html += `<p style="margin: 0 0 5px 20px; font-style: italic; font-size: 12px;">- ${item.notes.toUpperCase()}</p>`; } }); }
    html += `<p style="text-align: center; font-weight: bold; margin: 10px 0 0 0;">================================</p></div></div>`;
    
    // Usamos tu contenedor central para imprimir
    document.getElementById('ticket-content').innerHTML = html;
    isReprinting = true; 
    
    // Disparamos la impresión silenciosa directo a la Epson
    setTimeout(() => {
        printTicket(); 
        customAlert('Comanda enviada a cocina', 'success', '¡Listo!');
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

const pinForm = document.getElementById('pin-form');
if (pinForm) { pinForm.onsubmit = async (e) => { e.preventDefault(); const currentPin = document.getElementById('current-pin').value; const newPin = document.getElementById('new-pin').value; try { const response = await fetch('/api/catalog/settings/pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current_pin: currentPin, new_pin: newPin }) }); const result = await response.json(); if (response.ok) { await customAlert('PIN actualizado con éxito.', 'success'); pinForm.reset(); } else { await customAlert(`Error: ${result.error}`, 'error'); } } catch (err) { await customAlert('Fallo de red.', 'error'); } }; }

const btnBackupDb = document.getElementById('btn-backup-dashboard');
if (btnBackupDb) {
    btnBackupDb.onclick = async () => {
        const pin = await customPrompt('Por su seguridad, reingrese el PIN de Administrador para descargar:', 'password'); 
        if (!pin) return;
        if (!navigator.onLine) { await customAlert('No hay red.', 'error'); return; }
        try { const response = await fetch('/api/reports/backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) }); if (response.ok) { const blob = await response.blob(); const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `Respaldo_Estampida_${obtenerFechaLocal()}.db`; document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url); await customAlert('Respaldo descargado con éxito.', 'success'); } else { const errorText = await response.text(); let errorMessage = 'Error desconocido'; try { errorMessage = JSON.parse(errorText).error; } catch(e) { errorMessage = 'La ruta no fue encontrada.'; } await customAlert(`Error: ${errorMessage}`, 'error'); } } catch (e) { await customAlert(`Servidor desconectado.`, 'error'); }
    };
}

let adminProductsList = [];

async function loadAdminProducts() { 
    const tbody = document.getElementById('admin-products-tbody'); 
    if (!tbody) return; 
    try {
        const response = await fetch('/api/catalog/products'); 
        const data = await response.json(); 
        adminProductsList = data.products || [];
        tbody.innerHTML = ''; 
        adminProductsList.forEach(p => { 
            const isAvailable = p.is_available !== 0;
            const statusBtn = isAvailable 
                ? `<button onclick="toggleProductStatus(${p.id}, 0)" style="background:#27ae60; color:white; border:none; padding:6px 10px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:bold;">🟢 Disponible</button>`
                : `<button onclick="toggleProductStatus(${p.id}, 1)" style="background:#c0392b; color:white; border:none; padding:6px 10px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:bold;">🔴 Agotado</button>`;

            tbody.innerHTML += `<tr><td>${escapeHtml(p.name)}</td><td>$${p.price.toFixed(2)}</td><td>${escapeHtml(p.station)}</td><td>${escapeHtml(p.category)}</td><td style="text-align: center;">${statusBtn}</td><td><button onclick="editProduct(${p.id})" class="btn-secondary" style="background-color: #f39c12; color: #1a1a1a; font-weight: 800; padding: 4px 10px; border: none;">Editar</button> <button onclick="deleteProduct(${p.id})" class="btn-secondary" style="background-color: #e74c3c; padding: 4px; border: none; color: white;">X</button></td></tr>`; 
        }); 
    } catch(err) {
        console.error('Error al cargar productos de admin:', err);
    }
}

window.toggleProductStatus = async function(id, newStatus) { 
    try { 
        await fetch(`/api/catalog/products/${id}/toggle`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_available: newStatus }) }); 
        loadAdminProducts(); 
        loadProducts(); 
    } catch(e) { 
        console.error(e); 
    } 
};

const modifierForm = document.getElementById('modifier-form'); 
if (modifierForm) modifierForm.onsubmit = async (e) => { 
    e.preventDefault(); 
    const name = document.getElementById('new-modifier-name').value.trim();
    const priceVal = document.getElementById('new-modifier-price').value; 
    try {
        const response = await fetch('/api/catalog/modifiers', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ name, price: priceVal ? parseFloat(priceVal) : 0 }) 
        }); 
        if (response.ok) {
            document.getElementById('new-modifier-name').value = ''; 
            document.getElementById('new-modifier-price').value = ''; 
            loadModifiers(); 
        } else {
            const err = await response.json().catch(() => ({}));
            await customAlert(err.error || 'Error al guardar modificador', 'error');
        }
    } catch(e) {
        await customAlert('Error de red al guardar modificador', 'error');
    }
};

window.deleteModifier = async function(id) { 
    if (!(await customConfirm('¿Eliminar modificador?'))) return; 
    try {
        const response = await fetch(`/api/catalog/modifiers/${id}`, { method: 'DELETE' }); 
        if (response.ok) {
            loadModifiers(); 
        } else {
            const err = await response.json().catch(() => ({}));
            await customAlert(err.error || 'Error al eliminar', 'error');
        }
    } catch(e) {
        await customAlert('Error de red al eliminar', 'error');
    }
};

const categoryForm = document.getElementById('category-form');
if (categoryForm) categoryForm.onsubmit = async (e) => { 
    e.preventDefault(); 
    const name = document.getElementById('new-category-name').value.trim();
    try {
        const response = await fetch('/api/catalog/categories', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ name }) 
        }); 
        if (response.ok) {
            document.getElementById('new-category-name').value = ''; 
            loadCategories(); 
        } else {
            const err = await response.json().catch(() => ({}));
            await customAlert(err.error || 'Error al crear categoría', 'error');
        }
    } catch(e) {
        await customAlert('Error de red al crear categoría', 'error');
    }
};

const waiterForm = document.getElementById('waiter-form');
if (waiterForm) waiterForm.onsubmit = async (e) => { 
    e.preventDefault(); 
    const name = document.getElementById('new-waiter-name').value.trim();
    try {
        const response = await fetch('/api/catalog/waiters', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ name }) 
        }); 
        if (response.ok) {
            document.getElementById('new-waiter-name').value = ''; 
            loadWaiters(); 
        } else {
            const err = await response.json().catch(() => ({}));
            await customAlert(err.error || 'Error al crear mesero', 'error');
        }
    } catch(e) {
        await customAlert('Error de red al crear mesero', 'error');
    }
};

window.deleteWaiter = async function(id) { 
    if (!(await customConfirm('¿Eliminar mesero?'))) return; 
    try {
        const response = await fetch(`/api/catalog/waiters/${id}`, { method: 'DELETE' }); 
        if (response.ok) {
            loadWaiters(); 
        } else {
            const err = await response.json().catch(() => ({}));
            await customAlert(err.error || 'Error al eliminar mesero', 'error');
        }
    } catch(e) {
        await customAlert('Error de red al eliminar mesero', 'error');
    }
};

const tableForm = document.getElementById('table-form');
if (tableForm) tableForm.onsubmit = async (e) => { 
    e.preventDefault(); 
    const table_number = document.getElementById('new-table-number').value.trim();
    try {
        const response = await fetch('/api/catalog/tables', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ table_number }) 
        }); 
        if (response.ok) {
            document.getElementById('new-table-number').value = ''; 
            loadTables(); 
        } else {
            const err = await response.json().catch(() => ({}));
            await customAlert(err.error || 'Error al crear mesa', 'error');
        }
    } catch(e) {
        await customAlert('Error de red al crear mesa', 'error');
    }
};

const productForm = document.getElementById('product-form');
if (productForm) productForm.onsubmit = async (e) => { 
    e.preventDefault(); 
    const name = document.getElementById('new-name').value.trim();
    const price = parseFloat(document.getElementById('new-price').value);
    const station = document.getElementById('new-station').value;
    const category = document.getElementById('new-category').value;
    try {
        const response = await fetch('/api/catalog/products', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ name, price, station, category }) 
        }); 
        if (response.ok) {
            productForm.reset(); 
            loadAdminProducts(); 
            loadProducts(); loadCategories(); 
        } else {
            const err = await response.json().catch(() => ({}));
            await customAlert(err.error || 'Error al crear producto', 'error');
        }
    } catch(e) {
        await customAlert('Error de red al crear producto', 'error');
    }
};

window.deleteProduct = async function(id) { 
    if (!(await customConfirm('¿Estás seguro de eliminar este platillo?'))) return; 
    try {
        const response = await fetch(`/api/catalog/products/${id}`, { method: 'DELETE' }); 
        if (response.ok) {
            loadAdminProducts(); 
            loadProducts(); 
        } else {
            const err = await response.json().catch(() => ({}));
            await customAlert(err.error || 'Error al eliminar', 'error');
        }
    } catch(e) {
        await customAlert('Error de red al eliminar platillo', 'error');
    }
};

window.editProduct = async function(id) { 
    const p = adminProductsList.find(item => item.id === id);
    if (!p) return;
    const newName = await customPrompt("Nuevo nombre:", "text", p.name); 
    if (!newName) return; 
    await new Promise(resolve => setTimeout(resolve, 250)); 
    const newPrice = await customPrompt("Nuevo precio:", "number", p.price);
    if (!newPrice || isNaN(parseFloat(newPrice))) return;
    await new Promise(resolve => setTimeout(resolve, 250));
    const newCategory = await customSelect("Categoría:", currentCategories.map(c => c.name), p.category, 'Categoría del platillo');
    if (!newCategory) return; 
    try {
        const response = await fetch(`/api/catalog/products/${id}`, { 
            method: 'PUT', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ name: newName.trim(), price: parseFloat(newPrice), station: p.station, category: newCategory }) 
        }); 
        if (response.ok) {
            loadAdminProducts();
            loadProducts();
            loadCategories();
        } else {
            const err = await response.json().catch(() => ({}));
            await customAlert(err.error || 'Error al actualizar', 'error');
        }
    } catch(e) {
        await customAlert('Error de red al actualizar platillo', 'error');
    }
};

const corteDatePicker = document.getElementById('corte-date-picker');
const corteTitleDisplay = document.getElementById('corte-title-display');
if (corteDatePicker) { corteDatePicker.addEventListener('change', () => { loadCorteData(); }); }

const auditDatePicker = document.getElementById('audit-date-picker');
if (auditDatePicker) { auditDatePicker.addEventListener('change', () => { loadFullAuditLogs(); }); }

const btnPrintCorte = document.getElementById('btn-print-corte');
if (btnPrintCorte) {
    btnPrintCorte.onclick = async () => {
        if (!(await customConfirm('¿Deseas enviar este Corte a la impresora térmica?', 'Imprimir Corte'))) return;
        try { 
            const dateVal = corteDatePicker.value || obtenerFechaLocal(); 
            const response = await fetch(`/api/reports/corte/print?date=${dateVal}`, { method: 'POST' }); 
            
            if (response.ok) { 
                await customAlert('Corte enviado a la impresora.', 'success'); 
            } else { 
                const errText = await response.text();
                let errorMessage = 'Error al intentar imprimir el corte.';
                try { errorMessage = JSON.parse(errText).error; } catch(e) {}
                
                await customAlert(errorMessage, 'error', 'BLOQUEO DE SISTEMA'); 
            } 
        } catch(e) { 
            await customAlert('Fallo de red al conectar con la impresora.', 'error'); 
        }
    };
}

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
                    <td>${o.payment_method}</td>
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

const socket = io();
socket.on('update-tables', () => { 
    if(adminHubView.style.display !== 'none' && navigator.onLine) loadDashboard();
    if(posView.style.display !== 'none' && navigator.onLine) loadTables(); 
    if(corteView.style.display !== 'none') loadCorteData(); 
});
socket.on('update-products', () => {
    if(posView.style.display !== 'none' && navigator.onLine) { loadProducts(); loadCategories(); }
});
// Otro dispositivo cambió el borrador de una mesa: si la tengo abierta, muestro lo mismo.
socket.on('draft-updated', (data) => {
    if (!data || data.device_id === DEVICE_ID) return;
    if (!currentTableId || Number(data.table_id) !== Number(currentTableId) || draftTableId !== currentTableId) return;
    if (data.sent) {
        // La comanda ya se envió desde otro dispositivo: recargar la cuenta de la mesa
        selectTable({ id: currentTableId, table_number: currentTableSpan.textContent, status: 'OCUPADA' });
        return;
    }
    if (noteModal.style.display === 'flex') noteModal.style.display = 'none';
    newOrderItems = data.items || [];
    draftSynced = serializeDraft(newOrderItems);
    updateOrderUI();
});

function playServiceBell() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(987.77, audioCtx.currentTime); 
        gainNode.gain.setValueAtTime(0.8, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.5);
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 1.5);
    } catch (e) {
        console.log("El dispositivo actual no soporta audio en el navegador.");
    }
}

window.calculateTip = function(percentage) {
    let amountBase = currentRemainingBalance > 0 ? currentRemainingBalance : parseFloat(orderTotalSpan.textContent);
    let tip = amountBase * percentage;
    document.getElementById('tip-amount').value = tip.toFixed(2);
};

socket.on('receive-instruction', (data) => {
    if (data.clear) {
        delete tableInstructions[data.tableId];
    } else {
        tableInstructions[data.tableId] = data;
        if (isAdminSessionActive) playServiceBell();
    }
    if (currentTableId === data.tableId) updateOrderUI();
});

let unprintedConsumoItems = [];

const btnPrintAccount = document.getElementById('btn-print-account');
if (btnPrintAccount) {
    btnPrintAccount.onclick = () => {
        document.getElementById('pre-require-invoice').checked = false;
        document.getElementById('print-options-modal').style.display = 'flex';
    };
}

window.executePrint = async function(type) {
    const wantsInvoice = document.getElementById('pre-require-invoice').checked;
    document.getElementById('print-options-modal').style.display = 'none';

    let instruction = '';

    if (type === 'completa') {
        instruction = 'Cuenta Completa';
        showStandardPreCheck(wantsInvoice);
    } 
    else if (type === 'iguales') {
        const personasStr = await customPrompt('¿Entre cuántas personas se va a dividir?', 'number', '2');
        if (!personasStr) return;
        const personas = parseInt(personasStr);
        if (personas <= 0) return;
        instruction = `Dividido en ${personas} partes iguales`;
        showDividedPreCheck(personas, wantsInvoice);
    } 
    else if (type === 'consumo') {
        instruction = 'Dividido por consumo';
        unprintedConsumoItems = [];
        savedOrderItems.forEach(item => {
            for(let i = 0; i < item.quantity; i++) {
                unprintedConsumoItems.push({...item, quantity: 1});
            }
        });
        openPrintConsumoModal();
    }

    socket.emit('payment-instruction', { tableId: currentTableId, instruction: instruction, invoice: wantsInvoice });
    tableInstructions[currentTableId] = { tableId: currentTableId, instruction: instruction, invoice: wantsInvoice };
    updateOrderUI();
};

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

window.generarPDFEjecutivo = async function() {
    const dateVal = document.getElementById('corte-date-picker').value || obtenerFechaLocal();
    
    try {
        const resFondo = await fetch(`/api/reports/fondo?date=${dateVal}`);
        const dataFondo = await resFondo.json();
        const fondoAmount = dataFondo.fondo || 0;

        const response = await fetch(`/api/reports/corte?date=${dateVal}`);
        const data = await response.json();
        
        if (!response.ok) {
            const err = await response.text();
            let msg = 'Error'; try { msg = JSON.parse(err).error; } catch(e){}
            await customAlert(msg, 'error', 'BLOQUEO DE CORTE');
            return;
        }

        const sum = data.summary;
        const totalGastos = sum.total_gastos || 0;
        const efectivoEsperado = calcularEfectivoEsperado(fondoAmount, sum);

        // 1. Fechas y Globales
        document.getElementById('pdf-fecha').textContent = dateVal;
        document.getElementById('pdf-hora').textContent = new Date().toLocaleString('es-MX');
        
        document.getElementById('pdf-total').textContent = sum.total_general.toFixed(2);
        document.getElementById('pdf-tickets').textContent = sum.num_tickets;
        const ticketPromedio = sum.num_tickets > 0 ? (sum.total_general / sum.num_tickets) : 0;
        document.getElementById('pdf-ticket-promedio').textContent = ticketPromedio.toFixed(2);

        // 2. Desglose de Métodos y Servicios
        document.getElementById('pdf-efectivo').textContent = sum.total_efectivo.toFixed(2);
        document.getElementById('pdf-tarjeta').textContent = sum.total_tarjeta.toFixed(2);
        document.getElementById('pdf-comedor').textContent = (sum.total_comedor || 0).toFixed(2);
        document.getElementById('pdf-llevar').textContent = (sum.total_llevar || 0).toFixed(2);

        // 3. Flujo de Caja Matemática
        document.getElementById('pdf-fondo').textContent = fondoAmount.toFixed(2);
        document.getElementById('pdf-efectivo-flujo').textContent = sum.total_efectivo.toFixed(2);
        document.getElementById('pdf-gastos').textContent = totalGastos.toFixed(2);
        document.getElementById('pdf-propina-tarj').textContent = sum.propinas_tarjeta.toFixed(2);
        document.getElementById('pdf-esperado').textContent = efectivoEsperado.toFixed(2);

        // 4. Tablas (Meseros y Gastos)
        const tbodyMeseros = document.getElementById('pdf-meseros-tbody');
        tbodyMeseros.innerHTML = '';
        if (Object.keys(sum.ventas_por_mesero).length === 0) {
            tbodyMeseros.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 10px;">Sin ventas</td></tr>';
        } else {
            for (const [waiter, info] of Object.entries(sum.ventas_por_mesero)) {
                tbodyMeseros.innerHTML += `
                    <tr>
                        <td style="padding: 5px; border: 1px solid #ddd; font-weight: bold;">${waiter}</td>
                        <td style="padding: 5px; border: 1px solid #ddd; text-align: center;">${info.tickets}</td>
                        <td style="padding: 5px; border: 1px solid #ddd; text-align: right; color: #27ae60;">$${info.total.toFixed(2)}</td>
                    </tr>`;
            }
        }

        const tbodyGastos = document.getElementById('pdf-gastos-tbody');
        tbodyGastos.innerHTML = '';
        if (!sum.desglose_gastos || sum.desglose_gastos.length === 0) {
            tbodyGastos.innerHTML = '<tr><td colspan="2" style="text-align: center; padding: 10px; color: #777;">Sin gastos registrados</td></tr>';
        } else {
            sum.desglose_gastos.forEach(gasto => {
                tbodyGastos.innerHTML += `
                    <tr>
                        <td style="padding: 5px; border: 1px solid #ddd; font-weight: bold; color: #333;">${gasto.concept.toUpperCase()} <span style="font-weight:normal; color:#777; font-size:10px;">(${gasto.category})</span></td>
                        <td style="padding: 5px; border: 1px solid #ddd; text-align: right; color: #e74c3c; font-weight: bold;">-$${gasto.amount.toFixed(2)}</td>
                    </tr>`;
            });
        }

        // 5. Mostrar, Imprimir y Ocultar
        const pdfContainer = document.getElementById('pdf-report-container');
        pdfContainer.style.display = 'block';
        window.print();
        pdfContainer.style.display = 'none';
        
    } catch (e) {
        await customAlert('Fallo al generar el documento.', 'error');
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
socket.on('ejecutar-impresion-pc', (htmlRemoto) => {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
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
        document.getElementById('ticket-content').innerHTML = tempDiv.innerHTML;
        printTicket(); // Llama a imprimir localmente en la caja
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