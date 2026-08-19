const cacheName = 'king-comics-shell-v2'
const scopeUrl = new URL(self.registration.scope)
const appRoot = scopeUrl.pathname
const isLocalDevelopment = ['localhost', '127.0.0.1'].includes(scopeUrl.hostname)
const shellUrls = [
  appRoot,
  `${appRoot}favicon/favicon-32x32.png`,
  `${appRoot}favicon/apple-touch-icon.png`,
  `${appRoot}favicon/android-chrome-192x192.png`,
  `${appRoot}favicon/android-chrome-512x512.png`,
  `${appRoot}favicon/site.webmanifest`,
]

async function cacheShell() {
  const cache = await caches.open(cacheName)
  await cache.addAll(shellUrls)

  const rootResponse = await cache.match(appRoot)
  if (!rootResponse) return

  const html = await rootResponse.text()
  const assetUrls = [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
    .map(([, value]) => new URL(value, self.registration.scope))
    .filter((url) => (
      url.origin === self.location.origin
      && url.pathname.startsWith(`${appRoot}assets/`)
    ))
    .map((url) => url.href)

  await cache.addAll([...new Set(assetUrls)])
}

self.addEventListener('install', (event) => {
  if (isLocalDevelopment) {
    event.waitUntil(self.skipWaiting())
    return
  }

  event.waitUntil(
    cacheShell()
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  if (isLocalDevelopment) {
    event.waitUntil(
      caches.keys()
        .then((keys) => Promise.all(
          keys
            .filter((key) => key.startsWith('king-comics-'))
            .map((key) => caches.delete(key)),
        ))
        .then(() => self.registration.unregister())
        .then(() => self.clients.claim()),
    )
    return
  }

  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('king-comics-') && key !== cacheName)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  )
})

async function networkFirst(request) {
  const cache = await caches.open(cacheName)

  try {
    const response = await fetch(request)
    if (response.ok) await cache.put(request, response.clone())
    return response
  } catch {
    return (await cache.match(request)) ?? cache.match(appRoot)
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(cacheName)
    await cache.put(request, response.clone())
  }
  return response
}

self.addEventListener('fetch', (event) => {
  if (isLocalDevelopment) return

  const request = event.request
  const url = new URL(request.url)

  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
    return
  }

  event.respondWith(cacheFirst(request))
})
