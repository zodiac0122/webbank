/**
 * routes/user.js - İstifadəçi marşrutları (PostgreSQL)
 */
const express = require('express');
const router = express.Router();
const { getOne, getAll, runQuery, processDailyProfits } = require('../database');
const { requireAuth } = require('../middleware/auth');

router.get('/dashboard', requireAuth, async (req, res) => {
    try {
        await processDailyProfits();

        const user = await getOne('SELECT id, email, full_name, balance, total_earnings, referral_code, created_at FROM users WHERE id = ?', [req.user.id]);

        const activePackages = await getAll(
            'SELECT up.*, p.name_key, p.price, p.total_return, p.daily_profit_percent, p.daily_profit_fixed, p.duration_days FROM user_packages up JOIN packages p ON up.package_id = p.id WHERE up.user_id = ? AND up.is_active = 1 ORDER BY up.start_date DESC',
            [req.user.id]
        );

        const completedPackages = await getAll(
            'SELECT up.*, p.name_key, p.price, p.total_return FROM user_packages up JOIN packages p ON up.package_id = p.id WHERE up.user_id = ? AND up.is_active = 0 ORDER BY up.end_date DESC',
            [req.user.id]
        );

        const referralCount = await getOne('SELECT COUNT(*) as count FROM users WHERE referred_by = ?', [req.user.id]);
        const notifications = await getAll('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [req.user.id]);
        const unreadCount = await getOne('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id]);

        res.json({
            user,
            activePackages: activePackages.map(pkg => ({
                ...pkg,
                remaining_days: pkg.duration_days - pkg.days_completed,
                daily_profit: pkg.daily_profit_fixed || (pkg.price * pkg.daily_profit_percent / 100)
            })),
            completedPackages,
            referralCount: parseInt(referralCount.count),
            referralBonus: parseInt(referralCount.count) * 5,
            notifications,
            unreadNotifications: parseInt(unreadCount.count)
        });
    } catch (error) {
        console.error('Dashboard xətası:', error);
        res.status(500).json({ error: 'Server xətası' });
    }
});

router.get('/history', requireAuth, async (req, res) => {
    try {
        const payments = await getAll('SELECT p.*, pk.name_key, pk.price FROM payments p JOIN packages pk ON p.package_id = pk.id WHERE p.user_id = ? ORDER BY p.created_at DESC', [req.user.id]);
        const withdrawals = await getAll('SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
        res.json({ payments, withdrawals });
    } catch (error) {
        res.status(500).json({ error: 'Server xətası' });
    }
});

router.put('/notifications/read', requireAuth, async (req, res) => {
    try {
        await runQuery('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Server xətası' });
    }
});

module.exports = router;
