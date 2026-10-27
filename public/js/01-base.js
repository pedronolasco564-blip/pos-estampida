// Utilidades, modales y sesión de administrador.
// Scripts clásicos que comparten el ámbito global; se cargan en orden desde index.html.
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

