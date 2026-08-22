const ACCOUNTS_KEY = 'king-comics.accounts.v1'
const SESSION_KEY = 'king-comics.session.v1'
const SESSION_COOKIE = 'king_comics_session'
const SESSION_SECONDS = 60 * 60 * 24 * 7

export const PROFILES_CHANGED_EVENT = 'king-comics:profiles-changed'
export const SESSION_CHANGED_EVENT = 'king-comics:session-changed'

const encoder = new TextEncoder()

function notifyProfilesChanged() {
  window.dispatchEvent(new Event(PROFILES_CHANGED_EVENT))
}

function notifySessionChanged() {
  window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
}

function normalizeName(name) {
  return name.trim().normalize('NFKC').toLowerCase()
}

function bytesToBase64(bytes) {
  let binary = ''

  for (const byte of bytes) binary += String.fromCharCode(byte)

  return btoa(binary)
}

function randomToken(byteLength = 32) {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(byteLength)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

async function hashToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token))
  return bytesToBase64(new Uint8Array(digest))
}

function safeEqual(first, second) {
  if (first.length !== second.length) return false

  let difference = 0

  for (let index = 0; index < first.length; index += 1) {
    difference |= first.charCodeAt(index) ^ second.charCodeAt(index)
  }

  return difference === 0
}

function readAccounts() {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY)) ?? {}
  } catch {
    return {}
  }
}

function readCookie(name) {
  const prefix = `${name}=`
  const cookie = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(prefix))

  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null
}

function cookiePath() {
  return import.meta.env.BASE_URL || '/'
}

export function createAccount(name, options = {}) {
  const displayName = name.trim().normalize('NFKC')
  const username = normalizeName(name)

  if (!username) throw new Error('Enter a name for this profile.')

  const accounts = readAccounts()

  if (accounts[username]) throw new Error('A profile with that name already exists.')

  accounts[username] = {
    name: displayName,
    username,
    createdAt: new Date().toISOString(),
    synced: Boolean(options.synced),
  }

  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
  notifyProfilesChanged()
  return accounts[username]
}

export function upsertAccount(name, options = {}) {
  const displayName = name.trim().normalize('NFKC')
  const username = options.username ?? normalizeName(name)

  if (!username) throw new Error('Enter a name for this profile.')

  const accounts = readAccounts()
  const existing = accounts[username]

  accounts[username] = {
    ...existing,
    name: displayName,
    username,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    synced: options.synced ?? existing?.synced ?? false,
  }

  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
  notifyProfilesChanged()
  return accounts[username]
}

export function listAccounts() {
  if (typeof window === 'undefined') return []

  return Object.values(readAccounts()).sort((first, second) =>
    first.name.localeCompare(second.name),
  )
}

export function deleteAccount(username) {
  const accounts = readAccounts()

  if (!accounts[username]) return

  delete accounts[username]
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
  notifyProfilesChanged()

  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY))
    if (session?.username === username) clearSession()
  } catch {
    clearSession()
  }
}

export function renameAccount(currentUsername, newName) {
  const displayName = newName.trim().normalize('NFKC')
  const nextUsername = normalizeName(newName)

  if (!nextUsername) throw new Error('Enter a name for this profile.')

  const accounts = readAccounts()
  const account = accounts[currentUsername]

  if (!account) throw new Error('This profile could not be found.')
  if (account.synced) {
    const updatedAccount = {
      ...account,
      name: displayName,
    }

    accounts[currentUsername] = updatedAccount
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
    notifyProfilesChanged()
    return updatedAccount
  }
  if (nextUsername !== currentUsername && accounts[nextUsername]) {
    throw new Error('A profile with that name already exists.')
  }

  const updatedAccount = {
    ...account,
    name: displayName,
    username: nextUsername,
  }

  delete accounts[currentUsername]
  accounts[nextUsername] = updatedAccount
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))

  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY))
    if (session?.username === currentUsername) {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        ...session,
        username: nextUsername,
      }))
    }
  } catch {
    clearSession()
  }

  notifyProfilesChanged()
  return updatedAccount
}

export async function createSession(username) {
  const token = randomToken()
  const expiresAt = Date.now() + SESSION_SECONDS * 1000
  const session = {
    username,
    tokenHash: await hashToken(token),
    expiresAt,
  }

  localStorage.setItem(SESSION_KEY, JSON.stringify(session))

  const secure = location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=${cookiePath()}; Max-Age=${SESSION_SECONDS}; Expires=${new Date(expiresAt).toUTCString()}; SameSite=Lax${secure}`
  notifySessionChanged()
}

export async function getCurrentUser() {
  if (typeof window === 'undefined') return null

  const token = readCookie(SESSION_COOKIE)
  let session

  try {
    session = JSON.parse(localStorage.getItem(SESSION_KEY))
  } catch {
    session = null
  }

  if (!token || !session || session.expiresAt <= Date.now()) {
    clearSession()
    return null
  }

  const tokenHash = await hashToken(token)

  if (!safeEqual(tokenHash, session.tokenHash)) {
    clearSession()
    return null
  }

  return readAccounts()[session.username] ?? null
}

export function clearSession() {
  if (typeof window === 'undefined') return

  const hadSession = Boolean(localStorage.getItem(SESSION_KEY) || readCookie(SESSION_COOKIE))
  localStorage.removeItem(SESSION_KEY)
  document.cookie = `${SESSION_COOKIE}=; Path=${cookiePath()}; Max-Age=0; SameSite=Lax`
  if (hadSession) notifySessionChanged()
}
