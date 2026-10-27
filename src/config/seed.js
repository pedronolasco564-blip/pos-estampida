const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const { DB_PATH: dbPath } = require('./paths');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // 1. Insertar Mesas (Ejemplo: 5 mesas)
    const mesas = ['01', '02', '03', '04', '05'];
    const insertMesa = db.prepare(`INSERT OR IGNORE INTO tables (table_number) VALUES (?)`);
    mesas.forEach(m => insertMesa.run(m));
    insertMesa.finalize();

    // 2. Insertar Productos (Clasificados para la V1 de impresión)
    const productos = [
        { name: 'Tacos de Bistec (Orden)', price: 80, station: 'COCINA' },
        { name: 'Hamburguesa Clásica', price: 90, station: 'COCINA' },
        { name: 'Enchiladas Verdes', price: 95, station: 'COCINA' },
        { name: 'Salsa Roja Extra', price: 15, station: 'COCINA' },
        { name: 'Coca-Cola 600ml', price: 30, station: 'BARRA' },
        { name: 'Agua de Limón 1L', price: 40, station: 'BARRA' }
    ];

    const insertProducto = db.prepare(`INSERT INTO products (name, price, station) VALUES (?, ?, ?)`);
    productos.forEach(p => insertProducto.run(p.name, p.price, p.station));
    insertProducto.finalize();

    console.log('Base de datos poblada con mesas y productos iniciales.');
});

db.close();