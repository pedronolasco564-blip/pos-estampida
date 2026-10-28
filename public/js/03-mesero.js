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
    if (sheet) { sheet.classList.add('sheet-open'); sheet.scrollTop = 0; }
    if (backdrop) backdrop.classList.add('active');
    document.body.classList.add('sheet-lock'); // la página de atrás no se mueve mientras está abierta
};

window.closeMobileSheet = function() {
    const sheet = document.getElementById('order-section');
    const backdrop = document.getElementById('mobile-sheet-backdrop');
    if (sheet) sheet.classList.remove('sheet-open', 'sheet-dragging');
    if (backdrop) backdrop.classList.remove('active');
    document.body.classList.remove('sheet-lock');
};

// ========================================================
// COMANDA EN CELULAR/TABLET: se baja con el dedo para ocultarla y se sube deslizando la barra inferior.
// Se arrastra desde la barra de arriba, o desde cualquier parte si la lista ya está hasta arriba.
// Si se suelta antes de bajar una cuarta parte (y sin impulso), regresa a su lugar.
// ========================================================
(function setupSheetGestures() {
    const sheet = document.getElementById('order-section');
    const bar = document.getElementById('mobile-order-bar');
    const isMobile = () => window.matchMedia('(max-width: 950px)').matches;
    let startY = 0, lastY = 0, lastT = 0, velocity = 0, tracking = false, dragging = false, fromHeader = false;

    if (sheet) {
        sheet.addEventListener('touchstart', (e) => {
            if (!isMobile() || !sheet.classList.contains('sheet-open') || e.touches.length !== 1) return;
            if (e.target.closest('input, textarea, select')) return;
            fromHeader = !!e.target.closest('.mobile-sheet-header');
            startY = lastY = e.touches[0].clientY; lastT = performance.now();
            velocity = 0; tracking = true; dragging = false;
        }, { passive: true });

        sheet.addEventListener('touchmove', (e) => {
            if (!tracking) return;
            const y = e.touches[0].clientY;
            const dy = y - startY;
            if (!dragging) {
                if (dy > 8 && (fromHeader || sheet.scrollTop <= 0)) {
                    dragging = true;
                    sheet.classList.add('sheet-dragging');
                } else if (Math.abs(dy) > 8) {
                    tracking = false; // es un scroll normal de la lista
                    return;
                } else return;
            }
            e.preventDefault();
            const now = performance.now();
            velocity = (y - lastY) / Math.max(1, now - lastT);
            lastY = y; lastT = now;
            sheet.style.setProperty('--sheet-drag', `${Math.max(0, dy)}px`);
        }, { passive: false });

        const endDrag = () => {
            if (!tracking) return;
            tracking = false;
            if (!dragging) return;
            dragging = false;
            const dy = lastY - startY;
            if (dy > sheet.offsetHeight * 0.25 || velocity > 0.6) {
                closeMobileSheet();
            } else {
                sheet.classList.remove('sheet-dragging'); // regresa a su lugar con animación
            }
            sheet.style.removeProperty('--sheet-drag');
        };
        sheet.addEventListener('touchend', endDrag);
        sheet.addEventListener('touchcancel', endDrag);
    }

    // Deslizar hacia arriba la barra inferior abre la comanda (tocarla también la abre)
    if (bar) {
        let barStartY = null;
        bar.addEventListener('touchstart', (e) => { barStartY = e.touches[0].clientY; }, { passive: true });
        bar.addEventListener('touchend', (e) => {
            if (barStartY === null) return;
            const dy = barStartY - e.changedTouches[0].clientY;
            barStartY = null;
            if (dy > 30 && isMobile()) { e.preventDefault(); openMobileSheet(); }
        });
    }
})();

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

