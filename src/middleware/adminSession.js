const crypto = require('crypto');

// Sesiones de administrador en memoria. Se pierden al reiniciar el servidor (hay que volver a poner el PIN).
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const sessions = new Map(); // token -> expira en ms

function createSession() {
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, Date.now() + SESSION_TTL_MS);
    return token;
}

function getToken(req) {
    const header = req.headers.authorization || '';
    return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function isValidToken(token) {
    if (!token) return false;
    const expires = sessions.get(token);
    if (!expires) return false;
    if (expires < Date.now()) { sessions.delete(token); return false; }
    return true;
}

function destroySession(token) {
    sessions.delete(token);
}

// Protege rutas del panel de administración: exige una sesión creada con el PIN de admin.
function requireAdmin(req, res, next) {
    if (!isValidToken(getToken(req))) {
        return res.status(401).json({ error: 'Sesión de administrador requerida.', code: 'ADMIN_REQUIRED' });
    }
    next();
}

module.exports = { createSession, destroySession, requireAdmin, getToken, isValidToken };
