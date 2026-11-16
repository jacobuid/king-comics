import profileAPI from './profile-core.cjs'
import { commands, profileStore } from './profile-store.js'

const encoder = new TextEncoder()
let b2Authorization
function origins(env) { return (env.WEB_ORIGINS ?? 'https://jacobuid.github.io').split(',') }
function json(body, status = 200) { return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } }) }
function base64(bytes) { return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '') }
function unbase64(value) { return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0)) }
async function signingKey(secret) { return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']) }
export async function issueTicket(secret, owner, expires = Date.now() + 3 * 3600_000) {
  const payload = base64(encoder.encode(JSON.stringify({ sub: owner, exp: expires })))
  const signature = await crypto.subtle.sign('HMAC', await signingKey(secret), encoder.encode(payload))
  return { token: `${payload}.${base64(new Uint8Array(signature))}`, expiresAt: expires }
}
export async function verifyTicket(secret, token) {
  try {
    const [payload, signature, extra] = token.split('.')
    if (!payload || !signature || extra || token.length > 1024) return false
    if (!await crypto.subtle.verify('HMAC', await signingKey(secret), unbase64(signature), encoder.encode(payload))) return false
    const ticket = JSON.parse(new TextDecoder().decode(unbase64(payload)))
    return typeof ticket.sub === 'string' && Number.isFinite(ticket.exp) && ticket.exp > Date.now()
  } catch { return false }
}
async function authorizeB2(env, force = false) {
  if (!force && b2Authorization?.expires > Date.now()) return b2Authorization
  const response = await fetch('https://api.backblazeb2.com/b2api/v4/b2_authorize_account', {
    headers: { Authorization: `Basic ${btoa(`${env.B2_KEY_ID}:${env.B2_APPLICATION_KEY}`)}` },
  })
  if (!response.ok) throw new Error('B2 authorization unavailable')
  const auth = await response.json()
  return b2Authorization = { token: auth.authorizationToken, url: auth.apiInfo.storageApi.downloadUrl, expires: Date.now() + 23 * 3600_000 }
}
export function mediaKey(path) {
  try {
    const key = path.split('/').map(decodeURIComponent).join('/')
    if (!/^(comics\/|generated\/covers\/)/.test(key) || key.split('/').some(part => ['.', '..', ''].includes(part)) || /[\\\x00-\x1f]/.test(key)) return null
    return key
  } catch { return null }
}
async function media(request, env, context, token, path) {
  if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405)
  if (!await verifyTicket(env.MEDIA_SIGNING_SECRET, token)) return json({ error: 'Media access expired. Refresh the page.' }, 401)
  const key = mediaKey(path)
  if (!key) return json({ error: 'Not found.' }, 404)
  const cache = caches.default
  const cacheKey = new Request(`${new URL(request.url).origin}/__media-cache/${key.split('/').map(encodeURIComponent).join('/')}`)
  const cacheable = key.startsWith('generated/covers/') && request.method === 'GET' && !request.headers.has('Range')
  if (cacheable) {
    const hit = await cache.match(cacheKey)
    if (hit) return hit
  }
  let origin
  for (let attempt = 0; attempt < 2; attempt++) {
    const auth = await authorizeB2(env, attempt > 0)
    const headers = new Headers({ Authorization: auth.token, 'Accept-Encoding': 'identity' })
    if (request.headers.has('Range')) headers.set('Range', request.headers.get('Range'))
    origin = await fetch(`${auth.url}/file/${encodeURIComponent(env.B2_BUCKET)}/${key.split('/').map(encodeURIComponent).join('/')}`, { method: request.method, headers })
    if (origin.status !== 401) break
    await origin.body?.cancel()
  }
  if (!origin.ok) { await origin.body?.cancel(); return json({ error: 'Comic asset unavailable.' }, origin.status === 404 ? 404 : 502) }
  const headers = new Headers()
  for (const name of ['Content-Type', 'Content-Length', 'Content-Range', 'ETag', 'Last-Modified', 'Accept-Ranges']) {
    const value = origin.headers.get(name)
    if (value) headers.set(name, value)
  }
  headers.set('Cache-Control', cacheable ? 'public, max-age=31536000, immutable' : 'private, max-age=3600')
  headers.set('X-King-Comics-Storage', 'Backblaze-B2')
  const response = new Response(request.method === 'HEAD' ? null : origin.body, { status: origin.status, headers })
  if (cacheable) context.waitUntil(cache.put(cacheKey, response.clone()))
  return response
}
export default {
  async fetch(request, env, context) {
    const origin = request.headers.get('Origin')
    if (origin && !origins(env).includes(origin)) return json({ error: 'Origin not allowed.' }, 403)
    let response
    try {
      const url = new URL(request.url)
      if (request.method === 'OPTIONS') response = new Response(null, { status: 204 })
      else if (url.pathname === '/health') { await env.DB.prepare('SELECT 1 FROM profile_objects LIMIT 1').first(); response = json({ ok: true, storage: 'B2', profiles: 'D1' }) }
      else if (url.pathname === '/media-session' && request.method === 'POST') {
        const owner = await profileAPI._test.authenticatedOwner({ headers: Object.fromEntries(request.headers) })
        response = owner ? json(await issueTicket(env.MEDIA_SIGNING_SECRET, owner)) : json({ error: 'Sign in first.' }, 401)
      } else if (url.pathname.startsWith('/media/')) {
        const parts = url.pathname.slice('/media/'.length).split('/')
        response = await media(request, env, context, parts.shift(), parts.join('/'))
      } else if (url.pathname === '/profiles') {
        if (Number(request.headers.get('Content-Length')) > 1_000_000) return json({ error: 'Request too large.' }, 413)
        const result = await profileAPI.handler({
          rawPath: url.pathname, requestContext: { http: { method: request.method } },
          headers: Object.fromEntries(request.headers),
          body: ['POST', 'PUT', 'PATCH'].includes(request.method) ? await request.text() : undefined,
        }, { commands, client: profileStore(env.DB) })
        response = new Response(result.body, { status: result.statusCode, headers: result.headers })
      } else response = json({ error: 'Not found.' }, 404)
    } catch { response = json({ error: 'Service temporarily unavailable.' }, 503) }
    const headers = new Headers(response.headers)
    if (origin) { headers.set('Access-Control-Allow-Origin', origin); headers.set('Vary', 'Origin') }
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS')
    headers.set('Access-Control-Allow-Headers', 'authorization, content-type, range, x-profile-id, x-profile-name, x-profile-pin')
    headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type, Accept-Ranges, X-King-Comics-Storage')
    headers.set('X-Content-Type-Options', 'nosniff')
    return new Response(response.body, { status: response.status, headers })
  },
}
