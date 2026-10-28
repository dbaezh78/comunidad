// Service Worker básico para soporte de PWA (Instalación)
const CACHE_NAME = 'comunidad4-cache-v1';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Modo passthrough para red directa
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
