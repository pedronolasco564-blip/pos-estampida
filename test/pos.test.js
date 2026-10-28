const os = require('os'), fs = require('fs'), path = require('path');
// Aísla los tests: usan una BD temporal, nunca la de producción.
process.env.POS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-test-'));
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const { app, server } = require('../server');
const { verifyAdminPin, hashPin } = require('../src/middleware/verifyPin');
const { dbGet, dbAll, dbRun, dbTransaction } = require('../src/utils/dbHelper');
const { calculateCorteData } = require('../src/services/reportService');

let testBaseUrl = '';
let testServer = null;
let adminToken = '';

before(async () => {
    await require('../src/config/db').ready;
    // Iniciar servidor en puerto efímero (0) para pruebas HTTP
    await new Promise((resolve) => {
        testServer = app.listen(0, '127.0.0.1', () => {
            const port = testServer.address().port;
            testBaseUrl = `http://127.0.0.1:${port}`;
            resolve();
        });
    });

    // Sesión de admin para las rutas protegidas: todas las peticiones de prueba la envían.
    const login = await fetch(`${testBaseUrl}/api/catalog/verify-pin`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: '1234' })
    });
    adminToken = (await login.json()).token;
    const rawFetch = global.fetch;
    global.fetch = (url, init = {}) => rawFetch(url, { ...init, headers: { Authorization: `Bearer ${adminToken}`, ...(init.headers || {}) } });
});

after(async () => {
    if (testServer) {
        await new Promise((resolve) => testServer.close(resolve));
    }
});

describe('Módulo de Seguridad - verifyPin', () => {
    test('Valida correctamente el PIN por defecto (1234)', async () => {
        const isValid = await verifyAdminPin('1234');
        assert.equal(isValid, true, 'El PIN 1234 debe ser válido por defecto');
    });

    test('Rechaza PINs incorrectos', async () => {
        const isValidWrong = await verifyAdminPin('0000');
        assert.equal(isValidWrong, false);

        const isValidEmpty = await verifyAdminPin('');
        assert.equal(isValidEmpty, false);

        const isValidNull = await verifyAdminPin(null);
        assert.equal(isValidNull, false);
    });

    test('hashPin genera un hash bcrypt verificable', async () => {
        const hash = await hashPin('1234');
        assert.match(hash, /^\$2[aby]\$/);
        assert.equal(await require('bcrypt').compare('1234', hash), true);
        assert.equal(await require('bcrypt').compare('0000', hash), false);
    });
});

describe('Utilidad de Base de Datos - dbHelper', () => {
    test('dbGet y dbAll retornan datos consistentes', async () => {
        const tables = await dbAll('SELECT * FROM tables');
        assert.ok(Array.isArray(tables));

        const countRow = await dbGet('SELECT COUNT(*) as count FROM tables');
        assert.ok(countRow);
        assert.equal(typeof countRow.count, 'number');
    });

    test('dbTransaction confirma cambios si la operación tiene éxito', async () => {
        const testTableName = 'TEST_TRANSACTION_COMMIT';
        await dbTransaction(async () => {
            await dbRun('INSERT INTO tables (table_number) VALUES (?)', [testTableName]);
        });

        const created = await dbGet('SELECT * FROM tables WHERE table_number = ?', [testTableName]);
        assert.ok(created);
        assert.equal(created.table_number, testTableName);

        // Limpieza
        await dbRun('DELETE FROM tables WHERE table_number = ?', [testTableName]);
    });

    test('dbTransaction revierte cambios con ROLLBACK si ocurre un error', async () => {
        const testTableName = 'TEST_TRANSACTION_FAIL';
        try {
            await dbTransaction(async () => {
                await dbRun('INSERT INTO tables (table_number) VALUES (?)', [testTableName]);
                throw new Error('Fallo provocado para rollback');
            });
        } catch (e) {
            assert.equal(e.message, 'Fallo provocado para rollback');
        }

        const shouldNotExist = await dbGet('SELECT * FROM tables WHERE table_number = ?', [testTableName]);
        assert.equal(shouldNotExist, undefined, 'La fila insertada antes del fallo debió ser revertida por el rollback');
    });
});

describe('Servicio de Reportes - calculateCorteData', () => {
    test('Calcula correctamente estructura del corte y clasificador comedor/llevar', async () => {
        const today = new Date().toISOString().split('T')[0];
        const { summary, orders } = await calculateCorteData(today);

        assert.ok(summary);
        assert.ok(Array.isArray(orders));
        assert.equal(typeof summary.total_general, 'number');
        assert.equal(typeof summary.total_efectivo, 'number');
        assert.equal(typeof summary.total_tarjeta, 'number');
        assert.equal(typeof summary.total_gastos, 'number');
        assert.equal(typeof summary.total_llevar, 'number', 'total_llevar debe ser numérico');
        assert.equal(typeof summary.total_comedor, 'number', 'total_comedor debe ser numérico');
        assert.equal(typeof summary.ventas_por_mesero, 'object');
    });
});

describe('Endpoints de API REST - Integración HTTP', () => {
    let testTableId = null;
    let testProductId = null;
    let testOrderId = null;

    test('GET /api/catalog/tables retorna array de mesas con active_folio y minutes_open', async () => {
        const res = await fetch(`${testBaseUrl}/api/catalog/tables`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.ok(Array.isArray(data.tables));
    });

    test('POST /api/catalog/tables crea una mesa y GET la refleja', async () => {
        const tableNumber = 'M99_TEST';
        const createRes = await fetch(`${testBaseUrl}/api/catalog/tables`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table_number: tableNumber })
        });
        assert.equal(createRes.status, 200);
        const createData = await createRes.json();
        assert.equal(createData.message, 'Mesa creada');

        const tablesRes = await fetch(`${testBaseUrl}/api/catalog/tables`);
        const tablesData = await tablesRes.json();
        const found = tablesData.tables.find(t => t.table_number === tableNumber);
        assert.ok(found);
        testTableId = found.id;
    });

    test('POST /api/catalog/verify-pin valida correctamente 1234 y rechaza otros', async () => {
        const okRes = await fetch(`${testBaseUrl}/api/catalog/verify-pin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin: '1234' })
        });
        assert.equal(okRes.status, 200);
        const okData = await okRes.json();
        assert.equal(okData.success, true);

        const failRes = await fetch(`${testBaseUrl}/api/catalog/verify-pin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin: '9999' })
        });
        assert.equal(failRes.status, 403);
    });

    test('Flujo completo de Orden: Crear, Consultar, Pagar y Verificar Balance', async () => {
        // Asegurar que existe al menos un producto para la prueba
        const prodRes = await fetch(`${testBaseUrl}/api/catalog/products`);
        const prodData = await prodRes.json();
        if (prodData.products && prodData.products.length > 0) {
            testProductId = prodData.products[0].id;
        } else {
            const newProd = await fetch(`${testBaseUrl}/api/catalog/products`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Producto Prueba', price: 50, station: 'COCINA', category: 'GENERAL' })
            });
            const prods = await (await fetch(`${testBaseUrl}/api/catalog/products`)).json();
            testProductId = prods.products[0].id;
        }

        // 1. Crear Orden
        const orderRes = await fetch(`${testBaseUrl}/api/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                table_id: testTableId,
                waiter_name: 'TestWaiter',
                items: [{ product_id: testProductId, quantity: 2, notes: 'Bien cocido', is_takeaway: false }],
                is_printed: false,
                guests: 2
            })
        });
        assert.equal(orderRes.status, 201);
        const orderData = await orderRes.json();
        assert.ok(orderData.orderId);
        testOrderId = orderData.orderId;

        // 2. Consultar Orden por ID
        const getRes = await fetch(`${testBaseUrl}/api/orders/${testOrderId}`);
        assert.equal(getRes.status, 200);
        const getData = await getRes.json();
        assert.equal(getData.order.id, testOrderId);
        assert.equal(getData.order.status, 'ABIERTA');
        assert.ok(getData.order.total > 0, 'El total debe estar calculado inmediatamente tras crear');
        assert.equal(getData.order.remaining_balance, getData.order.total);
        assert.equal(getData.order.items.length, 1);

        // 3. Pagar Orden parcialmente
        const partialPayment = Math.floor(getData.order.total / 2);
        const payRes1 = await fetch(`${testBaseUrl}/api/orders/${testOrderId}/pay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                payment_method: 'EFECTIVO',
                amount_paid: partialPayment,
                tip_amount: 10
            })
        });
        assert.equal(payRes1.status, 200);
        const payData1 = await payRes1.json();
        assert.equal(payData1.fully_paid, false);
        assert.equal(payData1.remaining_balance, getData.order.total - partialPayment);

        // 4. Liquidar Orden por completo
        const remainingToPay = payData1.remaining_balance;
        const payRes2 = await fetch(`${testBaseUrl}/api/orders/${testOrderId}/pay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                payment_method: 'TARJETA',
                amount_paid: remainingToPay,
                tip_amount: 5
            })
        });
        assert.equal(payRes2.status, 200);
        const payData2 = await payRes2.json();
        assert.equal(payData2.fully_paid, true);
        assert.equal(payData2.change, 0);

        // 5. Verificar que la orden quedó PAGADA y la mesa LIBRE
        const finalOrderRes = await fetch(`${testBaseUrl}/api/orders/${testOrderId}`);
        const finalOrder = (await finalOrderRes.json()).order;
        assert.equal(finalOrder.status, 'PAGADA');
        assert.equal(finalOrder.remaining_balance, 0);

        const tableCheckRes = await fetch(`${testBaseUrl}/api/catalog/tables`);
        const tableCheck = (await tableCheckRes.json()).tables.find(t => t.id === testTableId);
        assert.equal(tableCheck.status, 'LIBRE');
    });

    test('Limpieza final de mesa de pruebas', async () => {
        if (testTableId) {
            // Eliminar registros de orden creados para la prueba
            await dbRun('DELETE FROM order_items WHERE order_id = ?', [testOrderId]);
            await dbRun('DELETE FROM orders WHERE id = ?', [testOrderId]);
            await dbRun('DELETE FROM tables WHERE id = ?', [testTableId]);
        }
    });
});

describe('Módulo de Gastos y Auditoría', () => {
    let createdExpenseId = null;
    function getLocalDateString() {
        const fechaMexico = new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" });
        const d = new Date(fechaMexico);
        const anio = d.getFullYear();
        const mes = String(d.getMonth() + 1).padStart(2, '0');
        const dia = String(d.getDate()).padStart(2, '0');
        return `${anio}-${mes}-${dia}`;
    }
    const today = getLocalDateString();

    test('POST /api/reports/expenses registra un gasto correctamente', async () => {
        const res = await fetch(`${testBaseUrl}/api/reports/expenses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: 150, concept: 'Compra de Carbón', category: 'INSUMOS' })
        });
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.ok(data.expenseId);
        createdExpenseId = data.expenseId;
    });

    test('GET /api/reports/audit retorna los logs con el nuevo gasto', async () => {
        const res = await fetch(`${testBaseUrl}/api/reports/audit?date=${today}`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.ok(Array.isArray(data.logs));
        const found = data.logs.find(l => l.action === 'GASTO_REGISTRADO');
        assert.ok(found, 'Debe existir un log de auditoría para GASTO_REGISTRADO');
    });

    test('POST /api/reports/expenses/:id/delete elimina el gasto con PIN correcto', async () => {
        const res = await fetch(`${testBaseUrl}/api/reports/expenses/${createdExpenseId}/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin: '1234' })
        });
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.message, 'Gasto cancelado exitosamente');
    });
});


describe('Seguridad - sesión de administrador y red local', () => {
    const noAuth = { headers: { Authorization: '' } };
    const post = (path, body, init = {}) => fetch(`${testBaseUrl}${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(init.headers || {}) }, body: JSON.stringify(body)
    });

    test('Las rutas de administración rechazan peticiones sin token (401)', async () => {
        const reports = await fetch(`${testBaseUrl}/api/reports/corte`, noAuth);
        assert.equal(reports.status, 401);
        const create = await post('/api/catalog/waiters', { name: 'Intruso' }, noAuth);
        assert.equal(create.status, 401);
        const del = await fetch(`${testBaseUrl}/api/catalog/products/1`, { method: 'DELETE', ...noAuth });
        assert.equal(del.status, 401);
    });

    test('Un token inventado es rechazado y las rutas de mesero siguen abiertas', async () => {
        const fake = await fetch(`${testBaseUrl}/api/catalog/session`, { headers: { Authorization: 'Bearer abc123' } });
        assert.equal(fake.status, 401);
        const open = await fetch(`${testBaseUrl}/api/catalog/waiters`, noAuth);
        assert.equal(open.status, 200);
    });

    test('El token válido funciona y logout lo invalida', async () => {
        const login = await post('/api/catalog/verify-pin', { pin: '1234' });
        const { token } = await login.json();
        const auth = { headers: { Authorization: `Bearer ${token}` } };
        assert.equal((await fetch(`${testBaseUrl}/api/catalog/session`, auth)).status, 200);
        await fetch(`${testBaseUrl}/api/catalog/logout`, { method: 'POST', ...auth });
        assert.equal((await fetch(`${testBaseUrl}/api/catalog/session`, auth)).status, 401);
    });

    test('Cambiar el PIN realmente lo actualiza (bcrypt) y exige 4-8 dígitos', async () => {
        const short = await post('/api/catalog/settings/pin', { current_pin: '1234', new_pin: '12' });
        assert.equal(short.status, 400);

        const change = await post('/api/catalog/settings/pin', { current_pin: '1234', new_pin: '5678' });
        assert.equal(change.status, 200);
        assert.equal(await verifyAdminPin('5678'), true);
        assert.equal(await verifyAdminPin('1234'), false);

        const restore = await post('/api/catalog/settings/pin', { current_pin: '5678', new_pin: '1234' });
        assert.equal(restore.status, 200);
        assert.equal(await verifyAdminPin('1234'), true);
    });

    test('isLocalAddress acepta LAN/loopback y rechaza IPs públicas', () => {
        const { isLocalAddress } = require('../src/middleware/lanOnly');
        for (const ok of ['127.0.0.1', '::1', '::ffff:192.168.8.100', '10.0.0.5', '172.20.1.1']) assert.equal(isLocalAddress(ok), true, ok);
        for (const bad of ['8.8.8.8', '::ffff:200.10.10.10', '172.32.0.1', '', undefined]) assert.equal(isLocalAddress(bad), false, String(bad));
    });
});

describe('Borradores de orden (platillos sin enviar)', () => {
    let tableId;
    let productId;
    const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

    before(async () => {
        const name = `BORRADOR_${Date.now()}`;
        await dbRun('INSERT INTO tables (table_number) VALUES (?)', [name]);
        tableId = (await dbGet('SELECT id FROM tables WHERE table_number = ?', [name])).id;
        const prod = await dbGet('SELECT id FROM products LIMIT 1');
        productId = prod ? prod.id : (await dbRun(`INSERT INTO products (name, price, station) VALUES ('Prueba', 50, 'COCINA')`)).lastID;
    });

    after(async () => {
        await dbRun('DELETE FROM order_drafts WHERE table_id = ?', [tableId]);
        const orders = await dbAll('SELECT id FROM orders WHERE table_id = ?', [tableId]);
        for (const o of orders) await dbRun('DELETE FROM order_items WHERE order_id = ?', [o.id]);
        await dbRun('DELETE FROM orders WHERE table_id = ?', [tableId]);
        await dbRun('DELETE FROM tables WHERE id = ?', [tableId]);
    });

    test('Guarda el borrador de una mesa y lo devuelve igual', async () => {
        const items = [{ product_id: productId, name: 'Prueba', price: 50, quantity: 2, notes: 'sin cebolla', is_takeaway: false, station: 'COCINA', extra_price: 0 }];
        const save = await fetch(`${testBaseUrl}/api/orders/drafts/${tableId}`, json('PUT', { items, waiter_name: 'Pedro' }));
        assert.equal(save.status, 200);

        const data = await (await fetch(`${testBaseUrl}/api/orders/drafts/${tableId}`)).json();
        assert.equal(data.items.length, 1);
        assert.equal(data.items[0].quantity, 2);
        assert.equal(data.items[0].notes, 'sin cebolla');
        assert.equal(data.waiter_name, 'Pedro');

        const tables = (await (await fetch(`${testBaseUrl}/api/catalog/tables`)).json()).tables;
        assert.equal(tables.find(t => t.id === tableId).has_draft, 1);
    });

    test('Rechaza borradores con datos inválidos', async () => {
        const bad = await fetch(`${testBaseUrl}/api/orders/drafts/${tableId}`, json('PUT', { items: [{ product_id: 'x', quantity: -1 }] }));
        assert.equal(bad.status, 400);
        const noTable = await fetch(`${testBaseUrl}/api/orders/drafts/999999`, json('PUT', { items: [] }));
        assert.equal(noTable.status, 404);
    });

    test('Enviar la comanda borra el borrador de la mesa', async () => {
        const items = [{ product_id: productId, quantity: 2, notes: 'sin cebolla', is_takeaway: false, extra_price: 0 }];
        const create = await fetch(`${testBaseUrl}/api/orders`, json('POST', { table_id: tableId, waiter_name: 'Pedro', items, is_printed: false }));
        assert.equal(create.status, 201);

        const data = await (await fetch(`${testBaseUrl}/api/orders/drafts/${tableId}`)).json();
        assert.deepEqual(data.items, []);
        const tables = (await (await fetch(`${testBaseUrl}/api/catalog/tables`)).json()).tables;
        assert.equal(tables.find(t => t.id === tableId).has_draft, 0);
    });

    test('Una lista vacía elimina el borrador', async () => {
        const items = [{ product_id: productId, name: 'Prueba', price: 50, quantity: 1 }];
        await fetch(`${testBaseUrl}/api/orders/drafts/${tableId}`, json('PUT', { items }));
        await fetch(`${testBaseUrl}/api/orders/drafts/${tableId}`, json('PUT', { items: [] }));
        const row = await dbGet('SELECT 1 FROM order_drafts WHERE table_id = ?', [tableId]);
        assert.equal(row, undefined);
    });
});

describe('Conteo de caja y reporte mensual', () => {
    const cash = require('../src/services/cashService');
    const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let today;

    before(async () => { today = (await dbGet(`SELECT date('now', '-6 hours') AS d`)).d; });

    test('La fórmula reproduce la hoja de Excel del 26-10 (fondo 407, venta 9,324, gastos 9,385)', () => {
        const esperado = cash.expectedCash(407, { total_efectivo: 9324, total_gastos: 9385, propinas_tarjeta: 0 });
        assert.equal(esperado, 346);
        // 2 billetes de $20 + monedas 16x$10, 18x$5, 24x$2, 33x$1 = $371 contados
        assert.equal(371 - esperado, 25);
    });

    test('Guardar conteo calcula contado/esperado/diferencia y deja el fondo de mañana', async () => {
        const corte = await (await fetch(`${testBaseUrl}/api/reports/corte?date=${today}`)).json();
        const fondoHoy = cash.expectedCash(0, corte.summary); // sin fondo capturado hoy en la BD de pruebas
        const denominations = { b20: 2, m10: 16, m5: 18, m2: 24, m1: 33 };
        const res = await fetch(`${testBaseUrl}/api/reports/cash-count`, json('POST', { date: today, denominations, next_fondo: 331 }));
        assert.equal(res.status, 200);
        const r = await res.json();
        assert.equal(r.counted, 371);
        assert.equal(r.expected, fondoHoy);
        assert.equal(r.difference, Math.round((371 - fondoHoy) * 100) / 100);

        const saved = (await (await fetch(`${testBaseUrl}/api/reports/cash-count?date=${today}`)).json()).count;
        assert.deepEqual(saved.denominations, denominations);
        const fondoManana = await (await fetch(`${testBaseUrl}/api/reports/fondo?date=${cash.nextDate(today)}`)).json();
        assert.equal(fondoManana.fondo, 331);
    });

    test('Rechaza conteos inválidos', async () => {
        const bad = await fetch(`${testBaseUrl}/api/reports/cash-count`, json('POST', { date: today, denominations: { b20: -3 } }));
        assert.equal(bad.status, 400);
        const badDate = await fetch(`${testBaseUrl}/api/reports/cash-count`, json('POST', { date: 'hoy', denominations: {} }));
        assert.equal(badDate.status, 400);
    });

    test('El reporte mensual incluye el día con su conteo y totales', async () => {
        const month = today.slice(0, 7);
        const rep = await (await fetch(`${testBaseUrl}/api/reports/monthly?month=${month}`)).json();
        const day = rep.days.find(d => d.date === today);
        assert.ok(day, 'el día de hoy aparece en el reporte');
        assert.equal(day.contado, 371);
        assert.equal(rep.totals.dias_contados >= 1, true);
        assert.equal(rep.totals.total, Math.round(rep.days.reduce((a, d) => a + d.total, 0) * 100) / 100);
    });

    test('Descarga el Excel del mes (.xlsx válido)', async () => {
        const res = await fetch(`${testBaseUrl}/api/reports/monthly.xlsx?month=${today.slice(0, 7)}`);
        assert.equal(res.status, 200);
        const buf = Buffer.from(await res.arrayBuffer());
        assert.equal(buf.slice(0, 2).toString(), 'PK'); // los .xlsx son archivos zip
        const ExcelJS = require('exceljs');
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buf);
        assert.equal(wb.worksheets.length, 2);
    });

    test('Sin sesión de admin no se puede ver ni guardar', async () => {
        const res = await fetch(`${testBaseUrl}/api/reports/monthly?month=${today.slice(0, 7)}`, { headers: { Authorization: '' } });
        assert.equal(res.status, 401);
    });
});

describe('Folios separados: comedor (#N) y para llevar (LL-0001)', () => {
    const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const created = [];
    let comedorId, llevarId, productId;

    before(async () => {
        const stamp = Date.now();
        comedorId = (await dbRun('INSERT INTO tables (table_number) VALUES (?)', [`FOLIO_C_${stamp}`])).lastID;
        llevarId = (await dbRun('INSERT INTO tables (table_number) VALUES (?)', [`LLEVAR FOLIO ${stamp}`])).lastID;
        const prod = await dbGet('SELECT id FROM products LIMIT 1');
        productId = prod ? prod.id : (await dbRun(`INSERT INTO products (name, price, station) VALUES ('Prueba', 50, 'COCINA')`)).lastID;
    });

    after(async () => {
        for (const id of created) {
            await dbRun('DELETE FROM order_items WHERE order_id = ?', [id]);
            await dbRun('DELETE FROM orders WHERE id = ?', [id]);
        }
        await dbRun('DELETE FROM tables WHERE id IN (?, ?)', [comedorId, llevarId]);
    });

    const crear = async (tableId) => {
        const res = await fetch(`${testBaseUrl}/api/orders`, json('POST', { table_id: tableId, waiter_name: 'Pedro', items: [{ product_id: productId, quantity: 1 }], is_printed: false }));
        assert.equal(res.status, 201);
        const r = await res.json();
        created.push(r.orderId);
        return r;
    };
    const cobrar = async (orderId) => {
        const ord = (await (await fetch(`${testBaseUrl}/api/orders/${orderId}`)).json()).order;
        await fetch(`${testBaseUrl}/api/orders/${orderId}/pay`, json('POST', { payment_method: 'EFECTIVO', amount_paid: ord.total }));
    };

    test('Para llevar usa LL-#### y comedor su propio número, sin huecos entre sí', async () => {
        const c1 = await crear(comedorId); await cobrar(c1.orderId);
        const l1 = await crear(llevarId); await cobrar(l1.orderId);
        const l2 = await crear(llevarId); await cobrar(l2.orderId);
        const c2 = await crear(comedorId);

        assert.match(c1.folio, /^#\d+$/);
        assert.match(l1.folio, /^LL-\d{4}$/);
        assert.equal(Number(l2.folio.slice(3)), Number(l1.folio.slice(3)) + 1);
        // Los pedidos para llevar de en medio no dejan hueco en el comedor
        assert.equal(Number(c2.folio.slice(1)), Number(c1.folio.slice(1)) + 1);
    });

    test('El folio aparece en la cuenta, la mesa y el corte', async () => {
        const order = (await (await fetch(`${testBaseUrl}/api/orders/table/${comedorId}`)).json()).order;
        assert.match(order.folio, /^#\d+$/);
        const table = (await (await fetch(`${testBaseUrl}/api/catalog/tables`)).json()).tables.find(t => t.id === comedorId);
        assert.equal(table.active_folio_label, order.folio);
        const today = (await dbGet(`SELECT date('now', '-6 hours') AS d`)).d;
        const corte = await (await fetch(`${testBaseUrl}/api/reports/corte?date=${today}`)).json();
        assert.ok(corte.orders.some(o => /^LL-\d{4}$/.test(o.folio)), 'el corte muestra folios LL-');
    });

    test('Un folio cancelado no se vuelve a usar', async () => {
        const c = await crear(llevarId);
        const cancel = await fetch(`${testBaseUrl}/api/orders/${c.orderId}/cancel-order`, json('POST', { pin: '1234', reason: 'PRUEBA' }));
        assert.equal(cancel.status, 200);
        const siguiente = await crear(llevarId);
        assert.equal(Number(siguiente.folio.slice(3)), Number(c.folio.slice(3)) + 1);
    });
});

describe('Categorías editables', () => {
    const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const stamp = Date.now();
    const A = `CAT_A_${stamp}`, B = `CAT_B_${stamp}`, A2 = `CAT_A2_${stamp}`;
    const lista = async () => (await (await fetch(`${testBaseUrl}/api/catalog/categories`)).json()).categories;
    const buscar = async (name) => (await lista()).find(c => c.name === name);
    let productId;

    before(async () => {
        await fetch(`${testBaseUrl}/api/catalog/categories`, json('POST', { name: A }));
        await fetch(`${testBaseUrl}/api/catalog/categories`, json('POST', { name: B }));
        productId = (await dbRun(`INSERT INTO products (name, price, station, category) VALUES ('Plat cat', 10, 'COCINA', ?)`, [A])).lastID;
    });

    after(async () => {
        await dbRun('DELETE FROM products WHERE id = ?', [productId]);
        await dbRun('DELETE FROM categories WHERE name IN (?, ?, ?)', [A, B, A2]);
    });

    test('Las nuevas van al final y se reportan con su número de platillos', async () => {
        const cats = await lista();
        assert.equal(cats[cats.length - 1].name, B);
        assert.equal((await buscar(A)).product_count, 1);
    });

    test('Renombrar mueve sus platillos al nombre nuevo y rechaza duplicados', async () => {
        const a = await buscar(A);
        const dup = await fetch(`${testBaseUrl}/api/catalog/categories/${a.id}`, json('PUT', { name: B }));
        assert.equal(dup.status, 400);
        const ok = await fetch(`${testBaseUrl}/api/catalog/categories/${a.id}`, json('PUT', { name: A2 }));
        assert.equal(ok.status, 200);
        assert.equal((await dbGet('SELECT category FROM products WHERE id = ?', [productId])).category, A2);
    });

    test('No se borra una categoría con platillos; vacía sí', async () => {
        const a2 = await buscar(A2);
        assert.equal((await fetch(`${testBaseUrl}/api/catalog/categories/${a2.id}`, { method: 'DELETE' })).status, 400);
        const b = await buscar(B);
        assert.equal((await fetch(`${testBaseUrl}/api/catalog/categories/${b.id}`, { method: 'DELETE' })).status, 200);
        assert.equal(await buscar(B), undefined);
    });

    test('Reordenar cambia el orden de la lista', async () => {
        const ids = (await lista()).map(c => c.id).reverse();
        assert.equal((await fetch(`${testBaseUrl}/api/catalog/categories/order`, json('PUT', { ids }))).status, 200);
        assert.deepEqual((await lista()).map(c => c.id), ids);
    });

    test('Sin sesión de administrador no se pueden modificar', async () => {
        const a2 = await buscar(A2);
        const sinToken = { 'Content-Type': 'application/json', Authorization: '' };
        const res = await fetch(`${testBaseUrl}/api/catalog/categories/${a2.id}`, { method: 'PUT', headers: sinToken, body: JSON.stringify({ name: 'X' }) });
        assert.equal(res.status, 401);
        assert.equal((await fetch(`${testBaseUrl}/api/catalog/categories/${a2.id}`, { method: 'DELETE', headers: { Authorization: '' } })).status, 401);
    });
});

describe('Auditoría con hora local', () => {
    test('Los movimientos de órdenes se registran con la hora local, igual que los gastos', async () => {
        const stamp = Date.now();
        const tableId = (await dbRun('INSERT INTO tables (table_number) VALUES (?)', [`AUD_${stamp}`])).lastID;
        const prod = await dbGet('SELECT id FROM products LIMIT 1');
        const res = await fetch(`${testBaseUrl}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table_id: tableId, waiter_name: 'Pedro', items: [{ product_id: prod.id, quantity: 1 }], is_printed: false }) });
        const { orderId } = await res.json();
        try {
            const row = await dbGet(`SELECT created_at, details,
                ABS(strftime('%s', created_at) - strftime('%s', datetime('now', '-6 hours'))) AS diff
                FROM audit_logs WHERE action = 'CREAR_ORDEN' ORDER BY id DESC LIMIT 1`);
            assert.ok(row.diff < 120, `hora registrada ${row.created_at}`);
            assert.ok(row.details.includes(`AUD_${stamp}`), 'muestra el nombre de la mesa');
        } finally {
            await dbRun('DELETE FROM order_items WHERE order_id = ?', [orderId]);
            await dbRun('DELETE FROM orders WHERE id = ?', [orderId]);
            await dbRun('DELETE FROM tables WHERE id = ?', [tableId]);
        }
    });
});

describe('Dinero exacto, migraciones y respaldos', () => {
    const { toCents, round2, sumMoney } = require('../src/utils/money');
    const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

    test('Utilidad de dinero: sin errores de punto flotante', () => {
        assert.equal(round2(100.10 - 33.37), 66.73);
        assert.equal(toCents(1.005), 101);
        assert.equal(sumMoney(0.1, 0.2), 0.3);
        assert.equal(round2('abc'), 0);
    });

    test('Abonos con centavos liquidan la cuenta exacta y liberan la mesa', async () => {
        const stamp = Date.now();
        const tableId = (await dbRun('INSERT INTO tables (table_number) VALUES (?)', [`DIN_${stamp}`])).lastID;
        const productId = (await dbRun(`INSERT INTO products (name, price, station, category) VALUES ('Centavos', 33.37, 'COCINA', 'GENERAL')`)).lastID;
        const { orderId } = await (await fetch(`${testBaseUrl}/api/orders`, json('POST', { table_id: tableId, waiter_name: 'Pedro', items: [{ product_id: productId, quantity: 3 }], is_printed: false }))).json();
        try {
            // 3 x 33.37 = 100.11; se paga en tres partes "redondeadas hacia arriba" como lo sugiere la caja
            const pagar = async (monto) => (await fetch(`${testBaseUrl}/api/orders/${orderId}/pay`, json('POST', { payment_method: 'EFECTIVO', amount_paid: monto }))).json();
            const r1 = await pagar(33.37);
            assert.equal(r1.remaining_balance, 66.74);
            const r2 = await pagar(33.37);
            assert.equal(r2.remaining_balance, 33.37);
            const r3 = await pagar(33.37);
            assert.equal(r3.fully_paid, true);
            assert.equal(r3.change, 0);
            const mesa = await dbGet('SELECT status FROM tables WHERE id = ?', [tableId]);
            assert.equal(mesa.status, 'LIBRE');
        } finally {
            await dbRun('DELETE FROM order_items WHERE order_id = ?', [orderId]);
            await dbRun('DELETE FROM orders WHERE id = ?', [orderId]);
            await dbRun('DELETE FROM products WHERE id = ?', [productId]);
            await dbRun('DELETE FROM tables WHERE id = ?', [tableId]);
        }
    });

    test('La BD queda en la última versión de migraciones', async () => {
        const { LATEST_VERSION } = require('../src/config/migrations');
        assert.equal((await dbGet('PRAGMA user_version')).user_version, LATEST_VERSION);
    });

    test('El respaldo diario genera una copia legible de la BD', async () => {
        const { dailyBackup, localDate, BACKUP_DIR } = require('../src/utils/backup');
        await dailyBackup();
        const file = path.join(BACKUP_DIR, `auto_${localDate()}.db`);
        assert.ok(fs.existsSync(file));
        const sqlite3 = require('sqlite3');
        const copia = new sqlite3.Database(file, sqlite3.OPEN_READONLY);
        const n = await new Promise((res, rej) => copia.get('SELECT COUNT(*) AS n FROM orders', (e, r) => (e ? rej(e) : res(r.n))));
        copia.close();
        assert.equal(n, (await dbGet('SELECT COUNT(*) AS n FROM orders')).n);
    });
});

describe('Tickets: WhatsApp de facturación y corte', () => {
    const json = (method, body, headers = {}) => ({ method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

    test('El número de WhatsApp tiene un valor inicial y solo el administrador lo cambia', async () => {
        const inicial = await (await fetch(`${testBaseUrl}/api/catalog/ticket-config`)).json();
        assert.ok(inicial.whatsapp);
        assert.equal((await fetch(`${testBaseUrl}/api/catalog/ticket-config`, json('PUT', { whatsapp: '287 000 1111' }, { Authorization: '' }))).status, 401);
        assert.equal((await fetch(`${testBaseUrl}/api/catalog/ticket-config`, json('PUT', { whatsapp: 'abc' }))).status, 400);
        assert.equal((await fetch(`${testBaseUrl}/api/catalog/ticket-config`, json('PUT', { whatsapp: '287 000 1111' }))).status, 200);
        assert.equal((await (await fetch(`${testBaseUrl}/api/catalog/ticket-config`)).json()).whatsapp, '287 000 1111');
        await fetch(`${testBaseUrl}/api/catalog/ticket-config`, json('PUT', { whatsapp: inicial.whatsapp }));
    });

    test('El corte avisa cuántas mesas siguen abiertas', async () => {
        const today = (await dbGet(`SELECT date('now', '-6 hours') AS d`)).d;
        const corte = await (await fetch(`${testBaseUrl}/api/reports/corte?date=${today}`)).json();
        assert.equal(typeof corte.open_tables, 'number');
    });
});

describe('Robustez: peticiones simultáneas', () => {
    const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const mesas = [], ordenes = [];
    let productId;

    before(async () => {
        const stamp = Date.now();
        for (let i = 0; i < 15; i++) mesas.push((await dbRun('INSERT INTO tables (table_number) VALUES (?)', [`SIM_${stamp}_${i}`])).lastID);
        productId = (await dbRun(`INSERT INTO products (name, price, station, category) VALUES ('Simultáneo', 100, 'COCINA', 'GENERAL')`)).lastID;
    });

    after(async () => {
        for (const id of ordenes) { await dbRun('DELETE FROM order_items WHERE order_id = ?', [id]); await dbRun('DELETE FROM orders WHERE id = ?', [id]); }
        await dbRun(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE table_id IN (${mesas.join(',')}))`);
        await dbRun(`DELETE FROM orders WHERE table_id IN (${mesas.join(',')})`);
        await dbRun(`DELETE FROM tables WHERE id IN (${mesas.join(',')})`);
        await dbRun('DELETE FROM products WHERE id = ?', [productId]);
    });

    test('15 órdenes enviadas al mismo tiempo se guardan completas', async () => {
        const res = await Promise.all(mesas.map(t => fetch(`${testBaseUrl}/api/orders`, json('POST', { table_id: t, waiter_name: 'Pedro', items: [{ product_id: productId, quantity: 2 }], is_printed: false }))));
        const status = res.map(r => r.status);
        for (const r of res) { if (r.status === 201) ordenes.push((await r.json()).orderId); }
        assert.deepEqual(status, mesas.map(() => 201), `respuestas: ${status.join(',')}`);
        for (const t of mesas) {
            const o = await dbGet(`SELECT o.total, (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS n FROM orders o WHERE table_id = ? AND status = 'ABIERTA'`, [t]);
            assert.ok(o, `la mesa ${t} tiene su orden`);
            assert.equal(o.total, 200);
            assert.equal(o.n, 1);
        }
    });
});

describe('Robustez: reglas de cuentas', () => {
    const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const mesas = [];
    let productId;
    const stamp = Date.now();

    before(async () => {
        for (let i = 0; i < 4; i++) mesas.push((await dbRun('INSERT INTO tables (table_number) VALUES (?)', [`REG_${stamp}_${i}`])).lastID);
        productId = (await dbRun(`INSERT INTO products (name, price, station, category) VALUES ('Regla', 100, 'COCINA', 'GENERAL')`)).lastID;
    });
    after(async () => {
        const ids = mesas.join(',');
        await dbRun(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE table_id IN (${ids}))`);
        await dbRun(`DELETE FROM orders WHERE table_id IN (${ids})`);
        await dbRun(`DELETE FROM tables WHERE id IN (${ids})`);
        await dbRun('DELETE FROM products WHERE id = ?', [productId]);
    });

    const crear = (tableId, extra = {}) => fetch(`${testBaseUrl}/api/orders`, json('POST', { table_id: tableId, waiter_name: 'Pedro', items: [{ product_id: productId, quantity: 1 }], is_printed: false, ...extra }));
    const pagar = (orderId, monto) => fetch(`${testBaseUrl}/api/orders/${orderId}/pay`, json('POST', { payment_method: 'EFECTIVO', amount_paid: monto }));
    const abiertas = async (tableId) => (await dbGet(`SELECT COUNT(*) AS n FROM orders WHERE table_id = ? AND status = 'ABIERTA'`, [tableId])).n;

    test('Platillos inválidos o sin mesero se rechazan', async () => {
        assert.equal((await fetch(`${testBaseUrl}/api/orders`, json('POST', { table_id: mesas[0], waiter_name: 'Pedro', items: [{ product_id: productId, quantity: -3 }] }))).status, 400);
        assert.equal((await fetch(`${testBaseUrl}/api/orders`, json('POST', { table_id: mesas[0], waiter_name: 'Pedro', items: [] }))).status, 400);
        assert.equal((await fetch(`${testBaseUrl}/api/orders`, json('POST', { table_id: mesas[0], items: [{ product_id: productId, quantity: 1 }] }))).status, 400);
    });

    test('Dos dispositivos abriendo la misma mesa: una sola cuenta con todo', async () => {
        const [a, b] = await Promise.all([crear(mesas[0]), crear(mesas[0])]);
        assert.equal(a.status, 201); assert.equal(b.status, 201);
        assert.equal(await abiertas(mesas[0]), 1);
        const ra = await a.json(), rb = await b.json();
        assert.equal(ra.orderId, rb.orderId);
        assert.equal((await dbGet('SELECT total FROM orders WHERE id = ?', [ra.orderId])).total, 200);
    });

    test('Un envío repetido (misma clave) no duplica los platillos', async () => {
        const r1 = await (await crear(mesas[1], { request_id: `rep-${stamp}-abc` })).json();
        const r2 = await (await crear(mesas[1], { request_id: `rep-${stamp}-abc` })).json();
        assert.equal(r1.orderId, r2.orderId);
        assert.equal((await dbGet('SELECT total FROM orders WHERE id = ?', [r1.orderId])).total, 100);
    });

    test('No se cobra dos veces ni se agregan platillos a una cuenta cobrada', async () => {
        const { orderId } = await (await crear(mesas[2])).json();
        const [p1, p2] = await Promise.all([pagar(orderId, 100), pagar(orderId, 100)]);
        assert.deepEqual([p1.status, p2.status].sort(), [200, 409]);
        const o = await dbGet('SELECT cash_amount, amount_paid FROM orders WHERE id = ?', [orderId]);
        assert.equal(o.cash_amount, 100); assert.equal(o.amount_paid, 100);
        const add = await fetch(`${testBaseUrl}/api/orders/${orderId}/items`, json('POST', { items: [{ product_id: productId, quantity: 1 }] }));
        assert.equal(add.status, 409);
    });

    test('Reabrir y volver a cobrar no duplica el efectivo del corte', async () => {
        const o = await dbGet(`SELECT id FROM orders WHERE table_id = ? AND status = 'PAGADA'`, [mesas[2]]);
        assert.equal((await fetch(`${testBaseUrl}/api/orders/${o.id}/reopen`, json('POST', { pin: '1234' }))).status, 200);
        assert.equal((await pagar(o.id, 100)).status, 200);
        assert.equal((await dbGet('SELECT cash_amount FROM orders WHERE id = ?', [o.id])).cash_amount, 100);
    });

    test('No se transfiere a una mesa ocupada ni a la misma mesa', async () => {
        const { orderId } = await (await crear(mesas[3])).json();
        assert.equal((await fetch(`${testBaseUrl}/api/orders/${orderId}/transfer`, json('PUT', { new_table_id: mesas[0] }))).status, 409);
        assert.equal((await fetch(`${testBaseUrl}/api/orders/${orderId}/transfer`, json('PUT', { new_table_id: mesas[3] }))).status, 400);
        assert.equal(await abiertas(mesas[3]), 1);
        assert.equal((await dbGet('SELECT status FROM tables WHERE id = ?', [mesas[3]])).status, 'OCUPADA');
    });

    test('El precio queda guardado: cambiar el menú no altera la cuenta', async () => {
        const order = await dbGet(`SELECT id, total FROM orders WHERE table_id = ? AND status = 'ABIERTA'`, [mesas[3]]);
        await dbRun('UPDATE products SET price = 999 WHERE id = ?', [productId]);
        try {
            const det = (await (await fetch(`${testBaseUrl}/api/orders/${order.id}`)).json()).order;
            assert.equal(det.items[0].price, 100);
            const { updateOrderTotal } = require('../src/controllers/orderController');
            await updateOrderTotal(order.id);
            assert.equal((await dbGet('SELECT total FROM orders WHERE id = ?', [order.id])).total, 100);
        } finally {
            await dbRun('UPDATE products SET price = 100 WHERE id = ?', [productId]);
        }
    });

    test('Borrar un platillo usado en cuentas lo oculta sin romper las cuentas', async () => {
        const order = await dbGet(`SELECT id FROM orders WHERE table_id = ? AND status = 'PAGADA'`, [mesas[2]]);
        const tmpProd = (await dbRun(`INSERT INTO products (name, price, station, category) VALUES ('Temporal', 50, 'COCINA', 'GENERAL')`)).lastID;
        await dbRun(`INSERT INTO order_items (order_id, product_id, quantity, unit_price, paid) VALUES (?, ?, 1, 50, 1)`, [order.id, tmpProd]);
        assert.equal((await fetch(`${testBaseUrl}/api/catalog/products/${tmpProd}`, { method: 'DELETE' })).status, 200);
        const menu = (await (await fetch(`${testBaseUrl}/api/catalog/products`)).json()).products;
        assert.ok(!menu.some(p => p.id === tmpProd), 'ya no aparece en el menú');
        const det = (await (await fetch(`${testBaseUrl}/api/orders/${order.id}`)).json()).order;
        assert.ok(det.items.some(i => i.name === 'Temporal'), 'sigue en la cuenta');
    });

    test('El fondo rechaza montos inválidos y la API responde JSON ante errores', async () => {
        const bad = await fetch(`${testBaseUrl}/api/reports/fondo`, json('POST', { pin: '1234', date: '2026-01-01', amount: 'abc' }));
        assert.equal(bad.status, 400);
        const malformed = await fetch(`${testBaseUrl}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{roto' });
        assert.equal(malformed.status, 400);
        assert.ok((await malformed.json()).error);
        assert.equal((await fetch(`${testBaseUrl}/api/no-existe`)).status, 404);
    });
});

describe('Cuentas con abonos: nunca salen del corte', () => {
    const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let tableId, productId, orderId, itemId;

    before(async () => {
        tableId = (await dbRun('INSERT INTO tables (table_number) VALUES (?)', [`ABO_${Date.now()}`])).lastID;
        productId = (await dbRun(`INSERT INTO products (name, price, station, category) VALUES ('Abono', 100, 'COCINA', 'GENERAL')`)).lastID;
        orderId = (await (await fetch(`${testBaseUrl}/api/orders`, json('POST', { table_id: tableId, waiter_name: 'Pedro', items: [{ product_id: productId, quantity: 3 }], is_printed: false }))).json()).orderId;
        itemId = (await dbGet('SELECT id FROM order_items WHERE order_id = ?', [orderId])).id;
        await fetch(`${testBaseUrl}/api/orders/${orderId}/pay`, json('POST', { payment_method: 'EFECTIVO', amount_paid: 150 }));
    });
    after(async () => {
        await dbRun('DELETE FROM order_items WHERE order_id = ?', [orderId]);
        await dbRun('DELETE FROM orders WHERE id = ?', [orderId]);
        await dbRun('DELETE FROM tables WHERE id = ?', [tableId]);
        await dbRun('DELETE FROM products WHERE id = ?', [productId]);
    });

    test('No se cancela completa una cuenta con abonos', async () => {
        const r = await fetch(`${testBaseUrl}/api/orders/${orderId}/cancel-order`, json('POST', { pin: '1234', reason: 'PRUEBA' }));
        assert.equal(r.status, 409);
        assert.ok((await dbGet('SELECT id FROM orders WHERE id = ?', [orderId])), 'la cuenta sigue existiendo');
    });

    test('Se cancela lo pendiente, pero no lo que ya cubrió el abono', async () => {
        const c1 = await fetch(`${testBaseUrl}/api/orders/${orderId}/cancel-item/${itemId}`, json('POST', { pin: '1234', reason: 'NO SALIÓ' }));
        assert.equal(c1.status, 200);
        assert.equal((await dbGet('SELECT remaining_balance FROM orders WHERE id = ?', [orderId])).remaining_balance, 50);
        const c2 = await fetch(`${testBaseUrl}/api/orders/${orderId}/cancel-item/${itemId}`, json('POST', { pin: '1234', reason: 'NO SALIÓ' }));
        assert.equal(c2.status, 409);
    });

    test('Un descuento no deja la cuenta por debajo de lo abonado; si la cubre, se cierra sola', async () => {
        const mucho = await fetch(`${testBaseUrl}/api/orders/${orderId}/discount`, json('POST', { pin: '1234', discount_amount: 60 }));
        assert.equal(mucho.status, 409);
        const justo = await fetch(`${testBaseUrl}/api/orders/${orderId}/discount`, json('POST', { pin: '1234', discount_amount: 50 }));
        assert.equal(justo.status, 200);
        assert.equal((await justo.json()).closed, true);
        const o = await dbGet('SELECT status, total, cash_amount, amount_paid, remaining_balance FROM orders WHERE id = ?', [orderId]);
        assert.deepEqual(o, { status: 'PAGADA', total: 150, cash_amount: 150, amount_paid: 150, remaining_balance: 0 });
        assert.equal((await dbGet('SELECT status FROM tables WHERE id = ?', [tableId])).status, 'LIBRE');
        const log = await dbGet(`SELECT details FROM audit_logs WHERE action = 'CUENTA_CERRADA' ORDER BY id DESC LIMIT 1`);
        assert.ok(log && log.details.includes('150'));
    });
});

describe('Copia de respaldo fuera de la PC', () => {
    const backup = require('../src/utils/backup');
    after(() => backup.setExternalDir(null));

    test('Copia el respaldo del día a la carpeta elegida y el panel lo muestra', async () => {
        const destino = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-usb-'));
        backup.setExternalDir(destino);
        await backup.dailyBackup();
        const copia = path.join(destino, backup.EXTERNAL_SUBDIR, `auto_${backup.localDate()}.db`);
        assert.ok(fs.existsSync(copia), 'el respaldo está en la carpeta externa');
        assert.equal(fs.statSync(copia).size, fs.statSync(path.join(backup.BACKUP_DIR, `auto_${backup.localDate()}.db`)).size);
        const st = await (await fetch(`${testBaseUrl}/api/reports/backup-status`)).json();
        assert.equal(st.external.ok, true);
        assert.equal(st.external.last_ok, backup.localDate());
    });

    test('Si la carpeta no está (USB desconectada) avisa sin detener el respaldo', async () => {
        backup.setExternalDir(path.join(os.tmpdir(), `no-existe-${Date.now()}`));
        await backup.dailyBackup();
        const st = await (await fetch(`${testBaseUrl}/api/reports/backup-status`)).json();
        assert.equal(st.external.ok, false);
        assert.match(st.external.error, /no está disponible/);
        assert.ok(st.last_backup, 'el respaldo local sigue funcionando');
    });

    test('Sin carpeta elegida, el panel indica que no hay copia externa', async () => {
        backup.setExternalDir(null);
        await backup.copyToExternal();
        const st = await (await fetch(`${testBaseUrl}/api/reports/backup-status`)).json();
        assert.equal(st.external, null);
    });
});
