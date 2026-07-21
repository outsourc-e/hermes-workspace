// Hermes Workspace Service Worker
// Network-only PWA registration: enables installability without caching app assets.
// This avoids stale bundles after PM2/Vite preview deploys while keeping iOS/Chrome
// standalone launches on the normal live application shell.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', () => {
  // Deliberately do not call event.respondWith(). Every request goes to the
  // browser/network stack directly, so the app never serves stale cached JS/CSS.
})
