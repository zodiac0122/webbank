/**
 * routes/support.js - Canlı dəstək marşrutları (PostgreSQL)
 */
const express = require('express');
const router = express.Router();
const { getAll, runQuery } = require('../database');
const { requireAuth } = require('../middleware/auth');
const { sanitizeInput } = require('../middleware/security');

router.post('/', requireAuth, async (req, res) => {
    try {
        const { message } = req.body;
        if (!message || message.trim().length === 0) {
            return res.status(400).json({ error: 'Mesaj boş ola bilməz' });
        }
        if (message.length > 1000) {
            return res.status(400).json({ error: 'Mesaj çox uzundur' });
        }

        await runQuery("INSERT INTO support_messages (user_id, message, sender_type) VALUES (?, ?, 'user')",
            [req.user.id, sanitizeInput(message.trim())]);

        const admins = await getAll('SELECT id FROM users WHERE is_admin = 1');
        for (const admin of admins) {
            await runQuery("INSERT INTO notifications (user_id, message_az, message_ru, message_en, type) VALUES (?, ?, ?, ?, 'info')",
                [admin.id, `Yeni dəstək mesajı: ${req.user.email}`, `Новое сообщение: ${req.user.email}`, `New message: ${req.user.email}`]);
        }

        res.status(201).json({ success: true, message: 'Mesaj göndərildi' });
    } catch (error) {
        res.status(500).json({ error: 'Server xətası' });
    }
});

router.get('/', requireAuth, async (req, res) => {
    try {
        const messages = await getAll('SELECT * FROM support_messages WHERE user_id = ? ORDER BY created_at ASC', [req.user.id]);
        await runQuery("UPDATE support_messages SET is_read = 1 WHERE user_id = ? AND sender_type = 'admin' AND is_read = 0", [req.user.id]);
        res.json({ messages });
    } catch (error) {
        res.status(500).json({ error: 'Server xətası' });
    }
});

module.exports = router;
