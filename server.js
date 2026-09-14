const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http'); 
const { Server } = require('socket.io'); 

const catalogRoutes = require('./src/routes/catalogRoutes');
const orderRoutes = require('./src/routes/orderRoutes');
const reportRoutes = require('./src/routes/Reportroutes'); 

const app = express();
const server = http.createServer(app); 
const io = new Server(server, { cors: { origin: "*" } }); 

app.set('io', io); 

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log('📱 Dispositivo enlazado en Tiempo Real');
    
    // NUEVO: Escucha la instrucción del mesero y avisa a la caja
    socket.on('payment-instruction', (data) => {
        io.emit('receive-instruction', data);
    });
});

app.use('/api/catalog', catalogRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/reports', reportRoutes);

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor POS corriendo en puerto ${PORT}`);
});