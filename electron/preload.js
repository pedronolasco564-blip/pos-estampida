// Puente mínimo entre la página del POS y la app de escritorio (solo lo que la página necesita).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('posDesktop', {
    // Imprime un ticket (HTML completo) en la impresora de tickets configurada, sin diálogos.
    printTicket: (html) => ipcRenderer.invoke('print-ticket', html)
});
