/**
 * server.js - WebBank Ana Server Faylı (Railway PostgreSQL versiya)
 */

const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Upload qovluğu yarat
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// ===== Middleware =====
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'"]
        }
    },
    crossOriginEmbedderPolicy: false
}));

const generalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: { error: 'Çox sayda sorğu.' } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Çox sayda giriş cəhdi.' } });
app.use(generalLimiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

app.set('trust proxy', 1);

// PostgreSQL session store - session-lar database-də saxlanılır
const sessionPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.use(session({
    store: new pgSession({
        pool: sessionPool,
        tableName: 'session',
        createTableIfMissing: true
    }),
    secret: process.env.SESSION_SECRET || 'webbank_secret_key_2024_xJ9kL2mN',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax'
    }
}));

app.use(express.static(path.join(__dirname, 'public')));

// Dil faylları üçün marşrut
app.get('/lang/:lang.json', (req, res) => {
    const langFile = path.join(__dirname, 'lang', req.params.lang + '.json');
    if (fs.existsSync(langFile)) {
        res.sendFile(langFile);
    } else {
        res.status(404).json({ error: 'Language not found' });
    }
});

// ===== Marşrutlar =====
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/packages', require('./routes/packages'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/withdrawals', require('./routes/withdrawals'));
app.use('/api/referrals', require('./routes/referrals'));
app.use('/api/support', require('./routes/support'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/user', require('./routes/user'));

// ===== HTML Səhifələr =====
const pages = {
    '/': 'index.html', '/login': 'login.html', '/register': 'register.html',
    '/dashboard': 'dashboard.html', '/packages': 'packages.html', '/payment': 'payment.html',
    '/withdrawal': 'withdrawal.html', '/about': 'about.html', '/support': 'support.html'
};

Object.entries(pages).forEach(([route, file]) => {
    app.get(route, (req, res) => res.sendFile(path.join(__dirname, 'public', file)));
});

app.get('/idaretmepanel', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'login.html')));
app.get('/idaretmepanel/panel', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'panel.html')));

// 404
app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Tapılmadı' });
    res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Xəta
app.use((err, req, res, next) => {
    console.error('Server xəta:', err);
    res.status(500).json({ error: 'Server xətası' });
});

// ===== Async başlatma =====
async function startServer() {
    const { initDatabase, processDailyProfits } = require('./database');
    await initDatabase();

    // Günlük gəlirlər
    await processDailyProfits();
    setInterval(async () => {
        await processDailyProfits();
        console.log('⏰ Günlük gəlirlər yoxlandı');
    }, 60 * 60 * 1000);

    app.listen(PORT, () => {
        console.log(`
╔══════════════════════════════════════════╗
║         🏦 WebBank Platform              ║
║   Port: ${PORT}                              ║
║   Status: ✅ Active                      ║
║   Admin: /idaretmepanel                  ║
║   Email: admin@webbank.az                ║
║   Şifrə: Admin123!                      ║
╚══════════════════════════════════════════╝
        `);
    });
}

startServer().catch(err => {
    console.error('Server başlatma xətası:', err);
    process.exit(1);
});
