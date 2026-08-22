import { getCurrentUser, upsertAccount } from './auth.js'
import {
  getProfileProgress,
  PROGRESS_CHANGED_EVENT,
  replaceProfileProgress,
} from './progress.js'

const CREDENTIALS_KEY = 'king-comics.sync-credentials.v1'
const apiUrl = (import.meta.env.VITE_SYNC_API_URL ?? '').replace(/\/+$/, '')

export const SYNC_STATUS_EVENT = 'king-comics:sync-status'

let syncTimer = null
let activeSync = null
let queuedUsername = ''

export function isSyncConfigured() {
  return Boolean(apiUrl)
}

function readCredentials() {
  try {
    return JSON.parse(localStorage.getItem(CREDENTIALS_KEY)) ?? {}
  } catch {
    return {}
  }
}

function saveCredentials(username, name, pin) {
  const credentials = readCredentials()
  credentials[username] = { name, pin }
  localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials))
}

function removePin(username) {
  const credentials = readCredentials()
  delete credentials[username]
  localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials))
}

function emitStatus(status, message = '') {
  window.dispatchEvent(new CustomEvent(SYNC_STATUS_EVENT, {
    detail: { status, message },
  }))
}

async function request(path, body) {
  if (!apiUrl) throw new Error('Profile sync has not been configured yet.')

  const response = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  })

  let payload = {}
  try {
    payload = await response.json()
  } catch {
    // The friendly fallback below covers an empty or invalid response.
  }

  if (!response.ok) {
    throw new Error(payload.error || 'Could not sync this profile right now.')
  }

  return payload
}

function validatePin(pin) {
  if (!/^\d{4}$/.test(pin)) throw new Error('Enter a four-digit PIN.')
}

export async function registerSyncedAccount(name, pin) {
  validatePin(pin)
  emitStatus('syncing', 'Creating synced profile…')

  const username = name.trim().normalize('NFKC').toLowerCase()
  const payload = await request('/register', {
    name,
    pin,
    progress: getProfileProgress(username),
  })
  const account = upsertAccount(payload.name ?? name, {
    synced: true,
    username: `cloud:${payload.profileId}`,
  })
  saveCredentials(account.username, name, pin)
  replaceProfileProgress(account.username, payload.progress ?? {}, false)
  emitStatus('synced', 'Profile is synced.')
  return account
}

export async function connectSyncedAccount(name, pin) {
  validatePin(pin)
  emitStatus('syncing', 'Getting profile…')

  const username = name.trim().normalize('NFKC').toLowerCase()
  const localProgress = getProfileProgress(username)
  const payload = await request('/sync', {
    name,
    pin,
    progress: localProgress,
  })
  const account = upsertAccount(payload.name ?? name, {
    synced: true,
    username: `cloud:${payload.profileId}`,
  })
  saveCredentials(account.username, name, pin)
  replaceProfileProgress(account.username, payload.progress ?? {}, false)
  emitStatus('synced', 'Profile is up to date.')
  return account
}

export async function syncProfile(username) {
  if (!apiUrl || !navigator.onLine) return getProfileProgress(username)

  const credentials = readCredentials()[username]
  if (!credentials?.pin || !credentials?.name) return getProfileProgress(username)
  if (activeSync) return activeSync

  emitStatus('syncing', 'Syncing…')
  activeSync = request('/sync', {
    name: credentials.name,
    pin: credentials.pin,
    progress: getProfileProgress(username),
  }).then((payload) => {
    const progress = replaceProfileProgress(username, payload.progress ?? {}, false)
    emitStatus('synced', 'Synced just now.')
    return progress
  }).catch((error) => {
    emitStatus('error', error.message)
    throw error
  }).finally(() => {
    activeSync = null
  })

  return activeSync
}

export function forgetSyncCredentials(username) {
  removePin(username)
}

export function queueProfileSync(username) {
  if (!apiUrl) return
  queuedUsername = username
  clearTimeout(syncTimer)
  syncTimer = setTimeout(async () => {
    if (activeSync) {
      activeSync.finally(() => {
        if (queuedUsername) queueProfileSync(queuedUsername)
      })
      return
    }

    const nextUsername = queuedUsername
    queuedUsername = ''
    await syncProfile(nextUsername).catch(() => {})
    if (queuedUsername) queueProfileSync(queuedUsername)
  }, 800)
}

export function startProfileSync() {
  if (!apiUrl) return

  window.addEventListener(PROGRESS_CHANGED_EVENT, (event) => {
    if (event.detail?.username) queueProfileSync(event.detail.username)
  })

  async function syncCurrentProfile() {
    const user = await getCurrentUser()
    if (user) syncProfile(user.username).catch(() => {})
  }

  window.addEventListener('online', syncCurrentProfile)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncCurrentProfile()
  })

  setTimeout(syncCurrentProfile, 0)
}
