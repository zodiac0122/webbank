/**
 * routes/referrals.js - Referral marşrutları (PostgreSQL)
 */
const express = require('express');
const router = express.Router();
const { getOne, getAll } = require('../database');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, async (req, res) => {
    try {
        const user = await getOne('SELECT referral_code FROM users WHERE id = ?', [req.user.id]);
        const referralCount = await getOne('SELECT COUNT(*) as count FROM users WHERE referred_by = ?', [req.user.id]);
        const referrals = await getAll('SELECT id, email, full_name, created_at FROM users WHERE referred_by = ? ORDER BY created_at DESC', [req.user.id]);

        res.json({
            referral_code: user.referral_code,
            referral_link: `/register?ref=${user.referral_code}`,
            referral_count: parseInt(referralCount.count),
            total_bonus: parseInt(referralCount.count) * 5,
            referrals: referrals.map(r => ({
                email: r.email.substring(0, 3) + '***@' + r.email.split('@')[1],
                joined: r.created_at
            }))
        });
    } catch (error) {
        res.status(500).json({ error: 'Server xətası' });
    }
});

module.exports = router;
