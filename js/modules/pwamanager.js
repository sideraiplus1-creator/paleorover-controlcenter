/**
 * PWAManager.js
 * Gestión de Progressive Web App (PWA) - Instalación y actualizaciones
 */

export class PWAManager {
    constructor() {
        this.deferredPrompt = null;
        this._initInstallPrompt();
        this._registerServiceWorker();
    }

    // ═══════════════════════════════════════════════════════
    // INSTALACIÓN PWA
    // ═══════════════════════════════════════════════════════

    _initInstallPrompt() {
        // Detectar cuando el navegador muestra el prompt de instalación
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            // El botón "Instalar" ya está disponible
            console.log('📱 PWA instalable detectada');
        });

        // Manejar el resultado de la instalación
        window.addEventListener('appinstalled', () => {
            console.log('✅ PWA instalada en el dispositivo');
            this.deferredPrompt = null;
        });
    }

    /**
     * Muestra el prompt de instalación
     */
    async install() {
        if (!this.deferredPrompt) {
            console.warn('El prompt de instalación no está disponible');
            return false;
        }

        try {
            this.deferredPrompt.prompt();
            const { outcome } = await this.deferredPrompt.userChoice;
            console.log(`Usuario ${outcome === 'accepted' ? 'aceptó' : 'rechazó'} la instalación`);
            this.deferredPrompt = null;
            return outcome === 'accepted';
        } catch (error) {
            console.error('Error al instalar PWA:', error);
            return false;
        }
    }

    // ═══════════════════════════════════════════════════════
    // SERVICE WORKER
    // ═══════════════════════════════════════════════════════

    async _registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('./sw.js');
                console.log('✅ Service Worker registrado:', registration);

                // Detectar actualizaciones
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'activated') {
                            console.log('🔄 Nueva versión de PWA disponible');
                            this._notifyUpdate();
                        }
                    });
                });
            } catch (error) {
                console.warn('Service Worker no disponible:', error);
            }
        }
    }

    /**
     * Notifica al usuario sobre actualizaciones
     */
    _notifyUpdate() {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Paleo Rover - Actualización disponible', {
                body: 'Se ha detectado una nueva versión. Recarga para actualizar.',
                icon: './icons/paleorover-192.png'
            });
        }
    }

    // ═══════════════════════════════════════════════════════
    // UTILIDADES
    // ═══════════════════════════════════════════════════════

    /**
     * Verifica si la app está instalada
     */
    isInstalled() {
        return window.matchMedia('(display-mode: standalone)').matches ||
               navigator.standalone === true;
    }

    /**
     * Obtiene información de la app
     */
    getInfo() {
        return {
            installed: this.isInstalled(),
            standalone: navigator.standalone,
            pwaEnabled: 'serviceWorker' in navigator,
            online: navigator.onLine
        };
    }

    /**
     * Solicita permiso de notificaciones
     */
    async requestNotificationPermission() {
        if ('Notification' in window) {
            if (Notification.permission === 'default') {
                const permission = await Notification.requestPermission();
                return permission === 'granted';
            }
            return Notification.permission === 'granted';
        }
        return false;
    }
}