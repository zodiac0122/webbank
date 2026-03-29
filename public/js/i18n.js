/**
 * i18n.js - Dil dəyişdirmə sistemi
 * Language switching system / Система переключения языков
 */

const I18n = {
    currentLang: 'az',
    translations: {},

    /**
     * Dili başlat / Initialize language / Инициализация языка
     */
    async init() {
        const savedLang = localStorage.getItem('webbank_lang') || 'az';
        await this.setLanguage(savedLang);
    },

    /**
     * Dili dəyişdir / Change language / Изменить язык
     */
    async setLanguage(lang) {
        try {
            const response = await fetch(`/lang/${lang}.json`);
            if (!response.ok) throw new Error('Language file not found');
            this.translations = await response.json();
            this.currentLang = lang;
            localStorage.setItem('webbank_lang', lang);
            this.updatePage();
            this.updateLangSelector();
        } catch (error) {
            console.error('Dil yükləmə xətası:', error);
            if (lang !== 'az') {
                await this.setLanguage('az');
            }
        }
    },

    /**
     * Tərcümə al / Get translation / Получить перевод
     */
    t(key) {
        const keys = key.split('.');
        let value = this.translations;
        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                return key;
            }
        }
        return value;
    },

    /**
     * Səhifədəki bütün [data-i18n] elementlərini yenilə
     * Update all elements with data-i18n attribute
     */
    updatePage() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const translation = this.t(key);
            if (translation && translation !== key) {
                if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                    el.placeholder = translation;
                } else {
                    el.textContent = translation;
                }
            }
        });

        // data-i18n-html attributu ilə HTML məzmunu yenilə
        document.querySelectorAll('[data-i18n-html]').forEach(el => {
            const key = el.getAttribute('data-i18n-html');
            const translation = this.t(key);
            if (translation && translation !== key) {
                el.innerHTML = translation;
            }
        });

        // Title yenilə / Update title
        const titleKey = document.querySelector('title[data-i18n]');
        if (titleKey) {
            document.title = this.t(titleKey.getAttribute('data-i18n'));
        }
    },

    /**
     * Dil seçicisini yenilə / Update language selector
     */
    updateLangSelector() {
        const selector = document.getElementById('lang-selector');
        if (selector) {
            selector.value = this.currentLang;
        }
    },

    /**
     * Dil seçicisi yaratmaq üçün HTML
     */
    createSelector() {
        return `
            <select id="lang-selector" class="lang-selector" onchange="I18n.setLanguage(this.value)">
                <option value="az" ${this.currentLang === 'az' ? 'selected' : ''}>🇦🇿 AZ</option>
                <option value="ru" ${this.currentLang === 'ru' ? 'selected' : ''}>🇷🇺 RU</option>
                <option value="en" ${this.currentLang === 'en' ? 'selected' : ''}>🇬🇧 EN</option>
            </select>
        `;
    }
};

// Səhifə yükləndikdə dili başlat / Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    I18n.init();
});
