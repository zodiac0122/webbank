/**
 * middleware/security.js - Təhlükəsizlik funksiyaları
 */

function sanitizeInput(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePhone(phone) {
    return /^\+994\d{9}$/.test(phone.replace(/\s/g, ''));
}

function validateAmount(amount) {
    return typeof amount === 'number' && amount > 0 && isFinite(amount);
}

module.exports = { sanitizeInput, validateEmail, validatePhone, validateAmount };
