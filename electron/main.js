const { app, BrowserWindow, Tray, Menu, dialog, nativeImage, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');


const PORT = 3000;
let mainWindow = null;
let splash = null;
let tray = null;
let backendStarted = false;
let quitting = false;

if (!app.requestSingleInstanceLock()) {
    app.quit();
}
app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
});

// ========================================================
// REGISTRO DE ERRORES: %APPDATA%/<app>/registros/pos_YYYY-MM-DD.log (se conservan 30 días).
// Sirve para saber qué pasó en el local cuando algo falla sin que nadie lo vea.
// ========================================================
function setupLogging() {
    const dir = path.join(app.getPath('userData'), 'registros');
    try {
        fs.mkdirSync(dir, { recursive: true });
        fs.readdirSync(dir).filter(f => /^pos_\d{4}-\d{2}-\d{2}\.log$/.test(f)).sort().reverse().slice(30)
            .forEach(f => fs.unlinkSync(path.join(dir, f)));
    } catch (_) {}
    const write = (level, args) => {
        try {
            const d = new Date();
            const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const text = args.map(a => (a instanceof Error ? (a.stack || a.message) : typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
            fs.appendFileSync(path.join(dir, `pos_${day}.log`), `${d.toTimeString().slice(0, 8)} [${level}] ${text}\n`);
        } catch (_) {}
    };
    for (const level of ['error', 'warn']) {
        const original = console[level].bind(console);
        console[level] = (...args) => { write(level.toUpperCase(), args); original(...args); };
    }
    process.on('uncaughtException', (err) => console.error('Error no controlado:', err));
    process.on('unhandledRejection', (err) => console.error('Promesa rechazada sin manejar:', err));
    write('INFO', [`POS iniciado, versión ${app.getVersion()}`]);
    return dir;
}
let logsDir = null;

// La base de datos vive en %APPDATA%/<app>, nunca dentro del instalador.
function prepareDataDir() {
    const dataDir = app.getPath('userData');
    fs.mkdirSync(dataDir, { recursive: true });
    process.env.POS_DATA_DIR = dataDir;

    // Primera ejecución: si existe una BD junto al código (versión web anterior), se copia una sola vez.
    const target = path.join(dataDir, 'pos_restaurante.db');
    if (!fs.existsSync(target)) {
        const legacy = path.join(app.getAppPath(), 'pos_restaurante.db');
        if (!app.isPackaged && fs.existsSync(legacy)) {
            fs.copyFileSync(legacy, target);
        }
    }
    return dataDir;
}


// Actualizaciones desde GitHub Releases. Se descargan solas y se instalan nunca a media jornada:
// - al arrancar (si ya estaba descargada, se instala en los primeros minutos, antes del servicio);
// - o cuando el usuario elige "Instalar actualización" en el icono, o al salir del sistema.
const appStartedAt = Date.now();
let pendingUpdate = null;

function setupAutoUpdate() {
    if (!app.isPackaged) return;
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('error', (e) => console.error('Actualizador:', e.message));
    autoUpdater.on('update-downloaded', (info) => {
        if (Date.now() - appStartedAt < 3 * 60 * 1000) {
            // Recién encendido: se instala ya (tarda unos segundos y el POS vuelve a abrir solo).
            quitting = true;
            autoUpdater.quitAndInstall(true, true);
            return;
        }
        pendingUpdate = { version: info.version, install: () => { quitting = true; autoUpdater.quitAndInstall(true, true); } };
        if (tray) {
            tray.setToolTip(`POS La Estampida: actualización v${info.version} lista`);
            buildTrayMenu();
        }
    });
    const check = () => autoUpdater.checkForUpdates().catch(() => {});
    check();
    setInterval(check, 4 * 60 * 60 * 1000);
}

// ========================================================
// IMPRESORA DE TICKETS: se elige por nombre (no depende de la predeterminada de Windows)
// ========================================================
const configPath = () => path.join(app.getPath('userData'), 'config.json');
function readConfig() {
    try { return JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch (_) { return {}; }
}
function writeConfig(cfg) {
    try { fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2)); } catch (e) { console.error('Config:', e.message); }
}

// La elegida en el menú; si no hay, una que parezca térmica (TICKETS, EPSON, TM-, POS...); si no, la predeterminada.
async function resolveTicketPrinter() {
    const printers = mainWindow ? await mainWindow.webContents.getPrintersAsync() : [];
    const chosen = readConfig().ticketPrinter;
    if (chosen && printers.some(p => p.name === chosen)) return { name: chosen, how: 'elegida' };
    const thermal = printers.find(p => /ticket|epson|tm-|pos|t[eé]rmica|80 ?mm/i.test(p.name));
    if (thermal) return { name: thermal.name, how: 'detectada' };
    const def = printers.find(p => p.isDefault);
    if (def) return { name: def.name, how: 'predeterminada' };
    return { name: null, how: 'ninguna' };
}

// Impresora de hojas carta (corte y reportes): la elegida; si no, la predeterminada de Windows si no es la de tickets;
// si no, cualquier otra impresora real. Nunca la de tickets ni las virtuales (PDF, XPS, OneNote, Fax).
const VIRTUAL_PRINTER = /pdf|xps|onenote|fax/i;
async function resolveReportPrinter() {
    const printers = mainWindow ? await mainWindow.webContents.getPrintersAsync() : [];
    const ticket = (await resolveTicketPrinter()).name;
    const chosen = readConfig().reportPrinter;
    if (chosen && printers.some(p => p.name === chosen)) return { name: chosen, how: 'elegida' };
    const usable = printers.filter(p => p.name !== ticket && !VIRTUAL_PRINTER.test(p.name));
    const def = usable.find(p => p.isDefault);
    if (def) return { name: def.name, how: 'predeterminada' };
    if (usable.length) return { name: usable[0].name, how: 'detectada' };
    return { name: null, how: 'ninguna' };
}

// Imprime HTML en una ventana oculta aparte (sin JavaScript): no depende de lo que haga la caja mientras tanto.
async function printHtml(html, options) {
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
    try {
        await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
        return await new Promise((resolve) => {
            win.webContents.print({ silent: true, printBackground: false, ...options },
                (ok, reason) => resolve({ ok, reason: ok ? null : `${reason || 'error'} (${options.deviceName})` }));
        });
    } catch (e) {
        return { ok: false, reason: e.message };
    } finally {
        setTimeout(() => { if (!win.isDestroyed()) win.destroy(); }, 1000);
    }
}

// Ticket térmico: el papel mide 80 mm y el largo es el del contenido (la página lo mide antes de enviarlo),
// así la impresora corta justo al terminar y no avanza papel en blanco.
ipcMain.handle('print-ticket', async (event, html, opts = {}) => {
    if (typeof html !== 'string' || html.length > 500000) return { ok: false, reason: 'Ticket inválido' };
    const printer = await resolveTicketPrinter();
    if (!printer.name) return { ok: false, reason: 'No hay impresoras instaladas en Windows' };
    const heightMm = Number(opts.heightMm);
    const pageSize = heightMm >= 20 && heightMm <= 3000 ? { width: 80000, height: Math.ceil(heightMm * 1000) } : undefined;
    return printHtml(html, { deviceName: printer.name, margins: { marginType: 'none' }, ...(pageSize ? { pageSize } : {}) });
});

// Corte y reportes en hoja carta, en la impresora de hojas (nunca en la de tickets).
ipcMain.handle('print-report', async (event, html) => {
    if (typeof html !== 'string' || html.length > 2000000) return { ok: false, reason: 'Reporte inválido' };
    const printer = await resolveReportPrinter();
    if (!printer.name) return { ok: false, reason: 'No hay impresora de hojas. Elígela en el icono del POS junto al reloj → Impresora de hojas (carta).' };
    return printHtml(html, { deviceName: printer.name, pageSize: 'Letter', margins: { marginType: 'default' } });
});

// Guardar el reporte como PDF (en Documentos\Cortes La Estampida) y mostrarlo en su carpeta.
ipcMain.handle('save-report-pdf', async (event, html, fileName) => {
    if (typeof html !== 'string' || html.length > 2000000) return { ok: false, reason: 'Reporte inválido' };
    const safeName = String(fileName || 'Reporte').replace(/[^\w\- ]+/g, '_').slice(0, 80) + '.pdf';
    const dir = path.join(app.getPath('documents'), 'Cortes La Estampida');
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
    try {
        await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
        const pdf = await win.webContents.printToPDF({ pageSize: 'Letter', printBackground: true });
        fs.mkdirSync(dir, { recursive: true });
        const dest = path.join(dir, safeName);
        fs.writeFileSync(dest, pdf);
        shell.showItemInFolder(dest);
        return { ok: true, path: dest };
    } catch (e) {
        return { ok: false, reason: e.message };
    } finally {
        if (!win.isDestroyed()) win.destroy();
    }
});

function createSplash() {
    splash = new BrowserWindow({ width: 450, height: 550, frame: false, resizable: false, alwaysOnTop: true, backgroundColor: '#1a1a1a' });
    splash.loadFile(path.join(app.getAppPath(), 'splash.html'));
}

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1366, height: 768, show: false, backgroundColor: '#1a1a1a',
        autoHideMenuBar: true,
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.js') }
    });
    mainWindow.maximize();
    mainWindow.loadURL(`http://localhost:${PORT}`);
    mainWindow.once('ready-to-show', () => {
        if (splash) { splash.close(); splash = null; }
        mainWindow.show();
    });
    // Cerrar la ventana no apaga el servidor: los meseros siguen conectados. Se oculta a la bandeja.
    mainWindow.on('close', (e) => {
        if (!quitting) { e.preventDefault(); mainWindow.hide(); }
    });
}

function createTray() {
    const iconPath = path.join(app.getAppPath(), 'public', 'logo.jpg');
    tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }));
    tray.setToolTip('POS La Estampida (servidor activo)');
    buildTrayMenu();
    tray.on('double-click', () => { mainWindow.show(); mainWindow.focus(); });
}

async function buildTrayMenu() {
    let printers = [];
    try { printers = await mainWindow.webContents.getPrintersAsync(); } catch (_) {}
    const current = (await resolveTicketPrinter()).name;
    const currentReport = (await resolveReportPrinter()).name;
    const printerList = (key, selected) => printers.length
        ? printers.map(p => ({
            label: p.name, type: 'radio', checked: p.name === selected,
            click: () => { writeConfig({ ...readConfig(), [key]: p.name }); buildTrayMenu(); }
        }))
        : [{ label: 'No hay impresoras en Windows', enabled: false }];
    const printerItems = printerList('ticketPrinter', current);
    const reportItems = printerList('reportPrinter', currentReport);
    const updateItems = pendingUpdate
        ? [{ label: `⬆️ Instalar actualización v${pendingUpdate.version} (reinicia el POS)`, click: confirmInstallUpdate }, { type: 'separator' }]
        : [];
    tray.setContextMenu(Menu.buildFromTemplate([
        ...updateItems,
        { label: 'Abrir caja', click: () => { mainWindow.show(); mainWindow.focus(); } },
        { label: 'Dirección para celulares', click: showPhoneAddress },
        { label: 'Diagnóstico', click: showDiagnostics },
        { label: 'Impresora de tickets', submenu: [...printerItems, { type: 'separator' }, { label: 'Actualizar lista', click: buildTrayMenu }] },
        { label: 'Impresora de hojas (carta)', submenu: [...reportItems, { type: 'separator' }, { label: 'Actualizar lista', click: buildTrayMenu }] },
        { label: 'Abrir carpeta de respaldos', click: () => shell.openPath(path.join(app.getPath('userData'), 'respaldos')) },
        { label: 'Abrir carpeta de registros (errores)', click: () => shell.openPath(logsDir || app.getPath('userData')) },
        { type: 'separator' },
        { label: 'Salir (desconecta a los meseros)', click: confirmQuit }
    ]));
}

// Direcciones por las que los celulares pueden entrar (red local).
function lanUrls() {
    const urls = [];
    for (const list of Object.values(os.networkInterfaces())) {
        for (const i of list || []) {
            if (i.family === 'IPv4' && !i.internal) urls.push(`http://${i.address}:${PORT}`);
        }
    }
    return urls;
}

function showPhoneAddress() {
    const urls = lanUrls();
    dialog.showMessageBox(mainWindow, {
        type: 'info', title: 'Dirección para celulares', buttons: ['Cerrar'],
        message: urls.length ? 'Los meseros deben abrir esta dirección en el navegador del celular:' : 'No se detectó conexión a una red.',
        detail: urls.length ? urls.join('\n') + '\n\nEl celular debe estar conectado al mismo Wi-Fi que esta PC.' : 'Conecta esta PC al Wi-Fi o a la red del local.'
    });
}

// Resumen para soporte: permite ver de un vistazo si todo está en orden sin abrir carpetas.
async function showDiagnostics() {
    const dataDir = app.getPath('userData');
    const lines = [`Versión: ${app.getVersion()}`, `Datos: ${dataDir}`];
    try {
        const st = fs.statSync(path.join(dataDir, 'pos_restaurante.db'));
        lines.push(`Base de datos: ${(st.size / 1024).toFixed(0)} KB (modificada ${st.mtime.toLocaleString()})`);
    } catch (_) { lines.push('Base de datos: NO ENCONTRADA'); }
    try {
        const backups = fs.readdirSync(path.join(dataDir, 'respaldos')).filter(f => f.startsWith('auto_')).sort();
        lines.push(`Último respaldo: ${backups.length ? backups[backups.length - 1] : 'ninguno'}`);
    } catch (_) { lines.push('Último respaldo: ninguno'); }
    const urls = lanUrls();
    lines.push(`Celulares: ${urls.length ? urls.join('  ') : 'sin red detectada'}`);
    try {
        const printers = await mainWindow.webContents.getPrintersAsync();
        const ticket = await resolveTicketPrinter();
        lines.push(`Impresora de tickets: ${ticket.name ? `${ticket.name} (${ticket.how})` : 'NINGUNA (los tickets no saldrán)'}`);
        const def = printers.find(p => p.isDefault);
        lines.push(`Impresora predeterminada de Windows: ${def ? def.name : 'ninguna'}`);
        lines.push(`Impresoras en Windows: ${printers.map(p => p.name).join(', ') || 'ninguna'}`);
        const report = await resolveReportPrinter();
        lines.push(`Impresora de hojas (corte): ${report.name ? `${report.name} (${report.how})` : 'NINGUNA (el corte no saldrá impreso)'}`);
    } catch (e) { lines.push(`Impresoras: error (${e.message})`); }
    dialog.showMessageBox(mainWindow, { type: 'info', title: 'Diagnóstico', buttons: ['Cerrar'], message: 'Diagnóstico del sistema', detail: lines.join('\n') });
}

async function confirmInstallUpdate() {
    const { response } = await dialog.showMessageBox({
        type: 'question', buttons: ['Después', 'Instalar ahora'], defaultId: 1, cancelId: 0,
        title: 'Actualización', message: `¿Instalar la versión ${pendingUpdate.version}?`,
        detail: 'El POS se cerrará unos segundos y volverá a abrir solo. Los meseros se reconectan al volver.'
    });
    if (response === 1) pendingUpdate.install();
}

async function confirmQuit() {
    const { response } = await dialog.showMessageBox({
        type: 'warning', buttons: ['Cancelar', 'Cerrar sistema'], defaultId: 0, cancelId: 0,
        title: 'Cerrar POS', message: '¿Cerrar el sistema?', detail: 'Los meseros perderán la conexión.'
    });
    if (response === 1) { quitting = true; app.quit(); }
}

app.whenReady().then(async () => {
    logsDir = setupLogging();
    createSplash();
    try {
        prepareDataDir();
        // Se requiere después de definir POS_DATA_DIR para que la BD se abra en la carpeta correcta.
        const { start } = require(path.join(app.getAppPath(), 'server.js'));
        await start(PORT);
        // Respaldo diario (copia consistente que incluye lo pendiente en el archivo -wal)
        // Se revisa cada hora: si la PC se queda encendida varios días, igual hay un respaldo por día
        const { dailyBackup } = require('../src/utils/backup');
        const backup = () => dailyBackup().catch(e => console.error('Respaldo automático falló:', e.message));
        backup();
        setInterval(backup, 60 * 60 * 1000);
        backendStarted = true;
    } catch (err) {
        dialog.showErrorBox('No se pudo iniciar el servidor',
            err.code === 'EADDRINUSE' ? `El puerto ${PORT} ya está en uso. ¿Hay otra copia del POS abierta?` : err.message);
        quitting = true; app.quit(); return;
    }
    createMainWindow();
    createTray();

    // Que el POS se abra solo al encender la PC (solo en la versión instalada).
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true });
    setupAutoUpdate();
});

app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { /* se mantiene vivo en la bandeja */ });
