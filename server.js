const express = require('express');
const path = require('path');
const http = require('http'); 
const { Server } = require('socket.io'); 

const db = require('./src/config/db');
const { lanOnly, isLocalAddress } = require('./src/middleware/lanOnly');
const catalogRoutes = require('./src/routes/catalogRoutes');
const orderRoutes = require('./src/routes/orderRoutes');
const reportRoutes = require('./src/routes/reportRoutes'); 

const app = express();
const server = http.createServer(app); 
// Sin CORS: el frontend se sirve desde este mismo servidor, así que ningún otro sitio web puede conectarse.
const io = new Server(server, { maxHttpBufferSize: 256 * 1024 });

// Solo dispositivos de la red local pueden usar el sistema.
io.use((socket, next) => {
    isLocalAddress(socket.handshake.address) ? next() : next(new Error('Acceso solo desde la red local'));
});

app.set('io', io); 

app.use(lanOnly);
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Cajas conectadas (pantallas abiertas en la PC). Se prefiere la app de escritorio y, entre varias, la más reciente,
// para que un ticket de celular se imprima una sola vez.
const cajas = new Map();
const isLoopback = (addr) => /^(::1|127\.|::ffff:127\.)/.test(String(addr || ''));
function pickCaja() {
    const list = [...cajas.values()].filter(c => c.socket.connected);
    list.sort((a, b) => (b.desktop - a.desktop) || (b.since - a.since));
    return list[0] || null;
}

io.on('connection', (socket) => {
    console.log('📱 Dispositivo enlazado en Tiempo Real');
    
    // Escucha la instrucción del mesero y avisa a la caja
    socket.on('payment-instruction', (data) => {
        if (!data || typeof data !== 'object') return;
        io.emit('receive-instruction', data);
    });
    // La pantalla de la caja (abierta en la misma PC) se registra para recibir los tickets de los celulares
    socket.on('soy-caja', (info) => {
        if (!isLoopback(socket.handshake.address)) return;
        cajas.set(socket.id, { socket, desktop: !!(info && info.desktop), since: Date.now() });
    });
    socket.on('disconnect', () => cajas.delete(socket.id));

    // Puente para imprimir desde celulares: se envía a UNA caja y el celular recibe si se imprimió o no
    socket.on('impresion-remota', (htmlDelTicket, ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        if (typeof htmlDelTicket !== 'string' || htmlDelTicket.length > 100000) return reply({ ok: false, reason: 'Ticket inválido' });
        const caja = pickCaja();
        if (!caja) return reply({ ok: false, reason: 'La caja no está conectada' });
        caja.socket.timeout(20000).emit('ejecutar-impresion-pc', htmlDelTicket, (err, result) => {
            reply(err ? { ok: false, reason: 'La caja no respondió' } : (result || { ok: true }));
        });
    });
});

app.use('/api/catalog', catalogRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/reports', reportRoutes);

// Ruta de la API que no existe: respuesta JSON (la pantalla siempre puede leer el mensaje)
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

// Cualquier error no atrapado (JSON mal formado, cuerpo demasiado grande...) responde JSON y queda registrado
app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error('[Servidor]', req.method, req.originalUrl, err);
    res.status(status).json({ error: status === 400 ? 'Datos inválidos.' : status === 413 ? 'Datos demasiado grandes.' : 'Error interno del servidor.' });
});

const PORT = process.env.PORT || 3000;

// Arranca el servidor y resuelve cuando ya escucha (la app de escritorio lo usa).
async function start(port = PORT) {
    await db.ready;
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '0.0.0.0', () => {
            server.removeListener('error', reject);
            console.log(`Servidor POS corriendo en puerto ${port}`);
            resolve(server);
        });
    });
}

if (require.main === module) {
    start().catch((err) => { console.error(err.message); process.exit(1); });
}

module.exports = { app, server, io, start };