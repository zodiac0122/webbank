/**
 * app.js - Əsas tətbiq məntiqi (Railway versiya - CSRF silinib)
 */

const App = {
    user: null,

    /**
     * Tətbiqi başlat
     */
    async init() {
        await this.checkAuth();
        this.setupNavigation();
        this.setupAnimations();
    },

    /**
     * Autentifikasiyanı yoxla
     */
    async checkAuth() {
        try {
            const res = await fetch('/api/auth/me');
            const data = await res.json();

            if (data.authenticated) {
                this.user = data.user;
                this.showAuthenticatedNav();
            } else {
                this.user = null;
                this.showGuestNav();
            }
        } catch (error) {
            this.user = null;
            this.showGuestNav();
        }
    },

    showAuthenticatedNav() {
        document.querySelectorAll('.nav-guest').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.nav-auth').forEach(el => el.style.display = '');
    },

    showGuestNav() {
        document.querySelectorAll('.nav-guest').forEach(el => el.style.display = '');
        document.querySelectorAll('.nav-auth').forEach(el => el.style.display = 'none');
    },

    setupNavigation() {
        const menuToggle = document.getElementById('menu-toggle');
        const navLinks = document.getElementById('nav-links');

        if (menuToggle && navLinks) {
            menuToggle.addEventListener('click', () => {
                navLinks.classList.toggle('active');
                menuToggle.classList.toggle('active');
            });
        }

        const logoutBtns = document.querySelectorAll('.logout-btn');
        logoutBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                await this.logout();
            });
        });
    },

    setupAnimations() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animate-in');
                }
            });
        }, { threshold: 0.1 });

        document.querySelectorAll('.animate-on-scroll').forEach(el => {
            observer.observe(el);
        });
    },

    /**
     * API sorğusu göndər
     */
    async apiRequest(url, options = {}) {
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const mergedOptions = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...(options.headers || {})
            }
        };

        // FormData üçün Content-Type silmək lazımdır
        if (options.body instanceof FormData) {
            delete mergedOptions.headers['Content-Type'];
        }

        try {
            const response = await fetch(url, mergedOptions);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Xəta baş verdi');
            }

            return data;
        } catch (error) {
            throw error;
        }
    },

    async logout() {
        try {
            await this.apiRequest('/api/auth/logout', { method: 'POST' });
            window.location.href = '/';
        } catch (error) {
            console.error('Çıxış xətası:', error);
            window.location.href = '/';
        }
    },

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-icon">${type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️'}</span>
                <span class="notification-text">${message}</span>
            </div>
        `;
        document.body.appendChild(notification);

        setTimeout(() => notification.classList.add('show'), 10);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 4000);
    },

    showLoading(element) {
        if (element) {
            element.classList.add('loading');
            element.disabled = true;
        }
    },

    hideLoading(element) {
        if (element) {
            element.classList.remove('loading');
            element.disabled = false;
        }
    },

    formatDate(dateStr) {
        const date = new Date(dateStr);
        return date.toLocaleDateString('az-AZ', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    },

    formatCurrency(amount) {
        return parseFloat(amount).toFixed(2) + ' AZN';
    }
};

// Səhifə yükləndikdə başlat
document.addEventListener('DOMContentLoaded', async () => {
    await App.init();
});
