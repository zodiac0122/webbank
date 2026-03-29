/**
 * middleware/auth.js - Autentifikasiya middleware (async PostgreSQL)
 */

async function requireAuth(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Giriş tələb olunur / Authentication required' });
    }

    try {
        const { getOne } = require('../database');
        const user = await getOne('SELECT id, email, full_name, balance, total_earnings, referral_code, is_admin, created_at FROM users WHERE id = ?', [req.session.userId]);

        if (!user) {
            req.session.destroy();
            return res.status(401).json({ error: 'İstifadəçi tapılmadı / User not found' });
        }

        req.user = user;
        next();
    } catch (err) {
        next(err);
    }
}

async function requireAdmin(req, res, next) {
    if (!req.session || !req.session.adminId) {
        return res.status(401).json({ error: 'Admin girişi tələb olunur / Admin authentication required' });
    }

    try {
        const { getOne } = require('../database');
        const admin = await getOne('SELECT id, email, full_name, is_admin FROM users WHERE id = ? AND is_admin = 1', [req.session.adminId]);

        if (!admin) {
            req.session.destroy();
            return res.status(401).json({ error: 'Admin tapılmadı / Admin not found' });
        }

        req.admin = admin;
        next();
    } catch (err) {
        next(err);
    }
}

module.exports = { requireAuth, requireAdmin };
