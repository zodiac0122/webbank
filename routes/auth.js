/**
 * routes/auth.js - Autentifikasiya marşrutları (PostgreSQL)
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getOne, getAll, runQuery } = require('../database');
const { sanitizeInput, validateEmail } = require('../middleware/security');

/**
 * POST /api/auth/register
 */
router.post('/register', async (req, res) => {
    try {
        const { email, password, full_name, referral_code } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email və şifrə tələb olunur' });
        }
        if (!validateEmail(email)) {
            return res.status(400).json({ error: 'Etibarsız email formatı' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Şifrə minimum 6 simvol olmalıdır' });
        }

        const existingUser = await getOne('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()]);
        if (existingUser) {
            return res.status(400).json({ error: 'Bu email artıq qeydiyyatdan keçib' });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const userReferralCode = 'WB' + uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase();

        let referredBy = null;
        if (referral_code && referral_code.trim()) {
            const referrer = await getOne('SELECT id FROM users WHERE referral_code = ?', [referral_code.trim()]);
            if (referrer) referredBy = referrer.id;
        }

        const sanitizedName = sanitizeInput(full_name || '');
        const result = await runQuery(
            'INSERT INTO users (email, password_hash, full_name, balance, referral_code, referred_by) VALUES (?, ?, ?, 10.0, ?, ?)',
            [email.toLowerCase().trim(), passwordHash, sanitizedName, userReferralCode, referredBy]
        );

        if (referredBy) {
            await runQuery('UPDATE users SET balance = balance + 5.0 WHERE id = ?', [referredBy]);
            await runQuery(
                "INSERT INTO notifications (user_id, message_az, message_ru, message_en, type) VALUES (?, ?, ?, ?, 'success')",
                [referredBy, 'Yeni referral qeydiyyatdan keçdi! +5 AZN bonus əldə etdiniz.',
                 'Новый реферал зарегистрировался! Вы получили +5 AZN бонус.',
                 'New referral registered! You received +5 AZN bonus.']
            );
        }

        req.session.userId = result.lastInsertRowid;

        res.status(201).json({
            success: true,
            message: 'Qeydiyyat uğurlu! 10 AZN bonus əlavə edildi.',
            userId: result.lastInsertRowid
        });
    } catch (error) {
        console.error('Qeydiyyat xətası:', error);
        res.status(500).json({ error: 'Server xətası baş verdi' });
    }
});

/**
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email və şifrə tələb olunur' });
        }

        const user = await getOne('SELECT * FROM users WHERE email = ? AND is_admin = 0', [email.toLowerCase().trim()]);
        if (!user) {
            return res.status(401).json({ error: 'Email və ya şifrə yanlışdır' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Email və ya şifrə yanlışdır' });
        }

        req.session.userId = user.id;

        res.json({
            success: true,
            message: 'Giriş uğurlu!',
            user: { id: user.id, email: user.email, full_name: user.full_name, balance: user.balance }
        });
    } catch (error) {
        console.error('Giriş xətası:', error);
        res.status(500).json({ error: 'Server xətası baş verdi' });
    }
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) return res.status(500).json({ error: 'Çıxış xətası' });
        res.clearCookie('connect.sid');
        res.json({ success: true, message: 'Çıxış uğurlu' });
    });
});

/**
 * GET /api/auth/me
 */
router.get('/me', async (req, res) => {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ authenticated: false });
    }

    const user = await getOne(
        'SELECT id, email, full_name, balance, total_earnings, referral_code, created_at FROM users WHERE id = ? AND is_admin = 0',
        [req.session.userId]
    );

    if (!user) {
        return res.status(401).json({ authenticated: false });
    }

    res.json({ authenticated: true, user });
});

module.exports = router;
