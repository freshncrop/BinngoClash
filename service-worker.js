// Enhanced Service Worker for Location Tracking
const CACHE_NAME = 'location-tracker-v2';

// API Configuration
const API_CONFIG = {
    url: 'https://nhfyodexozunbdepgdlz.supabase.co/rest/v1/location',
    headers: {
        'apikey': 'sb_publishable_rYYf2tEHhpCtENhAUWizuQ_mS2yadt2',
        'Authorization': 'Bearer sb_publishable_rYYf2tEHhpCtENhAUWizuQ_mS2yadt2',
        'Content-Type': 'application/json'
    }
};

// Install
self.addEventListener('install', function(event) {
    console.log('SW: Installing...');
    self.skipWaiting();
});

// Activate
self.addEventListener('activate', function(event) {
    console.log('SW: Activating...');
    event.waitUntil(self.clients.claim());
});

// Background Sync (when browser comes back online)
self.addEventListener('sync', function(event) {
    console.log('SW: Background sync triggered:', event.tag);

    if (event.tag === 'location-sync') {
        event.waitUntil(doLocationSync());
    }
});

// Periodic Background Sync (Chrome/Edge)
self.addEventListener('periodicsync', function(event) {
    console.log('SW: Periodic sync triggered:', event.tag);

    if (event.tag === 'location-periodic-sync') {
        event.waitUntil(doLocationSync());
    }
});

// Handle messages from main thread
self.addEventListener('message', function(event) {
    if (event.data) {
        if (event.data.type === 'START_TRACKING') {
            console.log('SW: Starting background tracking');
            startBackgroundTracking();
        } else if (event.data.type === 'STOP_TRACKING') {
            console.log('SW: Stopping background tracking');
            stopBackgroundTracking();
        } else if (event.data.type === 'LOCATION_UPDATE') {
            // Store location for background sync
            storeLocationData(event.data.location);
        }
    }
});

let backgroundTimer = null;

function startBackgroundTracking() {
    // Register periodic sync if supported
    if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
        // Register background sync
        self.registration.sync.register('location-sync');
    }

    // Register periodic sync if supported (Chrome/Edge only)
    if ('periodicSync' in self.registration) {
        self.registration.periodicSync.register('location-periodic-sync', {
            minInterval: 5 * 60 * 1000 // 5 minutes
        }).then(() => {
            console.log('SW: Periodic sync registered');
        }).catch((error) => {
            console.log('SW: Periodic sync failed:', error);
        });
    }

    // Fallback timer for other browsers
    if (backgroundTimer) clearInterval(backgroundTimer);
    backgroundTimer = setInterval(() => {
        doLocationSync();
    }, 5 * 60 * 1000); // 5 minutes
}

function stopBackgroundTracking() {
    if (backgroundTimer) {
        clearInterval(backgroundTimer);
        backgroundTimer = null;
    }
}

async function doLocationSync() {
    try {
        console.log('SW: Attempting location sync');

        // Get stored location data
        const locationData = await getStoredLocation();
        if (!locationData) {
            console.log('SW: No stored location data');
            return;
        }

        // Send to API
        const response = await fetch(API_CONFIG.url, {
            method: 'POST',
            headers: API_CONFIG.headers,
            body: JSON.stringify(locationData)
        });

        if (response.ok) {
            console.log('SW: Location sync successful');
            // Notify main thread
            broadcastToClients({ type: 'SYNC_SUCCESS', location: locationData });
        } else {
            console.log('SW: Location sync failed:', response.status);
        }
    } catch (error) {
        console.log('SW: Location sync error:', error);
    }
}

async function storeLocationData(location) {
    try {
        // Store in IndexedDB for persistence
        const db = await openDB();
        const transaction = db.transaction(['locations'], 'readwrite');
        const store = transaction.objectStore('locations');
        await store.put(location, 'current');
        console.log('SW: Location data stored');
    } catch (error) {
        console.log('SW: Failed to store location:', error);
    }
}

async function getStoredLocation() {
    try {
        const db = await openDB();
        const transaction = db.transaction(['locations'], 'readonly');
        const store = transaction.objectStore('locations');
        const location = await store.get('current');
        return location;
    } catch (error) {
        console.log('SW: Failed to get stored location:', error);
        return null;
    }
}

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('LocationTrackerDB', 1);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('locations')) {
                db.createObjectStore('locations');
            }
        };
    });
}

function broadcastToClients(message) {
    self.clients.matchAll().then(clients => {
        clients.forEach(client => {
            client.postMessage(message);
        });
    });
}