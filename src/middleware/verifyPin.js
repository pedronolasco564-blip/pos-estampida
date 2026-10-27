const crypto = require('crypto');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const { dbGet } = require('../utils/dbHelper');

// Frena la adivinanza del PIN: solo cuentan los intentos fallidos (los exitosos no gastan cupo).
const pinAttemptLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    message: { error: 'Demasiados intentos fallidos. Intente de nuevo en 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Genera un hash bcrypt de un PIN.
 * @param {string} pin 
 * @returns {Promise<string>}
 */
async function hashPin(pin) {
    return bcrypt.hash(String(pin || ''), 12);
}

/**
 * Valida un PIN contra el admin_pin configurado en la base de datos.
 * Soporta migración gradual: si el hash almacenado es SHA-256 legacy (64 hex chars),
 * lo verifica y lo actualiza automáticamente a bcrypt.
 * @param {string} inputPin 
 * @returns {Promise<boolean>}
 */
async function verifyAdminPin(inputPin) {
    if (!inputPin) return false;

    const row = await dbGet(`SELECT value FROM settings WHERE key = 'admin_pin'`);
    if (!row || !row.value) {
        // Fallback: comparar contra hash legacy del PIN por defecto '1234'
        const defaultHash = crypto.createHash('sha256').update('1234').digest('hex');
        const inputHash = crypto.createHash('sha256').update(String(inputPin)).digest('hex');
        return crypto.timingSafeEqual(Buffer.from(inputHash, 'hex'), Buffer.from(defaultHash, 'hex'));
    }

    const storedHash = row.value;

    // Detectar si es un hash SHA-256 legacy (64 caracteres hexadecimales)
    const isLegacySha256 = /^[a-f0-9]{64}$/i.test(storedHash);

    if (isLegacySha256) {
        const inputHash = crypto.createHash('sha256').update(String(inputPin)).digest('hex');
        const inputBuffer = Buffer.from(inputHash, 'hex');
        const storedBuffer = Buffer.from(storedHash, 'hex');

        if (inputBuffer.length !== storedBuffer.length) return false;

        const isValid = crypto.timingSafeEqual(inputBuffer, storedBuffer);

        // Auto-migrar a bcrypt si el PIN es correcto
        if (isValid) {
            try {
                const bcryptHash = await bcrypt.hash(String(inputPin), 12);
                const { dbRun } = require('../utils/dbHelper');
                await dbRun(`UPDATE settings SET value = ? WHERE key = 'admin_pin'`, [bcryptHash]);
                console.log('🔐 PIN migrado automáticamente de SHA-256 a bcrypt.');
            } catch (migrationErr) {
                console.error('Error al migrar PIN a bcrypt:', migrationErr.message);
            }
        }

        return isValid;
    }

    // Hash bcrypt: usar bcrypt.compare directamente
    return bcrypt.compare(String(inputPin), storedHash);
}

/**
 * Middleware Express para proteger rutas que requieren confirmación con PIN de administrador.
 */
async function verifyPinMiddleware(req, res, next) {
    try {
        const pin = req.body ? req.body.pin : null;
        if (!pin) {
            return res.status(400).json({ error: 'PIN requerido' });
        }

        const isValid = await verifyAdminPin(pin);
        if (!isValid) {
            return res.status(403).json({ error: 'PIN INCORRECTO' });
        }

        next();
    } catch (error) {
        console.error('[VerifyPin]', error);
        return res.status(500).json({ error: 'Error interno del servidor.' });
    }
}

module.exports = {
    hashPin,
    verifyAdminPin,
    verifyPinMiddleware,
    pinAttemptLimiter
};

