// File: /seabird-survey/sw.js

const CACHE_NAME = 'seabird-offline-v1';

// 1. Install Event: Activates the worker immediately
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

// 2. Activate Event: Cleans up any old caches and takes control
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 3. Fetch Event: The "Traffic Cop" that routes requests
self.addEventListener('fetch', (event) => {
    // Only intercept standard GET requests (ignore local data saves)
    if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) return;

    // Check if the request is asking for an ArcGIS map tile
    const isMapTile = event.request.url.includes('arcgisonline.com');

    if (isMapTile) {
        // STRATEGY A: Map Tiles -> CACHE FIRST, fall back to Network
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                // If we already saved this map tile, serve it instantly from offline memory
                if (cachedResponse) {
                    return cachedResponse;
                }
                
                // If not, fetch it from the internet, then save a copy for next time
                return fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
                    }
                    return networkResponse;
                }).catch(() => {
                    // If entirely offline and tile isn't cached, Leaflet's 1x1 invisible pixel takes over
                });
            })
        );
    } else {
        // STRATEGY B: App Files (HTML, JS, CSS) -> NETWORK FIRST, fall back to Cache
        event.respondWith(
            fetch(event.request).then((networkResponse) => {
                // Try to get the newest code from GitHub. If successful, update the offline cache.
                if (networkResponse && networkResponse.status === 200) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
                }
                return networkResponse;
            }).catch(() => {
                // If offline, retrieve the last known working version from the cache
                return caches.match(event.request);
            })
        );
    }
});