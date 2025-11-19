const CACHE_NAME = 'gyroscope-pwa-v1';
const urlsToCache = [
  '/',
  '/manifest.json',
  'https://cdn.tailwindcss.com',
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        return response || fetch(event.request);
      }
    )
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Background sync for saving measurements when offline
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  // Get pending measurements from IndexedDB
  const pendingMeasurements = await getPendingMeasurements();
  
  for (const measurement of pendingMeasurements) {
    try {
      const response = await fetch('/api/measurements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(measurement)
      });
      
      if (response.ok) {
        await removePendingMeasurement(measurement.id);
      }
    } catch (error) {
      console.error('Failed to sync measurement:', error);
    }
  }
}

// IndexedDB helpers for offline storage
async function getPendingMeasurements() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('GyroscopePWA', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['pendingMeasurements'], 'readonly');
      const store = transaction.objectStore('pendingMeasurements');
      const getAllRequest = store.getAll();
      
      getAllRequest.onsuccess = () => resolve(getAllRequest.result);
      getAllRequest.onerror = () => reject(getAllRequest.error);
    };
    
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('pendingMeasurements')) {
        db.createObjectStore('pendingMeasurements', { keyPath: 'id' });
      }
    };
  });
}

async function removePendingMeasurement(id) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('GyroscopePWA', 1);
    
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['pendingMeasurements'], 'readwrite');
      const store = transaction.objectStore('pendingMeasurements');
      const deleteRequest = store.delete(id);
      
      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () => reject(deleteRequest.error);
    };
  });
}

// Push notification handling
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : '역경사 측정을 시작할 시간입니다!',
    icon: '/manifest.json',
    badge: '/manifest.json',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'start-measurement',
        title: '측정 시작',
        icon: '/manifest.json'
      },
      {
        action: 'dismiss',
        title: '닫기'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('역경사각도기', options)
  );
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'start-measurement') {
    event.waitUntil(
      clients.openWindow('/?action=start')
    );
  } else if (event.action === 'dismiss') {
    // Just close the notification
  } else {
    // Default action - open the app
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});
