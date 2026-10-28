const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config/paths');
const { dbRun } = require('./dbHelper');

const BACKUP_DIR = path.join(DATA_DIR, 'respaldos');
const KEEP_DAILY = 14;
const KEEP_EXTERNAL = 30;
const EXTERNAL_SUBDIR = 'Respaldos POS La Estampida';
const EXTERNAL_STATUS = path.join(BACKUP_DIR, 'copia-externa.json');
const DAILY_FILE = /^auto_\d{4}-\d{2}-\d{2}\.db$/;

// Fecha local YYYY-MM-DD (toISOString daría la fecha UTC, un día adelantada por la noche)
function localDate(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Copia consistente de la BD con VACUUM INTO: incluye lo que aún está en el archivo -wal,
// a diferencia de copiar el .db a mano (que pierde lo último si la PC se apagó de golpe).
async function backupTo(fileName) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const dest = path.join(BACKUP_DIR, fileName);
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
    await dbRun('VACUUM INTO ?', [dest]);
    return dest;
}

// ========================================================
// COPIA FUERA DE LA PC: los respaldos diarios también se copian a una carpeta elegida en el icono del POS
// (memoria USB, Google Drive u OneDrive). Si la PC se descompone, el respaldo sigue a salvo ahí.
// ========================================================
let externalDir = null;
const setExternalDir = (dir) => { externalDir = dir || null; };
const getExternalDir = () => externalDir;

function readExternalStatus() {
    try { return JSON.parse(fs.readFileSync(EXTERNAL_STATUS, 'utf8')); } catch (_) { return null; }
}
function writeExternalStatus(status) {
    try { fs.mkdirSync(BACKUP_DIR, { recursive: true }); fs.writeFileSync(EXTERNAL_STATUS, JSON.stringify(status, null, 2)); } catch (_) {}
}

// Copia los respaldos diarios que falten en la carpeta externa. Nunca lanza error: devuelve el estado.
async function copyToExternal() {
    const prev = readExternalStatus() || {};
    if (!externalDir) {
        const status = { configured: false };
        writeExternalStatus(status);
        return status;
    }
    const status = { configured: true, dir: externalDir, checked_at: new Date().toISOString(), last_ok: prev.dir === externalDir ? prev.last_ok || null : null };
    try {
        if (!fs.existsSync(externalDir)) throw new Error('La carpeta no está disponible (¿memoria USB desconectada?)');
        const dest = path.join(externalDir, EXTERNAL_SUBDIR);
        fs.mkdirSync(dest, { recursive: true });
        const local = fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR).filter(f => DAILY_FILE.test(f)).sort() : [];
        let copied = 0;
        for (const f of local) {
            const src = path.join(BACKUP_DIR, f);
            const out = path.join(dest, f);
            if (fs.existsSync(out) && fs.statSync(out).size === fs.statSync(src).size) continue;
            // Se copia con otro nombre y luego se renombra: Drive/OneDrive nunca suben un archivo a medias
            const tmp = `${out}.copiando`;
            fs.copyFileSync(src, tmp);
            fs.renameSync(tmp, out);
            copied++;
        }
        fs.readdirSync(dest).filter(f => DAILY_FILE.test(f)).sort().reverse().slice(KEEP_EXTERNAL)
            .forEach(f => fs.unlinkSync(path.join(dest, f)));
        const latest = local.length ? local[local.length - 1].slice(5, 15) : null;
        Object.assign(status, { ok: true, last_ok: latest, copied, error: null });
    } catch (e) {
        Object.assign(status, { ok: false, error: e.message });
        console.warn('Copia de respaldo fuera de la PC:', e.message);
    }
    writeExternalStatus(status);
    return status;
}

// Respaldo diario: uno por día (auto_YYYY-MM-DD.db), conserva los últimos 14; después se copia fuera de la PC.
async function dailyBackup() {
    const name = `auto_${localDate()}.db`;
    if (!fs.existsSync(path.join(BACKUP_DIR, name))) await backupTo(name);
    fs.readdirSync(BACKUP_DIR).filter(f => DAILY_FILE.test(f)).sort().reverse().slice(KEEP_DAILY)
        .forEach(f => fs.unlinkSync(path.join(BACKUP_DIR, f)));
    await copyToExternal();
}

module.exports = { backupTo, dailyBackup, localDate, BACKUP_DIR, setExternalDir, getExternalDir, copyToExternal, readExternalStatus, EXTERNAL_SUBDIR };
