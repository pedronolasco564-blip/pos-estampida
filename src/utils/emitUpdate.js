/**
 * Helper reutilizable para emitir eventos WebSocket desde controladores.
 * Centraliza la lógica que antes se repetía 12+ veces en los controladores.
 * @param {import('express').Request} req - Objeto request de Express
 * @param {string} event - Nombre del evento a emitir (default: 'update-tables')
 */
function emitUpdate(req, event = 'update-tables') {
    const io = req.app.get('io');
    if (io) io.emit(event);
}

module.exports = { emitUpdate };

