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

io.on('connection', (socket) => {
    console.log('📱 Dispositivo enlazado en Tiempo Real');
    
    // Escucha la instrucción del mesero y avisa a la caja
    socket.on('payment-instruction', (data) => {
        if (!data || typeof data !== 'object') return;
        io.emit('receive-instruction', data);
    });
    // Puente para imprimir desde celulares
    socket.on('impresion-remota', (htmlDelTicket) => {
        if (typeof htmlDelTicket !== 'string' || htmlDelTicket.length > 100000) return;
        // Recibe la orden de un mesero y la retransmite a la computadora central
        io.emit('ejecutar-impresion-pc', htmlDelTicket);
    });
});

app.use('/api/catalog', catalogRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/reports', reportRoutes);

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