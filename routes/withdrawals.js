/**
 * routes/withdrawals.js - Çıxarış marşrutları (PostgreSQL)
 */
const express = require('express');
const router = express.Router();
const { getOne, getAll, runQuery } = require('../database');
const { requireAuth } = require('../middleware/auth');
const { sanitizeInput, validateEmail, validateAmount } = require('../middleware/security');

router.post('/', requireAuth, async (req, res) => {
    try {
        const { amount, email, phone, card_number } = req.body;

        const today = new Date();
        if (today.getDay() !== 1) {
            return res.status(400).json({ error: 'Çıxarış yalnız Bazar ertəsi günləri mümkündür' });
        }

        const numAmount = parseFloat(amount);
        if (!validateAmount(numAmount) || numAmount < 25) {
            return res.status(400).json({ error: 'Minimum çıxarış məbləği 25 AZN-dir' });
        }
        if (!email || !phone || !card_number) {
            return res.status(400).json({ error: 'Bütün sahələr tələb olunur' });
        }
        if (!validateEmail(email)) {
            return res.status(400).json({ error: 'Etibarsız email formatı' });
        }

        const user = await getOne('SELECT balance FROM users WHERE id = ?', [req.user.id]);
        if (user.balance < numAmount) {
            return res.status(400).json({ error: 'Kifayət qədər balans yoxdur' });
        }

        const result = await runQuery(
            "INSERT INTO withdrawals (user_id, amount, email, phone, card_number, status) VALUES (?, ?, ?, ?, ?, 'pending')",
            [req.user.id, numAmount, email.toLowerCase().trim(), sanitizeInput(phone), sanitizeInput(card_number)]
        );

        await runQuery('UPDATE users SET balance = balance - ? WHERE id = ?', [numAmount, req.user.id]);

        const admins = await getAll('SELECT id FROM users WHERE is_admin = 1');
        for (const admin of admins) {
            await runQuery("INSERT INTO notifications (user_id, message_az, message_ru, message_en, type) VALUES (?, ?, ?, ?, 'warning')",
                [admin.id, `Yeni çıxarış sorğusu: ${numAmount} AZN`, `Новый запрос на вывод: ${numAmount} AZN`, `New withdrawal: ${numAmount} AZN`]);
        }

        await runQuery("INSERT INTO notifications (user_id, message_az, message_ru, message_en, type) VALUES (?, ?, ?, ?, 'info')",
            [req.user.id, `Çıxarış sorğunuz (${numAmount} AZN) qəbul edildi.`, `Ваш запрос на вывод (${numAmount} AZN) принят.`, `Your withdrawal request (${numAmount} AZN) received.`]);

        res.status(201).json({ success: true, message: 'Çıxarış sorğusu göndərildi', withdrawalId: result.lastInsertRowid });
    } catch (error) {
        console.error('Çıxarış xətası:', error);
        res.status(500).json({ error: 'Server xətası baş verdi' });
    }
});

router.get('/', requireAuth, async (req, res) => {
    try {
        const withdrawals = await getAll('SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
        res.json({ withdrawals });
    } catch (error) {
        res.status(500).json({ error: 'Server xətası' });
    }
});

module.exports = router;
