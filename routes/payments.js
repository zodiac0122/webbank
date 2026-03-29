/**
 * routes/payments.js - Ödəniş marşrutları (PostgreSQL)
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getOne, getAll, runQuery } = require('../database');
const { requireAuth } = require('../middleware/auth');
const { sanitizeInput, validateEmail } = require('../middleware/security');

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'public', 'uploads')),
    filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif|webp|pdf/;
        if (allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype)) {
            return cb(null, true);
        }
        cb(new Error('Yalnız şəkil və PDF faylları qəbul olunur'));
    }
});

router.post('/', requireAuth, upload.single('receipt'), async (req, res) => {
    try {
        const { package_id, full_name, email, phone } = req.body;

        if (!package_id || !full_name || !email || !phone) {
            return res.status(400).json({ error: 'Bütün sahələr tələb olunur' });
        }
        if (!validateEmail(email)) {
            return res.status(400).json({ error: 'Etibarsız email formatı' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'Ödəniş qəbzi tələb olunur' });
        }

        const pkg = await getOne('SELECT * FROM packages WHERE id = ?', [parseInt(package_id)]);
        if (!pkg) return res.status(404).json({ error: 'Paket tapılmadı' });

        const result = await runQuery(
            "INSERT INTO payments (user_id, package_id, full_name, email, phone, receipt_path, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')",
            [req.user.id, parseInt(package_id), sanitizeInput(full_name), email.toLowerCase().trim(), sanitizeInput(phone), '/uploads/' + req.file.filename]
        );

        const admins = await getAll('SELECT id FROM users WHERE is_admin = 1');
        for (const admin of admins) {
            await runQuery("INSERT INTO notifications (user_id, message_az, message_ru, message_en, type) VALUES (?, ?, ?, ?, 'info')",
                [admin.id, `Yeni ödəniş sorğusu: ${sanitizeInput(full_name)} - ${pkg.price} AZN`,
                 `Новый запрос на оплату: ${sanitizeInput(full_name)} - ${pkg.price} AZN`,
                 `New payment request: ${sanitizeInput(full_name)} - ${pkg.price} AZN`]);
        }

        res.status(201).json({ success: true, message: 'Ödəniş sorğusu göndərildi. Admin təsdiqlədikdən sonra paketiniz aktivləşəcək.', paymentId: result.lastInsertRowid });
    } catch (error) {
        console.error('Ödəniş xətası:', error);
        res.status(500).json({ error: 'Server xətası baş verdi' });
    }
});

router.get('/', requireAuth, async (req, res) => {
    try {
        const payments = await getAll(
            'SELECT p.*, pk.name_key, pk.price, pk.total_return FROM payments p JOIN packages pk ON p.package_id = pk.id WHERE p.user_id = ? ORDER BY p.created_at DESC',
            [req.user.id]
        );
        res.json({ payments });
    } catch (error) {
        res.status(500).json({ error: 'Server xətası' });
    }
});

module.exports = router;
