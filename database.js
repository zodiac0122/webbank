/**
 * database.js - PostgreSQL verilənlər bazası (Railway versiya)
 */

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

let pool = null;

/**
 * SQL-dəki ? işarələrini $1, $2, $3... formatına çevir
 */
function convertParams(sql) {
    let index = 0;
    return sql.replace(/\?/g, () => `$${++index}`);
}

/**
 * Verilənlər bazasını başlat
 */
async function initDatabase() {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    // Bağlantını yoxla
    const client = await pool.connect();
    console.log('✅ PostgreSQL bağlantısı uğurlu');
    client.release();

    await createTables();
    await seedData();

    return pool;
}

/**
 * Cədvəlləri yarat
 */
async function createTables() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT DEFAULT '',
            balance DOUBLE PRECISION DEFAULT 10.0,
            total_earnings DOUBLE PRECISION DEFAULT 0.0,
            referral_code TEXT UNIQUE NOT NULL,
            referred_by INTEGER DEFAULT NULL,
            is_admin INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS packages (
            id SERIAL PRIMARY KEY,
            name_key TEXT NOT NULL,
            price DOUBLE PRECISION NOT NULL,
            profit_percent DOUBLE PRECISION,
            daily_profit_percent DOUBLE PRECISION,
            daily_profit_fixed DOUBLE PRECISION,
            duration_days INTEGER DEFAULT 30,
            total_return DOUBLE PRECISION NOT NULL
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS user_packages (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            package_id INTEGER NOT NULL,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            total_earned DOUBLE PRECISION DEFAULT 0.0,
            last_credited_date TEXT,
            days_completed INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS payments (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            package_id INTEGER NOT NULL,
            full_name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT NOT NULL,
            receipt_path TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            reviewed_at TIMESTAMP
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS withdrawals (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            amount DOUBLE PRECISION NOT NULL,
            email TEXT NOT NULL,
            phone TEXT NOT NULL,
            card_number TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            reviewed_at TIMESTAMP
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS support_messages (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            message TEXT NOT NULL,
            sender_type TEXT NOT NULL,
            is_read INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS notifications (
            id SERIAL PRIMARY KEY,
            user_id INTEGER,
            message_az TEXT NOT NULL,
            message_ru TEXT,
            message_en TEXT,
            type TEXT DEFAULT 'info',
            is_read INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);
}

/**
 * İlkin data əlavə et
 */
async function seedData() {
    // Paketlər
    const pkgCount = await pool.query('SELECT COUNT(*) as count FROM packages');
    if (parseInt(pkgCount.rows[0].count) === 0) {
        await pool.query(
            'INSERT INTO packages (name_key, price, profit_percent, daily_profit_percent, daily_profit_fixed, duration_days, total_return) VALUES ($1,$2,$3,$4,$5,$6,$7)',
            ['basic', 30, 60, 2, null, 30, 48]
        );
        await pool.query(
            'INSERT INTO packages (name_key, price, profit_percent, daily_profit_percent, daily_profit_fixed, duration_days, total_return) VALUES ($1,$2,$3,$4,$5,$6,$7)',
            ['standard', 50, 45, 1.5, null, 30, 72.5]
        );
        await pool.query(
            'INSERT INTO packages (name_key, price, profit_percent, daily_profit_percent, daily_profit_fixed, duration_days, total_return) VALUES ($1,$2,$3,$4,$5,$6,$7)',
            ['premium', 100, 40, null, 1.3333, 30, 140]
        );
    }

    // Admin istifadəçi
    const adminCount = await pool.query('SELECT COUNT(*) as count FROM users WHERE is_admin = 1');
    if (parseInt(adminCount.rows[0].count) === 0) {
        const passwordHash = bcrypt.hashSync('Admin123!', 12);
        await pool.query(
            'INSERT INTO users (email, password_hash, full_name, balance, referral_code, is_admin) VALUES ($1,$2,$3,$4,$5,$6)',
            ['admin@webbank.az', passwordHash, 'Admin', 0, 'ADMIN_REF_001', 1]
        );
    }
}

/* ===== Yardımçı SQL funksiyaları ===== */

/**
 * Tək sətir al
 */
async function getOne(sql, params = []) {
    const pgSql = convertParams(sql);
    const result = await pool.query(pgSql, params);
    return result.rows[0] || null;
}

/**
 * Birdən çox sətir al
 */
async function getAll(sql, params = []) {
    const pgSql = convertParams(sql);
    const result = await pool.query(pgSql, params);
    return result.rows;
}

/**
 * Sorğu icra et (INSERT/UPDATE/DELETE)
 */
async function runQuery(sql, params = []) {
    const pgSql = convertParams(sql);

    // INSERT üçün RETURNING id əlavə et
    let finalSql = pgSql;
    if (pgSql.trim().toUpperCase().startsWith('INSERT') && !pgSql.toUpperCase().includes('RETURNING')) {
        finalSql = pgSql + ' RETURNING id';
    }

    const result = await pool.query(finalSql, params);
    return {
        lastInsertRowid: result.rows[0]?.id || 0,
        changes: result.rowCount
    };
}

/**
 * Günlük gəlirləri hesabla
 */
async function processDailyProfits() {
    if (!pool) return;

    try {
        const activePackages = await getAll(`
            SELECT up.*, p.price, p.daily_profit_percent, p.daily_profit_fixed, p.duration_days
            FROM user_packages up
            JOIN packages p ON up.package_id = p.id
            WHERE up.is_active = 1
        `);

        const today = new Date().toISOString().split('T')[0];

        for (const pkg of activePackages) {
            const lastDate = pkg.last_credited_date || (typeof pkg.start_date === 'string' ? pkg.start_date.split('T')[0] : new Date(pkg.start_date).toISOString().split('T')[0]);
            const lastDateTime = new Date(lastDate);
            const todayDate = new Date(today);

            const diffTime = todayDate.getTime() - lastDateTime.getTime();
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays <= 0) continue;

            const remainingDays = pkg.duration_days - pkg.days_completed;
            const daysToCredit = Math.min(diffDays, remainingDays);

            if (daysToCredit <= 0) continue;

            let dailyProfit;
            if (pkg.daily_profit_fixed) {
                dailyProfit = pkg.daily_profit_fixed;
            } else {
                dailyProfit = (pkg.price * pkg.daily_profit_percent) / 100;
            }

            const totalProfit = dailyProfit * daysToCredit;
            const newTotalEarned = pkg.total_earned + totalProfit;
            const newDaysCompleted = pkg.days_completed + daysToCredit;
            const isStillActive = newDaysCompleted < pkg.duration_days ? 1 : 0;

            await pool.query(convertParams(
                'UPDATE user_packages SET total_earned = ?, last_credited_date = ?, days_completed = ?, is_active = ? WHERE id = ?'
            ), [newTotalEarned, today, newDaysCompleted, isStillActive, pkg.id]);

            await pool.query(convertParams(
                'UPDATE users SET balance = balance + ?, total_earnings = total_earnings + ? WHERE id = ?'
            ), [totalProfit, totalProfit, pkg.user_id]);

            if (!isStillActive) {
                await pool.query(convertParams(
                    "INSERT INTO notifications (user_id, message_az, message_ru, message_en, type) VALUES (?, ?, ?, ?, 'success')"
                ), [pkg.user_id,
                    'İnvestisiya paketiniz tamamlandı! Bütün gəlirlər balansınıza əlavə edildi.',
                    'Ваш инвестиционный пакет завершён! Все доходы добавлены на ваш баланс.',
                    'Your investment package is complete! All earnings have been added to your balance.']);
            }
        }
    } catch (error) {
        console.error('Günlük gəlir xətası:', error.message);
    }
}

module.exports = { initDatabase, getOne, getAll, runQuery, processDailyProfits };
