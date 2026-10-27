const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto'); // Módulo de criptografía nativo

const { DB_PATH: dbPath } = require('./paths');
const { runMigrations } = require('./migrations');
// Se resuelve cuando tablas y datos iniciales existen (evita atender peticiones con una BD nueva a medio crear).
let resolveReady, rejectReady;
const ready = new Promise((res, rej) => { resolveReady = res; rejectReady = rej; });

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error al conectar a la base de datos:', err.message);
        rejectReady(err);
    } else { 
        console.log('Conectado a SQLite.'); 
        
        // 🛡️ ACTIVAR MODO WAL (Write-Ahead Logging)
        db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA temp_store = MEMORY;", (err) => {
            if (err) {
                console.error("Error al activar el escudo SQLite WAL:", err.message);
                rejectReady(err);
            } else {
                console.log("🛡️ Escudo Anti-Apagones (WAL) activado correctamente.");
                initDatabase(); // Arrancamos las tablas solo cuando el escudo esté arriba
            }
        });
    }
});


function initDatabase() {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS tables (id INTEGER PRIMARY KEY AUTOINCREMENT, table_number TEXT NOT NULL UNIQUE, status TEXT DEFAULT 'LIBRE')`);
        db.run(`CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, price REAL NOT NULL, station TEXT NOT NULL, category TEXT DEFAULT 'GENERAL', is_available INTEGER DEFAULT 1)`);
        
        db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT, table_id INTEGER, waiter_name TEXT NOT NULL, status TEXT DEFAULT 'ABIERTA',
        total REAL DEFAULT 0, remaining_balance REAL DEFAULT 0, tip_amount REAL DEFAULT 0, discount_amount REAL DEFAULT 0,
        payment_method TEXT, amount_paid REAL, change_amount REAL, 
        needs_invoice INTEGER DEFAULT 0, invoice_done INTEGER DEFAULT 0, guests INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP, closed_at DATETIME,
        FOREIGN KEY (table_id) REFERENCES tables(id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER, product_id INTEGER, quantity INTEGER NOT NULL, 
            notes TEXT, is_takeaway INTEGER DEFAULT 0, extra_price REAL DEFAULT 0, paid INTEGER DEFAULT 0, 
            FOREIGN KEY (order_id) REFERENCES orders(id), FOREIGN KEY (product_id) REFERENCES products(id)
        )`);
        
        db.run(`CREATE TABLE IF NOT EXISTS waiters (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE)`);
        db.run(`CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE)`);
        db.run(`CREATE TABLE IF NOT EXISTS modifiers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, price REAL DEFAULT 0)`);
        db.run(`CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, details TEXT, performed_by TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
        
        // NUEVA TABLA: Para guardar configuraciones seguras (como el PIN)
        db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
        // NUEVA TABLA: Sistema de Gastos y Retiros de Caja
        db.run(`CREATE TABLE IF NOT EXISTS expenses (id INTEGER PRIMARY KEY AUTOINCREMENT, amount REAL NOT NULL, concept TEXT NOT NULL, category TEXT, created_by TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

        // NUEVA TABLA: Conteo físico de caja por día (billetes/monedas), con fondo para el día siguiente
        db.run(`CREATE TABLE IF NOT EXISTS cash_counts (count_date TEXT PRIMARY KEY, denominations TEXT NOT NULL, counted REAL NOT NULL, expected REAL NOT NULL, difference REAL NOT NULL, next_fondo REAL, updated_at DATETIME)`);

        // NUEVA TABLA: Platillos tomados que aún no se envían a cocina (uno por mesa)
        db.run(`CREATE TABLE IF NOT EXISTS order_drafts (table_id INTEGER PRIMARY KEY, items TEXT NOT NULL, waiter_name TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (table_id) REFERENCES tables(id))`);

        db.run(`ALTER TABLE modifiers ADD COLUMN price REAL DEFAULT 0`, () => {});
        // Orden en que aparecen las categorías en la caja (las existentes conservan su orden de creación)
        db.run(`ALTER TABLE categories ADD COLUMN sort_order INTEGER`, () => {
            db.run(`UPDATE categories SET sort_order = id WHERE sort_order IS NULL`);
        });
        db.run(`ALTER TABLE order_items ADD COLUMN extra_price REAL DEFAULT 0`, () => {});
        db.run(`ALTER TABLE orders ADD COLUMN needs_invoice INTEGER DEFAULT 0`, () => {});
        db.run(`ALTER TABLE orders ADD COLUMN invoice_done INTEGER DEFAULT 0`, () => {});
        
        // 💡 REPARACIÓN: Columnas para rastrear pagos mixtos
        db.run(`ALTER TABLE orders ADD COLUMN cash_amount REAL DEFAULT 0`, () => {});
        // Folio propio por tipo: 'C' comedor (#35) y 'L' para llevar (LL-0001)
        db.run(`ALTER TABLE orders ADD COLUMN folio_type TEXT`, () => {});
        db.run(`ALTER TABLE orders ADD COLUMN folio_num INTEGER`, () => {
            db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_folio ON orders(folio_type, folio_num) WHERE folio_num IS NOT NULL`);
        });
        // El comedor continúa después del último número usado por el sistema anterior (incluye órdenes canceladas,
        // para no repetir números que ya aparecen en la auditoría). Solo se fija la primera vez.
        db.run(`INSERT OR IGNORE INTO settings (key, value)
                SELECT 'folio_seq_C', COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'orders'), (SELECT MAX(id) FROM orders), 0)`);
        db.run(`ALTER TABLE orders ADD COLUMN card_amount REAL DEFAULT 0`, () => {});
        // Auditoría: órdenes y cambio de PIN se guardaban en UTC (6 h adelantadas); se corrigen una sola vez.
        db.run(`UPDATE audit_logs SET created_at = datetime(created_at, '-6 hours')
                WHERE action IN ('CREAR_ORDEN', 'AGREGAR_ITEMS', 'CANCELAR_PLATILLO', 'CANCELAR_ORDEN_COMPLETA', 'DESCUENTO_APLICADO', 'REABRIR_CUENTA', 'CAMBIO_PIN')
                  AND NOT EXISTS (SELECT 1 FROM settings WHERE key = 'audit_hora_local')`);
        db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('audit_hora_local', '1')`);

        // 📊 ÍNDICES para acelerar consultas frecuentes
        db.run(`CREATE INDEX IF NOT EXISTS idx_orders_table_status ON orders(table_id, status)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_orders_closed_at ON orders(closed_at)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_audit_logs_date ON audit_logs(created_at)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(created_at)`);

        seedInitialData();
    });
}

function seedInitialData() {
    db.get(`SELECT COUNT(*) as count FROM tables`, (err, row) => {
        if (row.count === 0) {
            const stmt = db.prepare(`INSERT INTO tables (table_number) VALUES (?)`);
            for (let i = 1; i <= 14; i++) stmt.run(i.toString().padStart(2, '0'));
            stmt.finalize();
        }
    });

    db.get(`SELECT COUNT(*) as count FROM waiters`, (err, row) => {
        if (row.count === 0) {
            const stmt = db.prepare(`INSERT INTO waiters (name) VALUES (?)`);
            ['Pedro', 'Martín'].forEach(name => stmt.run(name));
            stmt.finalize();
        }
    });

    // SEGURIDAD: Inyectamos el PIN encriptado si no existe
    db.get(`SELECT COUNT(*) as count FROM settings WHERE key = 'admin_pin'`, (err, row) => {
        if (row && row.count === 0) {
            const defaultHash = crypto.createHash('sha256').update('1234').digest('hex');
            db.run(`INSERT INTO settings (key, value) VALUES ('admin_pin', ?)`, [defaultHash], () => finishInit());
        } else {
            finishInit();
        }
    });
}

// Última etapa del arranque: migraciones versionadas (con respaldo previo) y BD lista.
function finishInit() {
    runMigrations(db).then(() => resolveReady()).catch((err) => {
        console.error('❌', err.message);
        rejectReady(err);
    });
}

db.ready = ready;

module.exports = db;