const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config/paths');
const { dbRun } = require('./dbHelper');

const BACKUP_DIR = path.join(DATA_DIR, 'respaldos');
const KEEP_DAILY = 14;

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

// Respaldo diario: uno por día (auto_YYYY-MM-DD.db), conserva los últimos 14.
async function dailyBackup() {
    const name = `auto_${localDate()}.db`;
    if (!fs.existsSync(path.join(BACKUP_DIR, name))) await backupTo(name);
    fs.readdirSync(BACKUP_DIR).filter(f => /^auto_\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().reverse().slice(KEEP_DAILY)
        .forEach(f => fs.unlinkSync(path.join(BACKUP_DIR, f)));
}

module.exports = { backupTo, dailyBackup, localDate, BACKUP_DIR };
