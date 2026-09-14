const orderController = require('./src/controllers/orderController');
const reportController = require('./src/controllers/reportController');

function fakeRes(nombre) {
    return {
        _status: 200,
        status(code) { this._status = code; return this; },
        json(obj) {
            console.log(`\n>>> RESPUESTA [${nombre}] status=${this._status}`);
            console.log(JSON.stringify(obj, null, 2));
        }
    };
}

// Esperar a que las migraciones asíncronas de db.js terminen antes de probar.
setTimeout(() => {
    console.log('=== 1) Pagando la orden ABIERTA #7 (mesa 2, total esperado 360) ===');
    orderController.payOrder(
        { params: { orderId: 7 }, body: { payment_method: 'EFECTIVO', amount_paid: 400 } },
        fakeRes('payOrder')
    );

    setTimeout(() => {
        console.log('\n=== 2) Corte de caja de HOY, después de pagar la #7 ===');
        reportController.getCorteDeCaja(
            { query: {} },
            fakeRes('getCorteDeCaja')
        );

        setTimeout(() => {
            console.log('\n=== 3) Corte de caja con fecha inválida (debe dar 400) ===');
            reportController.getCorteDeCaja(
                { query: { date: 'no-es-una-fecha' } },
                fakeRes('getCorteDeCaja-invalida')
            );
        }, 300);
    }, 500);
}, 1200);