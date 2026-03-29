/**
 * routes/packages.js - İnvestisiya paketləri (PostgreSQL)
 */
const express = require('express');
const router = express.Router();
const { getAll, getOne } = require('../database');

router.get('/', async (req, res) => {
    try {
        const packages = await getAll('SELECT * FROM packages ORDER BY price ASC');
        res.json({ packages });
    } catch (error) {
        console.error('Paketlər xətası:', error);
        res.status(500).json({ error: 'Server xətası' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const pkg = await getOne('SELECT * FROM packages WHERE id = ?', [parseInt(req.params.id)]);
        if (!pkg) return res.status(404).json({ error: 'Paket tapılmadı' });
        res.json({ package: pkg });
    } catch (error) {
        res.status(500).json({ error: 'Server xətası' });
    }
});

module.exports = router;
