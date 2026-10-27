// ========================================================
// DINERO: las cuentas se hacen en centavos enteros para que 100.10 - 33.37 dé exactamente 66.73
// (con decimales de punto flotante quedaría 66.72999999, y una mesa podía quedar debiendo $0.0000001).
// En la BD se guardan pesos con 2 decimales exactos.
// ========================================================

// Pesos -> centavos enteros (toFixed evita que 1.005 * 100 = 100.49999 redondee mal)
const toCents = (n) => Math.round(Number((Number(n) || 0) * 100).toFixed(4));
const fromCents = (c) => c / 100;
const round2 = (n) => fromCents(toCents(n));

// Suma de montos en pesos sin acumular error
const sumMoney = (...values) => fromCents(values.reduce((acc, v) => acc + toCents(v), 0));

module.exports = { toCents, fromCents, round2, sumMoney };
