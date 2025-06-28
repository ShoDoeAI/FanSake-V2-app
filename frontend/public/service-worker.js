// Service Worker for MusicConnect with advanced caching strategies
const CACHE_VERSION = 'v1';
const CACHE_NAMES = {
  static: `static-cache-${CACHE_VERSION}`,
  dynamic: `dynamic-cache-${CACHE_VERSION}`,
  images: `images-cache-${CACHE_VERSION}`,
  api: `api-cache-${CACHE_VERSION}`,
  media: `media-cache-${CACHE_VERSION}`,
};

// Assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/static/css/main.css',
  '/static/js/bundle.js',
  '/static/js/react.js',
  '/manifest.json',
  '/offline.html',
];

// Cache strategies
const CACHE_STRATEGIES = {
  networkFirst: async (request, cacheName) => {
    try {
      const networkResponse = await fetch(request);
      if (networkResponse.ok) {
        const cache = await caches.open(cacheName);
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    } catch (error) {
      const cachedResponse = await caches.match(request);
      if (cachedResponse) {
        return cachedResponse;
      }
      throw error;
    }
  },

  cacheFirst: async (request, cacheName) => {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      // Update cache in background
      fetch(request).then(response => {
        if (response.ok) {
          caches.open(cacheName).then(cache => {
            cache.put(request, response);
          });
        }
      });
      return cachedResponse;
    }
    
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  },

  staleWhileRevalidate: async (request, cacheName) => {
    const cachedResponse = await caches.match(request);
    
    const fetchPromise = fetch(request).then(networkResponse => {
      if (networkResponse.ok) {
        caches.open(cacheName).then(cache => {
          cache.put(request, networkResponse.clone());
        });
      }
      return networkResponse;
    });
    
    return cachedResponse || fetchPromise;
  },

  networkOnly: async (request) => {
    return fetch(request);
  },

  cacheOnly: async (request) => {
    const cachedResponse = await caches.match(request);
    if (!cachedResponse) {
      throw new Error('No cached response found');
    }
    return cachedResponse;
  },
};

// Install event - cache static assets
self.addEventListener('install', event => {
  console.log('Service Worker installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAMES.static)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('Service Worker activating...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (!Object.values(CACHE_NAMES).includes(cacheName)) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-HTTP requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Handle different request types
  if (request.method !== 'GET') {
    // Don't cache non-GET requests
    event.respondWith(CACHE_STRATEGIES.networkOnly(request));
    return;
  }

  // API requests - network first with timeout
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      Promise.race([
        timeout(3000),
        CACHE_STRATEGIES.networkFirst(request, CACHE_NAMES.api)
      ]).catch(() => caches.match('/offline.html'))
    );
    return;
  }

  // Image requests - cache first
  if (request.destination === 'image' || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url.pathname)) {
    event.respondWith(
      CACHE_STRATEGIES.cacheFirst(request, CACHE_NAMES.images)
        .catch(() => caches.match('/assets/placeholder.png'))
    );
    return;
  }

  // Media files - range requests support
  if (/\.(mp3|mp4|webm|ogg|wav)$/i.test(url.pathname)) {
    event.respondWith(handleRangeRequest(request));
    return;
  }

  // Static assets - stale while revalidate
  if (url.pathname.startsWith('/static/') || STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      CACHE_STRATEGIES.staleWhileRevalidate(request, CACHE_NAMES.static)
    );
    return;
  }

  // HTML pages - network first
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      CACHE_STRATEGIES.networkFirst(request, CACHE_NAMES.dynamic)
        .catch(() => caches.match('/offline.html'))
    );
    return;
  }

  // Default - stale while revalidate
  event.respondWith(
    CACHE_STRATEGIES.staleWhileRevalidate(request, CACHE_NAMES.dynamic)
  );
});

// Handle range requests for media streaming
async function handleRangeRequest(request) {
  const cache = await caches.open(CACHE_NAMES.media);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  const response = await fetch(request);
  
  // Only cache successful responses
  if (response.status === 200) {
    cache.put(request, response.clone());
  }
  
  return response;
}

// Background sync for offline actions
self.addEventListener('sync', event => {
  if (event.tag === 'sync-uploads') {
    event.waitUntil(syncUploads());
  } else if (event.tag === 'sync-analytics') {
    event.waitUntil(syncAnalytics());
  }
});

// Push notifications
self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : 'New update from MusicConnect',
    icon: '/icon-192x192.png',
    badge: '/badge-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'Go to app',
        icon: '/checkmark.png'
      },
      {
        action: 'close',
        title: 'Close notification',
        icon: '/xmark.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('MusicConnect', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Message handler for cache management
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then(cacheNames => 
        Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)))
      )
    );
  }
  
  if (event.data && event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      cacheUrls(event.data.urls)
    );
  }
});

// Utility functions
function timeout(ms) {
  return new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Request timeout')), ms)
  );
}

async function syncUploads() {
  // Implement upload sync logic
  const db = await openDB();
  const uploads = await db.getAll('pending-uploads');
  
  for (const upload of uploads) {
    try {
      await fetch('/api/uploads', {
        method: 'POST',
        body: upload.data,
      });
      await db.delete('pending-uploads', upload.id);
    } catch (error) {
      console.error('Failed to sync upload:', error);
    }
  }
}

async function syncAnalytics() {
  // Implement analytics sync logic
  const db = await openDB();
  const events = await db.getAll('analytics-events');
  
  if (events.length > 0) {
    try {
      await fetch('/api/analytics/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(events),
      });
      await db.clear('analytics-events');
    } catch (error) {
      console.error('Failed to sync analytics:', error);
    }
  }
}

async function cacheUrls(urls) {
  const cache = await caches.open(CACHE_NAMES.dynamic);
  await cache.addAll(urls);
}

// IndexedDB wrapper for offline storage
async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('MusicConnectDB', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = event => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('pending-uploads')) {
        db.createObjectStore('pending-uploads', { keyPath: 'id', autoIncrement: true });
      }
      
      if (!db.objectStoreNames.contains('analytics-events')) {
        db.createObjectStore('analytics-events', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

// Performance monitoring
const performanceObserver = new PerformanceObserver(list => {
  for (const entry of list.getEntries()) {
    // Send performance metrics to analytics
    if (entry.entryType === 'resource' && entry.duration > 1000) {
      console.warn('Slow resource:', entry.name, entry.duration);
    }
  }
});

performanceObserver.observe({ entryTypes: ['resource', 'navigation'] });