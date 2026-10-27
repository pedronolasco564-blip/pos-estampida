// Ergonomía móvil, mesero del dispositivo y acceso.
// Scripts clásicos que comparten el ámbito global; se cargan en orden desde index.html.
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

