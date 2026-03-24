/**
 * PWAManager.js
 * Progressive Web App - Funciona sin internet
 */

export class PWAManager {
    constructor() {
        this.isInstalled = false;
        this.deferredPrompt = null;
        
        this._init();
    }
    
    _init() {
        // Detectar si ya está instalada
        if (window.matchMedia('(display-mode: standalone)').matches) {
            this.isInstalled = true;
        }
        
        // Capturar evento de instalación
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            this._showInstallButton();
        });
        
        // Detectar instalación completada
        window.addEventListener('appinstalled', () => {
            this.isInstalled = true;
            this.deferredPrompt = null;
            this._hideInstallButton();
            console.log('PWA instalada');
        });
        
        // Registrar Service Worker
        this._registerSW();
    }
    
    async _registerSW() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js');
                console.log('SW registrado:', registration);
            } catch (error) {
                console.error('Error registrando SW:', error);
            }
        }
    }
    
    _showInstallButton() {
        const btn = document.getElementById('btnInstall');
        if (btn) btn.style.display = 'block';
    }
    
    _hideInstallButton() {
        const btn = document.getElementById('btnInstall');
        if (btn) btn.style.display = 'none';
    }
    
    async install() {
        if (!this.deferredPrompt) return;
        
        this.deferredPrompt.prompt();
        const { outcome } = await this.deferredPrompt.userChoice;
        
        if (outcome === 'accepted') {
            console.log('Usuario aceptó instalación');
        }
        
        this.deferredPrompt = null;
    }
    
    // ═══════════════════════════════════════════════════════
    // CACHE DE RECURSOS
    // ═══════════════════════════════════════════════════════
    
    async cacheResources() {
        const cache = await caches.open('paleo-rover-v1');
        
        const resources = [
            '/',
            '/index.html',
            '/css/styles.css',
            '/js/main.js',
            '/js/modules/RobotState.js',
            '/js/modules/UIController.js',
            '/js/modules/MapRenderer.js',
            '/js/modules/CommandSender.js',
            '/js/modules/EventHandlers.js',
            '/js/modules/ConnectionManager.js',
            '/js/modules/ProtocolHandler.js',
            '/js/modules/StorageManager.js',
            '/js/modules/AudioFeedback.js',
            '/js/modules/ChartManager.js',
            '/js/modules/MissionRecorder.js'
        ];
        
        await cache.addAll(resources);
        console.log('Recursos cacheados');
    }
}
