// Offline support: serve cached files instantly, refresh them in the background.
const CACHE = 'sport-clock-v1'
const FILES = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'whistle.wav',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
  'manifest.webmanifest',
]

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(e.request, { ignoreSearch: true })
      const network = fetch(e.request)
        .then((res) => {
          if (res.ok) cache.put(e.request, res.clone())
          return res
        })
        .catch(() => cached)
      return cached || network
    })
  )
})
