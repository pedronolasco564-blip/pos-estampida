// Socket: actualizaciones entre dispositivos e instrucciones de cobro.
// Scripts clásicos que comparten el ámbito global; se cargan en orden desde index.html.
const socket = io();
// Si esta pantalla está en la PC de la caja, se registra para imprimir los tickets que mandan los celulares
const esPantallaDeCaja = () => window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
// Mientras un celular tiene la pantalla apagada o pierde el Wi-Fi, no recibe los avisos de cambios de los demás.
// Al volver la conexión o al regresar a la app se recargan los datos, para no mostrar totales ni mesas viejos.
function refrescarPantalla() {
    if (!navigator.onLine) return;
    if (posView.style.display !== 'none') {
        loadTables();
        // La cuenta abierta se recarga solo si no hay nada a medio capturar (platillos nuevos, cobro o nombre)
        if (currentTableId && newOrderItems.length === 0 && paymentPanel.style.display === 'none' && !clienteLlevarActual) {
            selectTable({ id: currentTableId, table_number: currentTableSpan.textContent.split(' (')[0] }, { silencioso: true });
        }
    }
    if (adminHubView.style.display !== 'none') loadDashboard();
    if (corteView.style.display !== 'none') loadCorteData();
}
let socketYaConectado = false;
socket.on('connect', () => {
    if (esPantallaDeCaja()) socket.emit('soy-caja', { desktop: !!window.posDesktop });
    if (socketYaConectado) refrescarPantalla(); // reconexión: pudieron perderse avisos
    socketYaConectado = true;
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refrescarPantalla(); });
// Respaldo: la cuadrícula se actualiza cada 45 s (tiempos de espera y totales al día aunque se pierda un aviso)
setInterval(() => {
    if (document.visibilityState === 'visible' && navigator.onLine && posView.style.display !== 'none') loadTables();
}, 45000);
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
        iniciarCuentaPorConsumo();
    }

    socket.emit('payment-instruction', { tableId: currentTableId, instruction: instruction, invoice: wantsInvoice });
    tableInstructions[currentTableId] = { tableId: currentTableId, instruction: instruction, invoice: wantsInvoice };
    updateOrderUI();
};

