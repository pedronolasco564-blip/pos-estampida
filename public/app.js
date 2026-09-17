// Función global BLINDADA para obtener la fecha local exacta de Tuxtepec
function obtenerFechaLocal() {
    const fechaMexico = new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" });
    const d = new Date(fechaMexico);
    
    const anio = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    
    return `${anio}-${mes}-${dia}`;
}

let modalCloseTimeout; 
function showCustomModal({ type = 'info', title = 'Atención', text = '', showInput = false, inputType = 'text', inputValue = '', showCancel = false }) {
    return new Promise((resolve) => {
        clearTimeout(modalCloseTimeout); 
        const overlay = document.getElementById('custom-alert-overlay'); const box = document.getElementById('custom-alert-box'); const icon = document.getElementById('custom-alert-icon'); const titleEl = document.getElementById('custom-alert-title'); const textEl = document.getElementById('custom-alert-text'); const inputEl = document.getElementById('custom-alert-input'); const btnOk = document.getElementById('custom-alert-ok'); const btnCancel = document.getElementById('custom-alert-cancel');
        const typeStyles = { 'success': { icon: '✅', color: '#27ae60' }, 'error': { icon: '❌', color: '#e74c3c' }, 'warning': { icon: '⚠️', color: '#f39c12' }, 'info': { icon: '💡', color: '#3498db' } };
        icon.textContent = typeStyles[type].icon; btnOk.style.backgroundColor = typeStyles[type].color; titleEl.textContent = title; textEl.innerHTML = text;
        if (showInput) { inputEl.type = inputType; inputEl.value = inputValue; inputEl.style.display = 'block'; setTimeout(() => inputEl.focus(), 100); } else { inputEl.style.display = 'none'; }
        btnCancel.style.display = showCancel ? 'block' : 'none'; overlay.style.display = 'flex';
        setTimeout(() => { overlay.style.opacity = '1'; box.style.transform = 'scale(1)'; }, 10);
        const closeModal = (result) => { overlay.style.opacity = '0'; box.style.transform = 'scale(0.9)'; modalCloseTimeout = setTimeout(() => { overlay.style.display = 'none'; }, 200); btnOk.onclick = null; btnCancel.onclick = null; inputEl.onkeypress = null; resolve(result); };
        btnOk.onclick = () => closeModal(showInput ? inputEl.value : true); btnCancel.onclick = () => closeModal(showInput ? null : false);
        if (showInput) { inputEl.onkeypress = (e) => { if (e.key === 'Enter') btnOk.click(); }; }
    });
}
const customAlert = (text, type = 'info', title = 'Atención') => showCustomModal({ type, title, text });
const customConfirm = (text, title = 'Confirmar') => showCustomModal({ type: 'warning', title, text, showCancel: true });
const customPrompt = (text, inputType = 'text', inputValue = '', title = 'Entrada requerida') => showCustomModal({ type: 'info', title, text, showInput: true, inputType, inputValue, showCancel: true });

let isAdminSessionActive = localStorage.getItem('isAdminSessionActive') === 'true';
let currentViewId = localStorage.getItem('currentViewId') || 'welcome-view';

const welcomeView = document.getElementById('welcome-view');
const mainHeader = document.getElementById('main-header');
const posView = document.getElementById('pos-view'); 
const adminHubView = document.getElementById('admin-hub-view');
const adminView = document.getElementById('admin-view'); 
const corteView = document.getElementById('corte-view'); 
const auditView = document.getElementById('audit-view');

// ========================================================
// NAVEGACIÓN Y UX (Transiciones Suaves y Botón Atrás)
// ========================================================
window.addEventListener('popstate', (e) => {
    if (e.state && e.state.view) { setView(e.state.view, false); }
});

function setView(viewId, pushHistory = true) {
    if(welcomeView) welcomeView.style.display = 'none';
    if(posView) posView.style.display = 'none';
    if(adminHubView) adminHubView.style.display = 'none';
    if(corteView) corteView.style.display = 'none';
    if(adminView) adminView.style.display = 'none';
    if(auditView) auditView.style.display = 'none';
    
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

    if (pushHistory) {
        window.history.pushState({ view: viewId }, '', `#${viewId}`);
    }
}

let currentTableId = null; let currentOrderId = null; let savedOrderItems = []; let newOrderItems = []; let allProducts = []; let lastSelectedWaiter = ''; let currentModifiers = []; let currentRemainingBalance = 0; let selectedItemsToPay = []; let lastPaymentFullyPaid = false; let pendingCancelType = null; let pendingCancelItemId = null; let isReprinting = false; let productClicks = {};
let desgloseGastosActual = [];

let tableInstructions = {};

const tablesGrid = document.getElementById('tables-grid'); const menuGrid = document.getElementById('menu-grid'); const currentTableSpan = document.getElementById('current-table'); const orderItemsList = document.getElementById('order-items'); const orderTotalSpan = document.getElementById('order-total');
const btnSendPrint = document.getElementById('btn-send-print'); const btnSendSave = document.getElementById('btn-send-save'); const actionButtonsContainer = document.getElementById('action-buttons-container');
const btnPayOrder = document.getElementById('btn-pay-order'); const btnCancelOrder = document.getElementById('btn-cancel-order'); const btnDeselectTable = document.getElementById('btn-deselect-table'); const btnTransferTable = document.getElementById('btn-transfer-table'); 
const paymentPanel = document.getElementById('payment-panel'); const inputAmountPaid = document.getElementById('amount-paid'); const waiterSelect = document.getElementById('waiter-select');
const noteModal = document.getElementById('note-modal'); const modalNoteInput = document.getElementById('modal-note-input'); const noteModalTitle = document.getElementById('note-modal-title'); const quickModifiersGrid = document.getElementById('quick-modifiers-grid');
let editingItemIndex = null; 

const statusBar = document.getElementById('status-bar');
function updateNetworkStatus() { if (navigator.onLine) { statusBar.innerHTML = '🟢 Conectado'; statusBar.style.color = '#2ecc71'; statusBar.style.fontWeight = 'bold'; } else { statusBar.innerHTML = '🔴 Sin Red'; statusBar.style.color = '#e74c3c'; statusBar.style.fontWeight = 'bold'; } }
window.addEventListener('online', updateNetworkStatus); window.addEventListener('offline', updateNetworkStatus);

const btnMasterAdmin = document.getElementById('btn-master-admin');

document.addEventListener('DOMContentLoaded', () => {
    updateNetworkStatus(); 
    loadTables(); loadCategories(); loadProducts(); loadWaiters(); loadModifiers();
    if (waiterSelect) waiterSelect.addEventListener('change', (e) => lastSelectedWaiter = e.target.value);
    if (btnDeselectTable) {
        btnDeselectTable.onclick = async () => {
            if (newOrderItems.length > 0) {
                if (!(await customConfirm('Tienes platillos sin enviar a cocina. ¿Seguro que quieres salir y descartarlos?', '¡Atención!'))) return;
            }
            clearTableSelection();
        };
    }
    document.getElementById('btn-save-note').onclick = () => { if (editingItemIndex !== null) { newOrderItems[editingItemIndex].notes = modalNoteInput.value.trim(); updateOrderUI(); } noteModal.style.display = 'none'; };
    document.getElementById('btn-cancel-note').onclick = () => noteModal.style.display = 'none';
    document.getElementById('btn-clear-note').onclick = () => { modalNoteInput.value = ''; if (editingItemIndex !== null) { newOrderItems[editingItemIndex].extra_price = 0; newOrderItems[editingItemIndex].notes = ''; } };

    if (isAdminSessionActive && btnMasterAdmin) { btnMasterAdmin.innerHTML = '👑 Volver al Panel (Desbloqueado)'; btnMasterAdmin.style.backgroundColor = '#d35400'; }
    setView(currentViewId);
    if(currentViewId === 'corte-view') loadCorteData();
    if(currentViewId === 'admin-view') { loadAdminProducts(); loadWaiters(); loadModifiers(); }
    if(currentViewId === 'audit-view') loadFullAuditLogs();
});

const loginModal = document.getElementById('login-modal'); const loginPinInput = document.getElementById('login-pin-input'); const loginErrorMsg = document.getElementById('login-error-msg'); 

window.enterAsWaiter = function() { setView('pos-view'); loadTables(); };
window.enterAsAdmin = function() { loginPinInput.value = ''; loginErrorMsg.style.display = 'none'; loginModal.style.display = 'flex'; setTimeout(() => loginPinInput.focus(), 100); };
if(btnMasterAdmin) { 
        btnMasterAdmin.onclick = async () => { 
            if (newOrderItems.length > 0) {
                if (!(await customConfirm('Tienes platillos sin enviar a cocina. ¿Seguro que quieres descartarlos para ir al Panel?', '¡Atención!'))) return;
                clearTableSelection();
            }
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
    isAdminSessionActive = false; localStorage.setItem('isAdminSessionActive', 'false');
    btnMasterAdmin.innerHTML = '👑 Panel de Administrador'; btnMasterAdmin.style.backgroundColor = '#1a1a1a'; 
    setView('welcome-view'); clearTableSelection(); loadTables(); await customAlert('Sesión cerrada. El sistema está protegido.', 'success');
};

window.goToPOS = function() { setView('pos-view'); loadTables(); };
window.openSubAdmin = async function(section) {
    if (section === 'corte') { setView('corte-view'); loadCorteData(); } 
    else if (section === 'menu') { setView('admin-view'); loadAdminProducts(); loadWaiters(); loadModifiers(); } 
    else if (section === 'audit') { setView('audit-view'); loadFullAuditLogs(); }
};

document.getElementById('btn-close-corte').onclick = () => { setView('admin-hub-view'); };
document.getElementById('btn-close-admin').onclick = () => { setView('admin-hub-view'); loadProducts(); loadCategories(); loadTables(); };
document.getElementById('btn-close-audit').onclick = () => { setView('admin-hub-view'); };

function clearTableSelection() {
    currentTableId = null; currentOrderId = null; currentTableSpan.textContent = 'Ninguna'; btnDeselectTable.style.display = 'none'; btnTransferTable.style.display = 'none'; savedOrderItems = []; newOrderItems = []; paymentPanel.style.display = 'none'; document.getElementById('payment-buttons-container').style.display = 'none'; currentRemainingBalance = 0; selectedItemsToPay = []; document.getElementById('items-to-pay-container').style.display = 'none'; document.getElementById('pay-discount-display-container').style.display = 'none'; waiterSelect.disabled = false; waiterSelect.style.backgroundColor = '#2a2a2a'; waiterSelect.style.color = '#fff'; if(waiterSelect.previousElementSibling) waiterSelect.previousElementSibling.innerHTML = 'Mesero en Turno:'; updateOrderUI();
    document.querySelectorAll('.btn-table').forEach(b => b.classList.remove('selected'));
}

async function loadFullAuditLogs() {
    const auditDatePicker = document.getElementById('audit-date-picker');
    
    // Si el calendario está vacío, ponle la fecha de HOY en automático
    if (auditDatePicker && !auditDatePicker.value) { 
        auditDatePicker.value = obtenerFechaLocal(); 
    }
    
    const dateVal = auditDatePicker ? auditDatePicker.value : obtenerFechaLocal();
    const tbody = document.getElementById('full-audit-tbody'); 
    if (!tbody) return;
    
    try { 
        // Le mandamos la fecha seleccionada al servidor en la URL
        const response = await fetch(`/api/reports/audit?date=${dateVal}`); 
        const data = await response.json(); 
        
        tbody.innerHTML = ''; 
        if (data.logs && data.logs.length > 0) { 
            data.logs.forEach(log => { 
                tbody.innerHTML += `<tr><td>#${log.id}</td><td><span style="background: #2c2c2c; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 11px;">${log.action}</span></td><td>${log.details}</td><td>${log.performed_by || 'N/A'}</td><td>${log.created_at}</td></tr>`; 
            }); 
        } else { 
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center;">No hay registros de auditoría para este día.</td></tr>`; 
        } 
    } catch (error) { 
        console.error('Error al cargar auditoría:', error); 
    }
}

async function loadModifiers() { try { const response = await fetch('/api/catalog/modifiers'); const data = await response.json(); currentModifiers = data.modifiers; const adminModifiersList = document.getElementById('admin-modifiers-list'); if (adminModifiersList) { adminModifiersList.innerHTML = ''; currentModifiers.forEach(m => { const displayPrice = m.price > 0 ? ` (+$${m.price})` : ''; adminModifiersList.innerHTML += `<span style="background: #2c2c2c; padding: 4px 8px; border-radius: 4px; border: 1px solid #444; display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: bold;">${m.name}${displayPrice} <button onclick="deleteModifier(${m.id})" style="background: #c39bd3; color: white; border: none; border-radius: 3px; padding: 2px 6px; cursor: pointer;">✕</button></span>`; }); } } catch (error) { console.error('Error:', error); } }

async function loadCategories() { 
    try { 
        const response = await fetch('/api/catalog/categories'); 
        const data = await response.json(); 
        const tabsContainer = document.getElementById('category-tabs'); 
        if (tabsContainer) { 
            tabsContainer.innerHTML = `<button class="btn-category" onclick="filterCategory('TOP', this)" style="border-color: #e74c3c; color: #e74c3c;">⭐ </button>`;
            tabsContainer.innerHTML += `<button class="btn-category active" onclick="filterCategory('ALL', this)">Todo</button>`; 
            data.categories.forEach(cat => tabsContainer.innerHTML += `<button class="btn-category" onclick="filterCategory('${cat.name}', this)">${cat.name}</button>`); 
        } 
        const selectCategory = document.getElementById('new-category'); 
        if (selectCategory) { 
            selectCategory.innerHTML = `<option value="">Selecciona Categoría</option>`; 
            data.categories.forEach(cat => selectCategory.innerHTML += `<option value="${cat.name}">${cat.name}</option>`); 
        } 
    } catch (error) { console.error('Error:', error); } 
}

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
            btn.innerHTML = `<span style="text-decoration: line-through;">${product.name}</span><br><span style="color: #e74c3c; font-weight: bold; font-size: 11px;">🚫 AGOTADO</span>`;
            btn.onclick = () => customAlert('Este platillo está marcado como AGOTADO.', 'warning');
        } else {
            btn.textContent = `${product.name} - $${product.price}`; 
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
            <div style="display: flex; gap: 5px; margin-bottom: 12px; background: #1a1a1a; padding: 4px; border-radius: 8px; border: 1px solid #333;">
                <button onclick="switchTableTab('COMEDOR')" style="flex: 1; padding: 8px 4px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; background: ${currentTableTab === 'COMEDOR' ? '#d35400' : 'transparent'}; color: ${currentTableTab === 'COMEDOR' ? '#fff' : '#7f8c8d'}; transition: background 0.2s; font-size: 11px;">🍽️ COMEDOR</button>
                <button onclick="switchTableTab('LLEVAR')" style="flex: 1; padding: 8px 4px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; background: ${currentTableTab === 'LLEVAR' ? '#9b59b6' : 'transparent'}; color: ${currentTableTab === 'LLEVAR' ? '#fff' : '#7f8c8d'}; transition: background 0.2s; font-size: 11px;">🛍️ LLEVAR</button>
            </div>
            
            <!-- Contenedores con Flex-direction: column para forzar UNA sola hilera hacia abajo -->
            <div id="grid-comedor" style="display: ${currentTableTab === 'COMEDOR' ? 'flex' : 'none'}; flex-direction: column; gap: 10px; width: 100%;"></div>
            <div id="grid-llevar" style="display: ${currentTableTab === 'LLEVAR' ? 'flex' : 'none'}; flex-direction: column; gap: 10px; width: 100%;"></div>
        `;
        
        const gridComedor = document.getElementById('grid-comedor');
        const gridLlevar = document.getElementById('grid-llevar');

        data.tables.forEach(table => {
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
            const textoMesa = `<span style="font-weight:300; font-size: 11px; letter-spacing: 2px; color: #7f8c8d;">MESA</span><br><span style="font-weight:900; font-size: 24px; line-height: 1.1; color: #fff;">${table.table_number}</span>`;

            if (table.status === 'OCUPADA') {
                let mins = table.minutes_open || 0; 
                let bgColor = 'rgba(0,0,0,0.5)'; if (mins > 40) bgColor = '#900C3F'; else if (mins > 25) bgColor = '#d35400';
                
                // ✨ NUEVO: Etiqueta dinámica de Folio (solo aparece si el backend lo manda)
                const etiquetaFolio = table.active_folio 
                    ? `<div style="background: #e74c3c; color: #fff; font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 4px; margin: 4px 0 0 0;">Folio: #${table.active_folio}</div>` 
                    : '';

                if (displayTotal > 0) { 
                    btn.innerHTML = `${textoMesa}${etiquetaFolio}<div style="font-size: 10px; background: ${bgColor}; padding: 2px 6px; border-radius: 8px; margin: 4px 0 6px 0; color: white;">⏱️ ${mins} min</div><span style="font-size: 14px; color: #f1c40f; font-weight: 900;">$${displayTotal.toFixed(2)}</span>`; 
                } else { 
                    btn.innerHTML = `${textoMesa}${etiquetaFolio}<div style="font-size: 10px; background: ${bgColor}; padding: 2px 6px; border-radius: 8px; margin: 4px 0 6px 0; color: white;">⏱️ ${mins} min</div>`; 
                }
            } else { 
                btn.innerHTML = `${textoMesa}`; 
            }
            // Agrega esta línea nueva:
            btn.dataset.id = table.id;
            
            // Esta línea ya la tienes:
            btn.onclick = () => selectTable(table);
            
            btn.onclick = () => selectTable(table); 
            if (esLlevar) { gridLlevar.appendChild(btn); } else { gridComedor.appendChild(btn); }
        });

        const adminTablesList = document.getElementById('admin-tables-list'); 
        if (adminTablesList) { 
            adminTablesList.innerHTML = ''; 
            data.tables.forEach(table => adminTablesList.innerHTML += `<span style="background: #2c2c2c; padding: 6px 12px; border-radius: 4px; border: 1px solid #444; display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: bold;">🪑 ${table.table_number} <button onclick="deleteTable(${table.id})" style="background: #e74c3c; color: white; border: none; border-radius: 3px; padding: 2px 6px; cursor: pointer;">✕</button></span>`); 
        }
    } catch (error) { console.error('Error:', error); }
}

async function deleteTable(id) { if (!(await customConfirm('¿Estás seguro de eliminar esta mesa?', 'Eliminar Mesa'))) return; const response = await fetch(`/api/catalog/tables/${id}`, { method: 'DELETE' }); if (response.ok) loadTables(); else { const err = await response.json(); await customAlert(`Error: ${err.error}`, 'error'); } }
async function loadWaiters() { try { const response = await fetch('/api/catalog/waiters'); const data = await response.json(); if (waiterSelect) { waiterSelect.innerHTML = `<option value="">Seleccione mesero...</option>`; data.waiters.forEach(w => waiterSelect.innerHTML += `<option value="${w.name}">${w.name}</option>`); if (lastSelectedWaiter) waiterSelect.value = lastSelectedWaiter; } const adminWaitersList = document.getElementById('admin-waiters-list'); if (adminWaitersList) { adminWaitersList.innerHTML = ''; data.waiters.forEach(w => adminWaitersList.innerHTML += `<span style="background: #2c2c2c; padding: 6px 12px; border-radius: 4px; border: 1px solid #444; display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: bold;">👤 ${w.name} <button onclick="deleteWaiter(${w.id})" style="background: #e74c3c; color: white; border: none; border-radius: 3px; padding: 2px 6px; cursor: pointer;">✕</button></span>`); } } catch (error) { console.error('Error:', error); } }

async function loadProducts() { try { const response = await fetch('/api/catalog/products'); const data = await response.json(); allProducts = data.products; displayProducts(allProducts); } catch (error) { console.error('Error:', error); } }

let clienteLlevarActual = null;
let currentPax = 1;

async function selectTable(table) {
    // 1. Limpiamos la selección de todas las mesas
    document.querySelectorAll('.btn-table').forEach(b => b.classList.remove('selected'));
    // 2. Iluminamos solo la mesa que acabamos de tocar
    const activeBtn = document.querySelector(`.btn-table[data-id="${table.id}"]`);
    if (activeBtn) activeBtn.classList.add('selected');
    currentTableId = table.id; currentTableSpan.textContent = table.table_number; btnDeselectTable.style.display = 'inline-block'; currentOrderId = null; savedOrderItems = []; newOrderItems = []; paymentPanel.style.display = 'none'; document.getElementById('payment-buttons-container').style.display = 'none'; currentRemainingBalance = 0; selectedItemsToPay = []; document.getElementById('items-to-pay-container').style.display = 'none'; document.getElementById('pay-discount-display-container').style.display = 'none'; const waiterLabel = waiterSelect.previousElementSibling;

    if (table.status === 'OCUPADA') {
        clienteLlevarActual = null; 
        const response = await fetch(`/api/orders/table/${table.id}`); const data = await response.json();
        if (data.order) {
            currentPax = data.order.guests || 1;
            currentOrderId = data.order.id; savedOrderItems = data.order.items; currentRemainingBalance = data.order.remaining_balance !== null ? data.order.remaining_balance : data.order.total;
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
        if (lastSelectedWaiter) waiterSelect.value = lastSelectedWaiter; 
        
        if (table.table_number.toUpperCase().includes('LLEVAR')) {
            currentPax = 1; 
            clienteLlevarActual = null; // Sin interrupciones para Llevar
        } else {
            clienteLlevarActual = null;
            currentPax = 1; // 💡 Asume 1 persona por defecto en Comedor para no estorbar
        }
    }
    updateOrderUI();
}

const transferModal = document.getElementById('transfer-modal'); const btnConfirmTransfer = document.getElementById('btn-confirm-transfer'); const btnCancelTransfer = document.getElementById('btn-cancel-transfer'); const transferNewTable = document.getElementById('transfer-new-table');
btnTransferTable.onclick = async () => { try { const response = await fetch('/api/catalog/tables'); const data = await response.json(); const freeTables = data.tables.filter(t => t.status === 'LIBRE'); if (freeTables.length === 0) { await customAlert('No hay mesas libres para hacer el cambio.', 'warning'); return; } transferNewTable.innerHTML = ''; freeTables.forEach(t => { transferNewTable.innerHTML += `<option value="${t.id}">MESA ${t.table_number}</option>`; }); transferModal.style.display = 'flex'; } catch (error) { console.error(error); } };
btnCancelTransfer.onclick = () => { transferModal.style.display = 'none'; };
btnConfirmTransfer.onclick = async () => { const newTableId = transferNewTable.value; if (!newTableId) return; try { const response = await fetch(`/api/orders/${currentOrderId}/transfer`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ new_table_id: newTableId }) }); if (response.ok) { await customAlert('Mesa transferida con éxito.', 'success', '¡Listo!'); transferModal.style.display = 'none'; clearTableSelection(); loadTables(); } else { const err = await response.json(); await customAlert(`Error: ${err.error}`, 'error'); } } catch (error) { console.error(error); } };
window.toggleTakeaway = function(index) { newOrderItems[index].is_takeaway = !newOrderItems[index].is_takeaway; updateOrderUI(); };

async function addToOrder(product) {
    if (!currentTableId) { await customAlert('Selecciona una mesa primero.', 'warning'); return; }
    
    const esParaLlevar = currentTableSpan.textContent.toUpperCase().includes('LLEVAR');
    
    productClicks[product.id] = (productClicks[product.id] || 0) + 1;
    const existingNewItem = newOrderItems.find(item => item.product_id === product.id && item.notes === '' && item.is_takeaway === esParaLlevar);
    
    if (existingNewItem) { existingNewItem.quantity += 1; updateOrderUI(); } 
    else { newOrderItems.push({ product_id: product.id, name: product.name, price: product.price, quantity: 1, notes: '', is_takeaway: esParaLlevar, station: product.station, extra_price: 0 }); updateOrderUI(); openNoteModal(newOrderItems.length - 1); }
}

function openNoteModal(index) {
    editingItemIndex = index; const item = newOrderItems[index]; noteModalTitle.textContent = `Nota para: ${item.name}`; modalNoteInput.value = item.notes; quickModifiersGrid.innerHTML = '';
    currentModifiers.forEach(mod => {
        const btn = document.createElement('button'); const displayPrice = mod.price > 0 ? ` (+$${mod.price})` : ''; btn.textContent = mod.name + displayPrice;
        btn.style.cssText = "padding: 8px 12px; background: #2c2c2c; border: 1px solid #444; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: bold; color: #fff;";
        btn.onclick = () => { const currentVal = modalNoteInput.value.trim(); const additionText = mod.price > 0 ? `${mod.name} (+$${mod.price})` : mod.name; modalNoteInput.value = currentVal ? `${currentVal}, ${additionText}` : additionText; if (mod.price > 0) { newOrderItems[editingItemIndex].extra_price += mod.price; } };
        quickModifiersGrid.appendChild(btn);
    });
    noteModal.style.display = 'flex'; modalNoteInput.focus();
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
    orderItemsList.innerHTML = ''; 
    let rawItemsSum = 0; // Suma cruda solo para cuando es una mesa nueva sin guardar
    let newItemsTotal = 0;

   // === CAJÓN VISUAL INTELIGENTE (PAX o LLEVAR) ===
    if (currentTableId) {
        const esLlevar = currentTableSpan.textContent.toUpperCase().includes('LLEVAR');
        
        if (esLlevar) {
            const nombreMostrar = clienteLlevarActual ? clienteLlevarActual : 'Sin Nombre (Toca Nombre ->)';
            orderItemsList.innerHTML += `
            <div style="background: #2c2c2c; padding: 8px; border-radius: 6px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; font-size: 12px; border: 1px solid #444;">
                <span style="color: #bdc3c7; font-weight: bold;">🛍️ Cliente: <span style="color: #f1c40f; font-size: 14px;">${nombreMostrar}</span></span>
                <button onclick="editClientName()" style="background: #e67e22; color: white; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-weight: bold;">✏️ Nombre</button>
            </div>`;
        } else {
            orderItemsList.innerHTML += `
            <div style="background: #2c2c2c; padding: 8px; border-radius: 6px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; font-size: 12px; border: 1px solid #444;">
                <span style="color: #bdc3c7; font-weight: bold;">👥 Personas (PAX): <span style="color: #fff; font-size: 14px;">${currentPax}</span></span>
                <button onclick="editPax()" style="background: #3498db; color: white; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-weight: bold;">✏️ Cambiar</button>
            </div>`;
        }
    }
    
    // =======================================

    // 1. Dibujamos los items ya guardados en el servidor
    savedOrderItems.forEach(item => {
        const unitPrice = item.price + (item.extra_price || 0); 
        rawItemsSum += unitPrice * item.quantity;
        const isPaid = item.paid === 1; 
        const textStyle = isPaid ? 'text-decoration: line-through; color: #555;' : 'color: #fff; font-weight: 500;';
        const paidBadge = isPaid ? ' <span style="background: #27ae60; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold;">PAGADO</span>' : '';
        const takeawayBadge = item.is_takeaway ? ' <span style="background: #e67e22; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold;">🥡 LLEVAR</span>' : '';
        
        orderItemsList.innerHTML += `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 14px; border-bottom: 1px dashed #333; padding-bottom: 4px; ${textStyle}"><div><span>${item.quantity}x ${item.name}</span>${takeawayBadge}${paidBadge}${item.notes ? `<br><small style="color: #e67e22;">↳ ${item.notes}</small>` : ''}</div><div style="display: flex; gap: 10px; align-items: center;"><span>$${unitPrice * item.quantity}</span>${!isPaid ? `<button onclick="openCancelModal('item', ${item.id})" style="background: none; border: none; cursor: pointer; font-size: 16px;">🗑️</button>` : ''}</div></div>`;
    });

    // 2. Dibujamos los items nuevos que el mesero apenas está pidiendo
    newOrderItems.forEach((item, index) => {
        const unitPrice = item.price + (item.extra_price || 0); 
        newItemsTotal += unitPrice * item.quantity;
        const takeawayBadge = item.is_takeaway ? ' <span style="background: #e67e22; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold;">🥡 LLEVAR</span>' : '';
        
        orderItemsList.innerHTML += `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-weight: bold; color: #d35400; font-size: 14px; border-bottom: 1px dashed #333; padding-bottom: 4px;"><div onclick="openNoteModal(${index})" style="cursor: pointer; flex: 1;"><span>+ ${item.quantity}x ${item.name}</span>${takeawayBadge}${item.notes ? `<br><small style="color: #e74c3c;">↳ ${item.notes}</small>` : '<br><small style="color: #f39c12; font-style: italic;">(Toca para nota rápida)</small>'}</div><div style="display: flex; gap: 8px; align-items: center;"><span>$${unitPrice * item.quantity}</span><button onclick="toggleTakeaway(${index})" style="background: none; border: none; cursor: pointer; font-size: 16px;" title="Marcar para llevar">🥡</button><button onclick="openNoteModal(${index})" style="background: none; border: none; cursor: pointer; font-size: 16px;">✏️</button><button onclick="removeNewItem(${index})" style="background: none; border: none; cursor: pointer; font-size: 16px;">❌</button></div></div>`;
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
    try {
        let url = '/api/orders'; let bodyData = { table_id: currentTableId, waiter_name: selectedWaiter, items: itemsForApi, is_printed: shouldPrint, guests: currentPax }; let orderNum = currentOrderId;
        if (currentOrderId) { url = `/api/orders/${currentOrderId}/items`; bodyData = { items: itemsForApi, is_printed: shouldPrint }; }
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyData) }); const result = await response.json();
        if (response.ok) { 
            if (!orderNum) orderNum = result.orderId; 
            if (shouldPrint) { showComanda(itemsToPrint, orderNum, currentTableSpan.textContent, selectedWaiter); } 
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

function showComanda(items, orderId, mesa, mesero) {
    let time = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    
    let encabezadoHTML = mesa.toUpperCase().includes('LLEVAR')
        ? `<div style="background: #000; color: #fff; text-align: center; padding: 6px; font-size: 16px; font-weight: 900; border: 2px dashed #000; margin-bottom: 10px;">¡PEDIDO PARA LLEVAR!</div><div style="display: flex; justify-content: space-between; font-weight: bold;"><span>COMANDA #${orderId.toString().padStart(5, '0')}</span><span>${mesa}</span></div>`
        : `<div style="display: flex; justify-content: space-between; font-weight: bold;"><span>COMANDA #${orderId.toString().padStart(5, '0')}</span><span>MESA ${mesa}</span></div>`;

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
    const montoPorPersona = currentRemainingBalance / personas; 
    inputAmountPaid.value = montoPorPersona.toFixed(2); 
    calcularCambioEnVivo();
    await customAlert(`Cada persona pagará: $${montoPorPersona.toFixed(2)}`, 'info'); 
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
                <span>FOLIO: #${(orderIdNum || 0).toString().padStart(5, '0')}</span>
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
            <p style="font-size: 11px; margin-top: 5px;">Escanee e ingrese el TICKET #${(orderIdNum || 0).toString().padStart(5, '0')}</p>
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

    // 🖨️ MODO PC (Caja): Imprime físicamente usando un iframe invisible
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
    const ticketModal = document.getElementById('ticket-modal'); const ticketContent = document.getElementById('ticket-content'); let date = order.closed_at || order.created_at; let method = order.payment_method || 'EFECTIVO'; let change = order.change_amount || 0; let tipAmount = order.tip_amount || 0; let html = `<h2 style="margin: 0; font-size: 18px; font-weight: 900;">ASADERO LA ESTAMPIDA</h2><p style="margin: 5px 0; font-size: 12px;">Blvd Francisco Fernández Arteaga #2096</p><p style="margin: 5px 0; font-size: 12px;">Tuxtepec, Oaxaca</p><p style="margin: 5px 0; font-size: 12px;">Fecha Cierre: ${date}</p><p style="margin: 5px 0; font-size: 15px; font-weight: bold; color: #000;">TICKET #${order.id.toString().padStart(5, '0')} <span style="font-size: 10px; color:#555;">(Reimpresión)</span></p><p style="margin: 5px 0; font-size: 12px;">Mesa: ${tableNumber} | Mesero: ${order.waiter_name}</p><hr style="border-top: 1px dashed #000; margin: 10px 0;">
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
     html += `</div><hr style="border-top: 1px dashed #000; margin: 10px 0;"><div style="text-align: right; font-size: 13px;">`; if (order.discount_amount > 0) { html += `<p style="font-size: 14px; margin-bottom: 5px; color: #555;"><strong>Descuento: -$${order.discount_amount.toFixed(2)}</strong></p>`; } html += `<p style="font-size: 15px; margin-bottom: 5px;"><strong>SUBTOTAL: $${order.total.toFixed(2)}</strong></p>`; let granTotal = order.total + tipAmount; if (tipAmount > 0) { html += `<p style="font-size: 14px; margin-bottom: 5px; color: #555;"><strong>Propina: $${tipAmount.toFixed(2)}</strong></p>`; } html += `<p style="font-size: 18px; margin-bottom: 10px; font-weight: 900;">TOTAL COBRADO: $${granTotal.toFixed(2)}</p><p>Pagó con ${method}</p><p>Cambio: $${change.toFixed(2)}</p></div><p style="margin-top: 20px; font-size: 11px; text-align: center; font-weight: bold;">¡Gracias por su preferencia!</p>`; ticketContent.innerHTML = html; isReprinting = true; ticketModal.style.display = 'flex';
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

async function loadAdminProducts() { 
    const tbody = document.getElementById('admin-products-tbody'); 
    if (!tbody) return; 
    const response = await fetch('/api/catalog/products'); 
    const data = await response.json(); 
    tbody.innerHTML = ''; 
    data.products.forEach(p => { 
        const isAvailable = p.is_available !== 0;
        const statusBtn = isAvailable 
            ? `<button onclick="toggleProductStatus(${p.id}, 0)" style="background:#27ae60; color:white; border:none; padding:6px 10px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:bold;">🟢 Disponible</button>`
            : `<button onclick="toggleProductStatus(${p.id}, 1)" style="background:#c0392b; color:white; border:none; padding:6px 10px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:bold;">🔴 Agotado</button>`;

        tbody.innerHTML += `<tr><td>${p.name}</td><td>$${p.price.toFixed(2)}</td><td>${p.station}</td><td>${p.category}</td><td style="text-align: center;">${statusBtn}</td><td><button onclick="editProduct(${p.id}, '${p.name}', ${p.price}, '${p.station}', '${p.category}')" class="btn-secondary" style="background-color: #f39c12; padding: 4px; border: none;">Editar</button> <button onclick="deleteProduct(${p.id})" class="btn-secondary" style="background-color: #e74c3c; padding: 4px; border: none; color: white;">X</button></td></tr>`; 
    }); 
}

window.toggleProductStatus = async function(id, newStatus) { try { await fetch(`/api/catalog/products/${id}/toggle`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_available: newStatus }) }); loadAdminProducts(); loadProducts(); } catch(e) { console.error(e); } };

const modifierForm = document.getElementById('modifier-form'); if (modifierForm) modifierForm.onsubmit = async (e) => { e.preventDefault(); const priceVal = document.getElementById('new-modifier-price').value; await fetch('/api/catalog/modifiers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: document.getElementById('new-modifier-name').value.trim(), price: priceVal ? parseFloat(priceVal) : 0 }) }); document.getElementById('new-modifier-name').value = ''; document.getElementById('new-modifier-price').value = ''; loadModifiers(); };
async function deleteModifier(id) { if (!(await customConfirm('¿Eliminar modificador?'))) return; await fetch(`/api/catalog/modifiers/${id}`, { method: 'DELETE' }); loadModifiers(); }
document.getElementById('category-form').onsubmit = async (e) => { e.preventDefault(); await fetch('/api/catalog/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: document.getElementById('new-category-name').value.trim() }) }); document.getElementById('new-category-name').value = ''; loadCategories(); };
document.getElementById('waiter-form').onsubmit = async (e) => { e.preventDefault(); await fetch('/api/catalog/waiters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: document.getElementById('new-waiter-name').value.trim() }) }); document.getElementById('new-waiter-name').value = ''; loadWaiters(); };
async function deleteWaiter(id) { if (!(await customConfirm('¿Eliminar mesero?'))) return; await fetch(`/api/catalog/waiters/${id}`, { method: 'DELETE' }); loadWaiters(); }
document.getElementById('table-form').onsubmit = async (e) => { e.preventDefault(); await fetch('/api/catalog/tables', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table_number: document.getElementById('new-table-number').value.trim() }) }); document.getElementById('new-table-number').value = ''; loadTables(); };
document.getElementById('product-form').onsubmit = async (e) => { e.preventDefault(); await fetch('/api/catalog/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: document.getElementById('new-name').value, price: parseFloat(document.getElementById('new-price').value), station: document.getElementById('new-station').value, category: document.getElementById('new-category').value }) }); document.getElementById('product-form').reset(); loadAdminProducts(); loadProducts(); };
async function deleteProduct(id) { if (!(await customConfirm('¿Estás seguro de eliminar este platillo?'))) return; await fetch(`/api/catalog/products/${id}`, { method: 'DELETE' }); loadAdminProducts(); loadProducts(); }
async function editProduct(id, name, price, station, category) { const newName = await customPrompt("Nuevo nombre:", "text", name); if (!newName) return; await new Promise(resolve => setTimeout(resolve, 250)); const newPrice = await customPrompt("Nuevo precio:", "number", price); if (!newPrice) return; await fetch(`/api/catalog/products/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName, price: parseFloat(newPrice), station, category }) }); loadAdminProducts(); loadProducts(); }

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
    document.getElementById('corte-fondo').textContent = fondoAmount.toFixed(2);

    const response = await fetch(`/api/reports/corte?date=${dateVal}`); 
    const data = await response.json();
    
    if (response.ok) {
        const sum = data.summary;
        desgloseGastosActual = sum.desglose_gastos || []; // 💡 Guardamos los gastos en la memoria
        document.getElementById('corte-total').textContent = sum.total_general.toFixed(2); 
        document.getElementById('corte-efectivo').textContent = sum.total_efectivo.toFixed(2);
        document.getElementById('corte-tarjeta').textContent = sum.total_tarjeta.toFixed(2);
        document.getElementById('corte-propinas-tarjeta').textContent = sum.propinas_tarjeta.toFixed(2);
        document.getElementById('corte-propinas-efectivo').textContent = sum.propinas_efectivo.toFixed(2);

        const totalGastos = sum.total_gastos || 0;
        document.getElementById('corte-gastos').textContent = totalGastos.toFixed(2);

        const efectivoEsperado = fondoAmount + sum.total_efectivo - totalGastos - sum.propinas_tarjeta;
        document.getElementById('corte-esperado').textContent = efectivoEsperado.toFixed(2);
        
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
        <div style="display: flex; gap: 10px; margin-bottom: 20px; width: 100%;">
            <div style="background: #2980b9; padding: 12px; border-radius: 6px; flex: 1; border: 1px solid #333; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
                <span style="font-size: 11px; font-weight: bold; color: #ecf0f1; letter-spacing: 1px;">💳 COBROS TPV (TERMINAL)</span>
                <h3 style="margin: 6px 0 0; color: #fff; font-size: 22px;">$${sum.total_tarjeta.toFixed(2)}</h3>
            </div>
            <div style="background: #8e44ad; padding: 12px; border-radius: 6px; flex: 1; border: 1px solid #333; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
                <span style="font-size: 11px; font-weight: bold; color: #ecf0f1; letter-spacing: 1px;">🛍️ VENTAS PARA LLEVAR</span>
                <h3 style="margin: 6px 0 0; color: #fff; font-size: 22px;">$${totalLlevar.toFixed(2)}</h3>
            </div>
            <div style="background: #27ae60; padding: 12px; border-radius: 6px; flex: 1; border: 1px solid #333; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
                <span style="font-size: 11px; font-weight: bold; color: #ecf0f1; letter-spacing: 1px;">🍽️ VENTAS COMEDOR</span>
                <h3 style="margin: 6px 0 0; color: #fff; font-size: 22px;">$${totalComedor.toFixed(2)}</h3>
            </div>
        </div>
        
        <h4 style="width: 100%; margin: 0 0 10px 0; color: #bdc3c7; border-bottom: 1px solid #333; padding-bottom: 5px;">Rendimiento por Mesero:</h4>
        <div id="meseros-grid" style="display: flex; gap: 10px; width: 100%; flex-wrap: wrap;"></div>
        `;
        
        const meserosGrid = document.getElementById('meseros-grid');
        if (Object.keys(sum.ventas_por_mesero).length === 0) { 
            meserosGrid.innerHTML = '<p style="color: #7f8c8d; font-size: 14px;">No hay ventas registradas en esta fecha.</p>'; 
        } else { 
            for (const [waiter, info] of Object.entries(sum.ventas_por_mesero)) { 
                meserosGrid.innerHTML += `<div style="background: #1a1a1a; padding: 10px; border-radius: 6px; border-left: 4px solid #d35400; border-top: 1px solid #333; border-right: 1px solid #333; border-bottom: 1px solid #333; flex: 1; min-width: 150px;"><span style="font-size: 12px; font-weight: bold; color: #bdc3c7;">👤 ${waiter}</span><h4 style="margin: 4px 0 0; color: #fff;">$${info.total.toFixed(2)}</h4><small style="color: #d35400; font-weight: bold;">${info.tickets} tickets</small></div>`; 
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
                    <td>#${o.id}</td>
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
    if(posView.style.display !== 'none' && navigator.onLine) loadTables(); 
    if(corteView.style.display !== 'none') loadCorteData(); 
});
socket.on('update-products', () => { 
    if(posView.style.display !== 'none' && navigator.onLine) loadProducts(); 
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
                <span>FOLIO: #${(currentOrderId || 0).toString().padStart(5, '0')}</span>
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
let esperadoReal = 0;

window.abrirArqueo = function() {
    arqueoRevelado = false; 
    esperadoReal = parseFloat(document.getElementById('corte-esperado').textContent) || 0;
    
    document.getElementById('arq-esperado').textContent = '🔒 Oculto';
    document.getElementById('arq-diferencia').textContent = '🔒 Oculto';
    document.getElementById('arq-diferencia').style.color = '#7f8c8d';
    
    const memoriaBilletes = JSON.parse(localStorage.getItem('memoriaArqueo')) || {};
    
    document.querySelectorAll('.arq-input').forEach(input => {
        const valorCaja = input.dataset.val;
        if (memoriaBilletes[valorCaja] !== undefined) {
            input.value = memoriaBilletes[valorCaja];
        } else {
            input.value = '';
        }
    });

    calcularArqueo(); 
    document.getElementById('arqueo-modal').style.display = 'flex';
};

window.calcularArqueo = function() {
    let totalFisico = 0;
    let memoriaActual = {}; 
    
    document.querySelectorAll('.arq-input').forEach(input => {
        const cantidad = parseInt(input.value) || 0;
        const valor = parseFloat(input.dataset.val);
        totalFisico += cantidad * valor;
        
        if (input.value !== '') {
            memoriaActual[valor] = input.value;
        }
    });
    
    localStorage.setItem('memoriaArqueo', JSON.stringify(memoriaActual));
    document.getElementById('arq-total-fisico').textContent = totalFisico.toFixed(2);
    
    if (arqueoRevelado) {
        document.getElementById('arq-esperado').textContent = esperadoReal.toFixed(2);
        const diferencia = totalFisico - esperadoReal;
        const difSpan = document.getElementById('arq-diferencia');
        
        if (diferencia === 0 && esperadoReal > 0) {
            difSpan.textContent = "✅ CUADRE PERFECTO";
            difSpan.style.color = "#27ae60"; 
        } else if (diferencia > 0) {
            difSpan.textContent = `⚠️ SOBRAN $${diferencia.toFixed(2)}`;
            difSpan.style.color = "#f1c40f"; 
        } else {
            difSpan.textContent = `❌ FALTAN $${Math.abs(diferencia).toFixed(2)}`;
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
        const efectivoEsperado = fondoAmount + sum.total_efectivo - totalGastos - sum.propinas_tarjeta;

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
    if (newOrderItems && newOrderItems.length > 0) {
        e.preventDefault();
        e.returnValue = 'Tienes platillos sin enviar a cocina. ¿Seguro que quieres salir y perderlos?';
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
        document.getElementById('ticket-content').innerHTML = htmlRemoto;
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
                        <strong style="color: #fff; font-size: 14px;">${g.concept.toUpperCase()}</strong><br>
                        <small style="color: #bdc3c7;">${g.category} - ${g.created_at.split(' ')[1] || ''}</small>
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