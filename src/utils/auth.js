const ACCOUNTS_KEY = 'king-comics.accounts.v1'
const SESSION_KEY = 'king-comics.session.v1'

export const PROFILES_CHANGED_EVENT = 'king-comics:profiles-changed'
export const SESSION_CHANGED_EVENT = 'king-comics:session-changed'

function notifyProfilesChanged() {
  window.dispatchEvent(new Event(PROFILES_CHANGED_EVENT))
}

function notifySessionChanged() {
  window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
}

function normalizeName(name) {
  return name.trim().normalize('NFKC').toLowerCase()
}

function readAccounts() {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY)) ?? {}
  } catch {
    return {}
  }
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

export function replaceAccountIdentity(username, name, nextUsername) {
  const accounts = readAccounts()
  const existing = accounts[username]

  if (!existing) throw new Error('This profile is not stored on this device.')

  const updated = {
    ...existing,
    name: name.trim().normalize('NFKC'),
    username: nextUsername,
  }

  if (nextUsername !== username) delete accounts[username]
  accounts[nextUsername] = updated
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
  notifyProfilesChanged()

  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY))
    if (session?.username === username) {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ username: nextUsername }))
      notifySessionChanged()
    }
  } catch {
    clearSession()
  }

  return updated
}

export async function createSession(username) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ username }))
  notifySessionChanged()
}

export function getCurrentUserSync() {
  if (typeof window === 'undefined') return null

  let session

  try {
    session = JSON.parse(localStorage.getItem(SESSION_KEY))
  } catch {
    session = null
  }

  return session?.username ? readAccounts()[session.username] ?? null : null
}

export async function getCurrentUser() {
  return getCurrentUserSync()
}

export function clearSession() {
  if (typeof window === 'undefined') return

  const hadSession = Boolean(localStorage.getItem(SESSION_KEY))
  localStorage.removeItem(SESSION_KEY)
  if (hadSession) notifySessionChanged()
}
