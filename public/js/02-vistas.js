// Navegación entre pantallas, referencias del DOM y borradores de orden.
// Scripts clásicos que comparten el ámbito global; se cargan en orden desde index.html.
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

