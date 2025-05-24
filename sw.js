// sw.js - Service Worker for SafeWay Invoicing PWA
// Version: v4 - Revised structure and comments

// --- CONFIGURATION ---

// Define the cache name.
// **IMPORTANT**: Increment this version number (e.g., v4, v5, v6)
// whenever you update the service worker logic or the list of precached assets.
// This is essential for triggering the update process for existing users.
const CACHE_NAME = 'safeway-invoicing-cache-v4';

// List of URLs to precache when the service worker is installed.
// These are the core "app shell" assets needed for your PWA to run offline.
const URLS_TO_PRECACHE = [
  './', // Alias for index.html at the root
  './index.html',
  './style.css',
  './manifest.json', // Important for PWA installability
  './offline.html', // Fallback page for offline/error scenarios
  // Icons (ensure these paths are correct and all necessary icons are listed)
  './images/icon-192x192.png',
  './images/icon-256x256.png',
  './images/icon-384x384.png',
  './images/icon-512x512.png',
  // './images/icon-maskable-192x192.png', // Add if you have a maskable icon
  './images/logo.png' // Your app's logo, if used directly
  // Add other critical JS files or assets if they are not loaded via CDN
  // and are essential for the basic app shell to function.
];

// List of CDN domains you want to cache.
// Requests to these domains will also be cached.
const CDN_CACHE_DOMAINS = [
  'cdn.tailwindcss.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
  'www.gstatic.com' // For Firebase SDKs, if you want to cache them (can be large)
];

// --- SERVICE WORKER LIFECYCLE EVENTS ---

// INSTALL: Fired when the service worker is first registered and installed.
// Use this to precache your app shell.
self.addEventListener('install', event => {
  console.log(`[Service Worker V${CACHE_NAME.split('-').pop()}] Install event`);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log(`[Service Worker V${CACHE_NAME.split('-').pop()}] Precaching app shell assets:`, URLS_TO_PRECACHE);
        // Use { cache: 'reload' } to ensure fresh copies are fetched from the network,
        // bypassing the browser's HTTP cache during installation.
        const cachePromises = URLS_TO_PRECACHE.map(urlToPrecache => {
          return cache.add(new Request(urlToPrecache, { cache: 'reload' }))
            .catch(err => console.warn(`[Service Worker V${CACHE_NAME.split('-').pop()}] Failed to cache ${urlToPrecache}:`, err));
        });
        return Promise.all(cachePromises);
      })
      .then(() => {
        console.log(`[Service Worker V${CACHE_NAME.split('-').pop()}] App shell assets cached successfully.`);
        // Force the waiting service worker to become the active service worker.
        // Optional: self.skipWaiting(); // Use with caution, ensure clients are ready for immediate SW update.
      })
      .catch(error => {
        console.error(`[Service Worker V${CACHE_NAME.split('-').pop()}] Precache failed during install:`, error);
      })
  );
});

// ACTIVATE: Fired when the service worker is activated.
// Use this to clean up old caches.
self.addEventListener('activate', event => {
  console.log(`[Service Worker V${CACHE_NAME.split('-').pop()}] Activate event`);
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Delete any caches that are not the current CACHE_NAME.
          if (cacheName !== CACHE_NAME) {
            console.log(`[Service Worker V${CACHE_NAME.split('-').pop()}] Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      ).then(() => {
        console.log(`[Service Worker V${CACHE_NAME.split('-').pop()}] Old caches cleaned up.`);
        // Take control of all open clients (pages) immediately.
        return self.clients.claim();
      });
    })
  );
});

// --- FETCH EVENT: Intercept network requests ---
self.addEventListener('fetch', event => {
  const request = event.request;
  const requestUrl = new URL(request.url);

  // Ignore non-GET requests (POST, PUT, etc.) as they are not typically cacheable
  // and can have side effects.
  if (request.method !== 'GET') {
    // console.log(`[Service Worker V${CACHE_NAME.split('-').pop()}] Ignoring non-GET request: ${request.method} ${requestUrl.pathname}`);
    return;
  }

  // Strategy 1: Same-origin requests (your app's files)
  // Cache-First, then Network. If network fetch is successful, update the cache.
  if (requestUrl.origin === self.location.origin) {
    event.respondWith(
      caches.match(request)
        .then(cachedResponse => {
          if (cachedResponse) {
            // console.log(`[Service Worker V${CACHE_NAME.split('-').pop()}] Serving from cache (same-origin): ${requestUrl.pathname}`);
            return cachedResponse;
          }

          // Not in cache, fetch from network
          // console.log(`[Service Worker V${CACHE_NAME.split('-').pop()}] Fetching from network (same-origin): ${requestUrl.pathname}`);
          return fetch(request)
            .then(networkResponse => {
              // Check if we received a valid response
              if (networkResponse && networkResponse.ok) {
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME)
                  .then(cache => {
                    cache.put(request, responseToCache);
                    // console.log(`[Service Worker V${CACHE_NAME.split('-').pop()}] Cached new resource (same-origin): ${requestUrl.pathname}`);
                  });
              }
              return networkResponse;
            })
            .catch(error => {
              console.warn(`[Service Worker V${CACHE_NAME.split('-').pop()}] Network fetch failed for (same-origin) ${requestUrl.pathname}:`, error);
              // If it's a navigation request (e.g., trying to load an HTML page)
              // and network fails, serve the offline.html page.
              if (request.mode === 'navigate' || request.destination === 'document') {
                console.log(`[Service Worker V${CACHE_NAME.split('-').pop()}] Serving offline.html for failed navigation to ${requestUrl.pathname}`);
                return caches.match('./offline.html');
              }
              // For other assets (images, scripts), let the browser handle the error.
              // You could return a placeholder image/resource here if desired.
              return new Response('Network error or resource not found.', { status: 503, statusText: 'Service Unavailable (Same-Origin)' });
            });
        })
    );
    return;
  }

  // Strategy 2: Cross-origin requests (CDNs, APIs, etc.)
  // Cache-First, then Network for specified CDN domains.
  // This helps make CDN assets available offline too.
  if (CDN_CACHE_DOMAINS.some(domain => requestUrl.hostname.includes(domain))) {
    event.respondWith(
      caches.match(request)
        .then(cachedResponse => {
          if (cachedResponse) {
            // console.log(`[Service Worker V${CACHE_NAME.split('-').pop()}] Serving from cache (CDN): ${request.url}`);
            return cachedResponse;
          }

          // console.log(`[Service Worker V${CACHE_NAME.split('-').pop()}] Fetching from network (CDN): ${request.url}`);
          return fetch(request)
            .then(networkResponse => {
              // Cache opaque responses from CDNs, but only if they don't error out.
              // A "valid" response here means status 200 or an opaque response (type 'opaque').
              if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME)
                  .then(cache => {
                    cache.put(request, responseToCache);
                    // console.log(`[Service Worker V${CACHE_NAME.split('-').pop()}] Cached new resource (CDN): ${request.url}`);
                  });
              }
              return networkResponse;
            })
            .catch(error => {
              console.warn(`[Service Worker V${CACHE_NAME.split('-').pop()}] Network fetch failed for (CDN) ${request.url}:`, error);
              // For CDN assets, failing might mean some styling or fonts are missing,
              // but the app might still be usable.
              // You could return a generic error or let the browser handle it.
            });
        })
    );
    return;
  }

  // Strategy 3: Default - Network-First for all other requests.
  // (This part might not be reached often if your assets are same-origin or from specified CDNs)
  // console.log(`[Service Worker V${CACHE_NAME.split('-').pop()}] Default network fetch for: ${request.url}`);
  event.respondWith(
    fetch(request)
      .catch(error => {
        console.warn(`[Service Worker V${CACHE_NAME.split('-').pop()}] Default network fetch failed for ${request.url}:`, error);
        // Provide a generic offline response for other failed requests if appropriate,
        // or the specific offline.html for navigation.
        if (request.mode === 'navigate' || request.destination === 'document') {
          return caches.match('./offline.html');
        }
      })
  );
});
