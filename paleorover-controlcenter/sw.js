/**
 * sw.js
 * Service Worker para modo offline
 */

const CACHE_NAME = 'paleo-rover-v5';
const urlsToCache = [
    'index.html',
    'css/styles.css',
    'js/main.js',
    'js/modules/robotstate.js',
    'js/modules/uicontroller.js',
    'js/modules/maprenderer.js',
    'js/modules/commandsender.js',
    'js/modules/eventhandlers.js',
    'js/modules/connectionmanager.js',
    'js/modules/protocolhandler.js',
    'js/modules/storagemanager.js',
    'js/modules/audiofeedback.js',
    'js/modules/chartmanager.js',
    'js/modules/missionrecorder.js',
    'js/modules/pwamanager.js',
    'manifest.json',
    'sw.js'
];

// Instalación
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
    self.skipWaiting();
});

// Activación
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => caches.delete(name))
            );
        })
    );
    self.clients.claim();
});

// Fetch - estrategia stale-while-revalidate
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Cache hit - retornar y actualizar en background
                const fetchPromise = fetch(event.request)
                    .then(networkResponse => {
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, networkResponse.clone());
                        });
                        return networkResponse;
                    })
                    .catch(() => response); // Fallback a cache
                
                return response || fetchPromise;
            })
    );
});
