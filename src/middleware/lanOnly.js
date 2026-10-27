// Solo se aceptan conexiones desde la propia PC o la red local (Wi-Fi del restaurante).
function isLocalAddress(raw) {
    if (!raw) return false;
    const ip = raw.replace(/^::ffff:/, '');
    if (ip === '::1' || ip === '127.0.0.1') return true;
    if (/^(fc|fd)/i.test(ip) || /^fe80:/i.test(ip)) return true; // IPv6 privada / link-local
    const m = ip.match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
    if (!m) return false;
    const a = +m[1], b = +m[2];
    return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
}

function lanOnly(req, res, next) {
    if (!isLocalAddress(req.socket.remoteAddress)) {
        return res.status(403).json({ error: 'Acceso permitido solo desde la red local.' });
    }
    next();
}

module.exports = { lanOnly, isLocalAddress };
