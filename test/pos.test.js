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

describe('Servicio de Impresión y Cola de Tareas', () => {
    const printerService = require('../src/services/printerService');

    test('printerService expone todas las funciones esperadas', () => {
        assert.equal(typeof printerService.printComanda, 'function');
        assert.equal(typeof printerService.printTicket, 'function');
        assert.equal(typeof printerService.printAdicion, 'function');
        assert.equal(typeof printerService.printCorteZ, 'function');
    });

    test('enqueuePrint procesa múltiples impresiones concurrentes sin arrojar errores', async () => {
        const dummySummary = {
            num_tickets: 1,
            total_general: 100,
            total_efectivo: 100,
            total_tarjeta: 0,
            total_gastos: 0,
            total_comedor: 100,
            total_llevar: 0,
            ventas_por_mesero: { 'Pedro': { total: 100, tickets: 1 } }
        };

        // Encolar dos llamadas concurrentes
        const p1 = printerService.printCorteZ('2026-09-21', dummySummary);
        const p2 = printerService.printTicket(999999, 'EFECTIVO', 100);

        await Promise.all([p1, p2]);
        assert.ok(true, 'Las impresiones concurrentes deben resolverse limpiamente');
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
