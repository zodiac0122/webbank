/**
 * routes/admin.js - Admin panel marşrutları (PostgreSQL)
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getOne, getAll, runQuery } = require('../database');
const { requireAdmin } = require('../middleware/auth');
const { sanitizeInput } = require('../middleware/security');

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email və şifrə tələb olunur' });

        const admin = await getOne('SELECT * FROM users WHERE email = ? AND is_admin = 1', [email.toLowerCase().trim()]);
        if (!admin) return res.status(401).json({ error: 'Etibarsız admin giriş məlumatları' });

        const isMatch = await bcrypt.compare(password, admin.password_hash);
        if (!isMatch) return res.status(401).json({ error: 'Etibarsız admin giriş məlumatları' });

        req.session.adminId = admin.id;
        req.session.save((err) => {
            if (err) return res.status(500).json({ error: 'Session xətası' });
            res.json({ success: true, message: 'Admin girişi uğurlu', admin: { id: admin.id, email: admin.email } });
        });
    } catch (error) {
        res.status(500).json({ error: 'Server xətası' });
    }
});

router.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

router.get('/check', requireAdmin, (req, res) => {
    res.json({ authenticated: true, admin: req.admin });
});

router.get('/users', requireAdmin, async (req, res) => {
    try {
        const users = await getAll('SELECT id, email, full_name, balance, total_earnings, referral_code, created_at FROM users WHERE is_admin = 0 ORDER BY created_at DESC');
        res.json({ users });
    } catch (error) {
        res.status(500).json({ error: 'Server xətası' });
    }
});

router.get('/payments', requireAdmin, async (req, res) => {
    try {
        const status = req.query.status || 'pending';
        const payments = await getAll(
            'SELECT p.*, u.email as user_email, u.full_name as user_name, pk.name_key, pk.price, pk.total_return FROM payments p JOIN users u ON p.user_id = u.id JOIN packages pk ON p.package_id = pk.id WHERE p.status = ? ORDER BY p.created_at DESC',
            [status]
        );
        res.json({ payments });
    } catch (error) {
        res.status(500).json({ error: 'Server xətası' });
    }
});

router.put('/payments/:id/approve', requireAdmin, async (req, res) => {
    try {
        const paymentId = parseInt(req.params.id);
        const payment = await getOne("SELECT * FROM payments WHERE id = ? AND status = 'pending'", [paymentId]);
        if (!payment) return res.status(404).json({ error: 'Ödəniş tapılmadı' });

        const pkg = await getOne('SELECT * FROM packages WHERE id = ?', [payment.package_id]);

        await runQuery("UPDATE payments SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?", [paymentId]);

        const startDate = new Date().toISOString();
        const endDate = new Date(Date.now() + pkg.duration_days * 24 * 60 * 60 * 1000).toISOString();

        await runQuery('INSERT INTO user_packages (user_id, package_id, start_date, end_date, is_active, last_credited_date) VALUES (?, ?, ?, ?, 1, ?)',
            [payment.user_id, payment.package_id, startDate, endDate, startDate.split('T')[0]]);

        await runQuery("INSERT INTO notifications (user_id, message_az, message_ru, message_en, type) VALUES (?, ?, ?, ?, 'success')",
            [payment.user_id, `Ödənişiniz təsdiqləndi! ${pkg.name_key} paketi aktivləşdirildi.`,
             `Ваш платёж подтверждён! Пакет ${pkg.name_key} активирован.`,
             `Your payment is approved! ${pkg.name_key} package activated.`]);

        res.json({ success: true, message: 'Ödəniş təsdiqləndi' });
    } catch (error) {
        console.error('Təsdiq xətası:', error);
        res.status(500).json({ error: 'Server xətası' });
    }
});

router.put('/payments/:id/reject', requireAdmin, async (req, res) => {
    try {
        const paymentId = parseInt(req.params.id);
        const payment = await getOne("SELECT * FROM payments WHERE id = ? AND status = 'pending'", [paymentId]);
        if (!payment) return res.status(404).json({ error: 'Ödəniş tapılmadı' });

        await runQuery("UPDATE payments SET status = 'rejected', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?", [paymentId]);
        await runQuery("INSERT INTO notifications (user_id, message_az, message_ru, message_en, type) VALUES (?, ?, ?, ?, 'error')",
            [payment.user_id, 'Ödənişiniz rədd edildi.', 'Ваш платёж отклонён.', 'Your payment was rejected.']);

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Server xətası' });
    }
});

router.get('/withdrawals', requireAdmin, async (req, res) => {
    try {
        const status = req.query.status || 'pending';
        const withdrawals = await getAll(
            'SELECT w.*, u.email as user_email, u.full_name as user_name, u.balance FROM withdrawals w JOIN users u ON w.user_id = u.id WHERE w.status = ? ORDER BY w.created_at DESC',
            [status]
        );
        res.json({ withdrawals });
    } catch (error) {
        res.status(500).json({ error: 'Server xətası' });
    }
});

router.put('/withdrawals/:id/approve', requireAdmin, async (req, res) => {
    try {
        const wId = parseInt(req.params.id);
        const w = await getOne("SELECT * FROM withdrawals WHERE id = ? AND status = 'pending'", [wId]);
        if (!w) return res.status(404).json({ error: 'Çıxarış tapılmadı' });

        await runQuery("UPDATE withdrawals SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?", [wId]);
        await runQuery("INSERT INTO notifications (user_id, message_az, message_ru, message_en, type) VALUES (?, ?, ?, ?, 'success')",
            [w.user_id, `Çıxarış (${w.amount} AZN) təsdiqləndi.`, `Вывод (${w.amount} AZN) одобрен.`, `Withdrawal (${w.amount} AZN) approved.`]);

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Server xətası' });
    }
});

router.put('/withdrawals/:id/reject', requireAdmin, async (req, res) => {
    try {
        const wId = parseInt(req.params.id);
        const w = await getOne("SELECT * FROM withdrawals WHERE id = ? AND status = 'pending'", [wId]);
        if (!w) return res.status(404).json({ error: 'Çıxarış tapılmadı' });

        await runQuery('UPDATE users SET balance = balance + ? WHERE id = ?', [w.amount, w.user_id]);
        await runQuery("UPDATE withdrawals SET status = 'rejected', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?", [wId]);
        await runQuery("INSERT INTO notifications (user_id, message_az, message_ru, message_en, type) VALUES (?, ?, ?, ?, 'error')",
            [w.user_id, `Çıxarış rədd edildi. ${w.amount} AZN balansa qaytarıldı.`, `Вывод отклонён. ${w.amount} AZN возвращено.`, `Withdrawal rejected. ${w.amount} AZN refunded.`]);

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Server xətası' });
    }
});

router.get('/support', requireAdmin, async (req, res) => {
    try {
        const conversations = await getAll(`
            SELECT DISTINCT sm.user_id, u.email, u.full_name,
                (SELECT COUNT(*) FROM support_messages WHERE user_id = sm.user_id AND sender_type = 'user' AND is_read = 0) as unread_count,
                (SELECT message FROM support_messages WHERE user_id = sm.user_id ORDER BY created_at DESC LIMIT 1) as last_message,
                (SELECT created_at FROM support_messages WHERE user_id = sm.user_id ORDER BY created_at DESC LIMIT 1) as last_message_time
            FROM support_messages sm
            JOIN users u ON sm.user_id = u.id
            ORDER BY last_message_time DESC
        `);
        res.json({ conversations });
    } catch (error) {
        res.status(500).json({ error: 'Server xətası' });
    }
});

router.get('/support/:userId', requireAdmin, async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const messages = await getAll('SELECT * FROM support_messages WHERE user_id = ? ORDER BY created_at ASC', [userId]);
        await runQuery("UPDATE support_messages SET is_read = 1 WHERE user_id = ? AND sender_type = 'user' AND is_read = 0", [userId]);
        const user = await getOne('SELECT id, email, full_name FROM users WHERE id = ?', [userId]);
        res.json({ messages, user });
    } catch (error) {
        res.status(500).json({ error: 'Server xətası' });
    }
});

router.post('/support/:userId', requireAdmin, async (req, res) => {
    try {
        const { message } = req.body;
        if (!message || !message.trim()) return res.status(400).json({ error: 'Mesaj boş ola bilməz' });
        await runQuery("INSERT INTO support_messages (user_id, message, sender_type) VALUES (?, ?, 'admin')",
            [parseInt(req.params.userId), sanitizeInput(message.trim())]);
        res.status(201).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Server xətası' });
    }
});

router.get('/notifications', requireAdmin, async (req, res) => {
    try {
        const notifications = await getAll('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [req.admin.id]);
        res.json({ notifications });
    } catch (error) {
        res.status(500).json({ error: 'Server xətası' });
    }
});

router.get('/stats', requireAdmin, async (req, res) => {
    try {
        const totalUsers = await getOne('SELECT COUNT(*) as count FROM users WHERE is_admin = 0');
        const pendingPayments = await getOne("SELECT COUNT(*) as count FROM payments WHERE status = 'pending'");
        const pendingWithdrawals = await getOne("SELECT COUNT(*) as count FROM withdrawals WHERE status = 'pending'");
        const totalBalance = await getOne('SELECT COALESCE(SUM(balance), 0) as total FROM users WHERE is_admin = 0');
        const unreadMessages = await getOne("SELECT COUNT(*) as count FROM support_messages WHERE sender_type = 'user' AND is_read = 0");
        const activePackages = await getOne('SELECT COUNT(*) as count FROM user_packages WHERE is_active = 1');

        res.json({
            totalUsers: parseInt(totalUsers.count),
            pendingPayments: parseInt(pendingPayments.count),
            pendingWithdrawals: parseInt(pendingWithdrawals.count),
            totalBalance: parseFloat(totalBalance.total),
            unreadMessages: parseInt(unreadMessages.count),
            activePackages: parseInt(activePackages.count)
        });
    } catch (error) {
        res.status(500).json({ error: 'Server xətası' });
    }
});

// İstifadəçi balansını dəyiş
router.put('/users/:id/balance', requireAdmin, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const { amount } = req.body;
        if (amount === undefined || isNaN(amount)) return res.status(400).json({ error: 'Məbləğ tələb olunur' });

        const user = await getOne('SELECT * FROM users WHERE id = ? AND is_admin = 0', [userId]);
        if (!user) return res.status(404).json({ error: 'İstifadəçi tapılmadı' });

        await runQuery('UPDATE users SET balance = ? WHERE id = ?', [parseFloat(amount), userId]);
        res.json({ success: true, message: 'Balans yeniləndi' });
    } catch (error) {
        res.status(500).json({ error: 'Server xətası' });
    }
});

// İstifadəçi sil
router.delete('/users/:id', requireAdmin, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const user = await getOne('SELECT * FROM users WHERE id = ? AND is_admin = 0', [userId]);
        if (!user) return res.status(404).json({ error: 'İstifadəçi tapılmadı' });

        await runQuery('DELETE FROM support_messages WHERE user_id = ?', [userId]);
        await runQuery('DELETE FROM notifications WHERE user_id = ?', [userId]);
        await runQuery('DELETE FROM user_packages WHERE user_id = ?', [userId]);
        await runQuery('DELETE FROM payments WHERE user_id = ?', [userId]);
        await runQuery('DELETE FROM withdrawals WHERE user_id = ?', [userId]);
        await runQuery('DELETE FROM users WHERE id = ?', [userId]);
        res.json({ success: true, message: 'İstifadəçi silindi' });
    } catch (error) {
        res.status(500).json({ error: 'Server xətası' });
    }
});

// İstifadəçi detalları
router.get('/users/:id', requireAdmin, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const user = await getOne('SELECT id, email, full_name, balance, total_earnings, referral_code, referred_by, created_at FROM users WHERE id = ? AND is_admin = 0', [userId]);
        if (!user) return res.status(404).json({ error: 'İstifadəçi tapılmadı' });

        const packages = await getAll('SELECT up.*, p.name_key, p.price, p.total_return FROM user_packages up JOIN packages p ON up.package_id = p.id WHERE up.user_id = ? ORDER BY up.created_at DESC', [userId]);
        const payments = await getAll('SELECT p.*, pk.name_key, pk.price FROM payments p JOIN packages pk ON p.package_id = pk.id WHERE p.user_id = ? ORDER BY p.created_at DESC', [userId]);
        const withdrawals = await getAll('SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC', [userId]);
        const referrals = await getAll('SELECT id, email, full_name, created_at FROM users WHERE referred_by = ?', [userId]);

        res.json({ user, packages, payments, withdrawals, referrals });
    } catch (error) {
        res.status(500).json({ error: 'Server xətası' });
    }
});

module.exports = router;
