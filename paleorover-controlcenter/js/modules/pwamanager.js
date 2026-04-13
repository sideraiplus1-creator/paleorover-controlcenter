/**
 * PWAManager.js
 * Gestiona funcionalidades de Progressive Web App
 */

export class PWAManager {
    constructor() {
        this._deferredPrompt = null;
        this._installed = false;
        this._init();
    }

    _init() {
        // Capturar evento de instalación
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this._deferredPrompt = e;
            this._showInstallButton();
        });

        // Detectar si ya está instalada
        window.addEventListener('appinstalled', () => {
            this._installed = true;
            this._deferredPrompt = null;
            console.log('✅ PWA instalada');
        });

        // Registrar Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('SW registrado:', reg.scope))
                .catch(err => console.warn('SW error:', err));
        }
    }

    _showInstallButton() {
        const btn = document.getElementById('btn-install');
        if (btn) btn.style.display = 'block';
    }

    async promptInstall() {
        if (!this._deferredPrompt) return;
        this._deferredPrompt.prompt();
        const { outcome } = await this._deferredPrompt.userChoice;
        console.log('Instalación:', outcome);
        this._deferredPrompt = null;
    }

    isInstalled() {
        return this._installed || window.matchMedia('(display-mode: standalone)').matches;
    }
}