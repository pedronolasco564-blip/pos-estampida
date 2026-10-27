const path = require('path');

// Carpeta de datos: en la app de escritorio la define Electron (POS_DATA_DIR);
// en modo desarrollo (node server.js) se mantiene la raíz del proyecto de siempre.
const DATA_DIR = process.env.POS_DATA_DIR || path.resolve(__dirname, '../..');
const DB_PATH = path.join(DATA_DIR, 'pos_restaurante.db');

module.exports = { DATA_DIR, DB_PATH };
