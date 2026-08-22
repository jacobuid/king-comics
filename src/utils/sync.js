import {
  deleteAccount,
  getCurrentUser,
  getCurrentUserSync,
  replaceAccountIdentity,
  upsertAccount,
} from './auth.js'
import {
  deleteProfileProgress,
  getProfileProgress,
  moveProfileProgress,
  PROGRESS_CHANGED_EVENT,
  replaceProfileProgress,
} from './progress.js'

const CREDENTIALS_KEY = 'king-comics.sync-credentials.v1'
const apiUrl = (import.meta.env.VITE_SYNC_API_URL ?? '').replace(/\/+$/, '')

export const SYNC_STATUS_EVENT = 'king-comics:sync-status'

let syncTimer = null
let activeSync = null
let queuedUsername = ''
let lastExitSave = 0

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

async function request(method, credentials, progress, options = {}) {
  if (!apiUrl) throw new Error('Profile sync has not been configured yet.')

  const headers = method === 'DELETE'
    ? { 'X-Profile-Id': options.profileId, 'X-Profile-Pin': options.pin }
    : method === 'POST'
    ? { 'Content-Type': 'application/json' }
    : {
        ...(['PUT', 'PATCH'].includes(method) ? { 'Content-Type': 'application/json' } : {}),
        'X-Profile-Name': credentials.name,
        'X-Profile-Pin': credentials.pin,
      }
  const body = method === 'POST'
    ? JSON.stringify({ ...credentials, avatar: options.avatar ?? '', progress: progress ?? {} })
    : method === 'PUT'
      ? JSON.stringify({
          progress: progress ?? {},
          ...(Object.prototype.hasOwnProperty.call(options, 'avatar')
            ? { avatar: options.avatar }
            : {}),
        })
      : method === 'PATCH'
        ? JSON.stringify({ name: options.newName, progress: progress ?? {} })
      : undefined

  const response = await fetch(`${apiUrl}/profiles`, {
    method,
    headers,
    body,
    cache: 'no-store',
    keepalive: options.keepalive,
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
  const payload = await request('POST', { name, pin }, getProfileProgress(username))
  const account = upsertAccount(payload.name ?? name, {
    synced: true,
    username: `cloud:${payload.profileId}`,
    avatar: payload.avatar ?? '',
  })
  saveCredentials(account.username, name, pin)
  replaceProfileProgress(account.username, payload.progress ?? {}, false)
  if (username !== account.username) {
    deleteAccount(username)
    deleteProfileProgress(username)
  }
  emitStatus('synced', 'Profile is synced.')
  return account
}

export async function connectSyncedAccount(name, pin) {
  validatePin(pin)
  emitStatus('syncing', 'Getting profile…')

  const username = name.trim().normalize('NFKC').toLowerCase()
  const payload = await request('GET', { name, pin })
  const account = upsertAccount(payload.name ?? name, {
    synced: true,
    username: `cloud:${payload.profileId}`,
    avatar: payload.avatar ?? '',
  })
  saveCredentials(account.username, name, pin)
  replaceProfileProgress(account.username, payload.progress ?? {}, false)
  if (username !== account.username) {
    deleteAccount(username)
    deleteProfileProgress(username)
  }
  emitStatus('synced', 'Profile is up to date.')
  return account
}

export async function syncProfile(username) {
  if (!apiUrl || !navigator.onLine) return getProfileProgress(username)

  const credentials = readCredentials()[username]
  if (!credentials?.pin || !credentials?.name) return getProfileProgress(username)
  if (activeSync) return activeSync

  emitStatus('syncing', 'Syncing…')
  activeSync = request('PUT', credentials, getProfileProgress(username)).then((payload) => {
    upsertAccount(payload.name ?? credentials.name, {
      synced: true,
      username,
      avatar: payload.avatar ?? '',
    })
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

export function validateProfilePin(username, pin) {
  const savedPin = readCredentials()[username]?.pin
  return Boolean(savedPin) && savedPin === pin
}

export async function deleteSyncedProfile(username, pin) {
  validatePin(pin)
  if (!validateProfilePin(username, pin)) throw new Error('That PIN is not correct.')

  const profileId = username.startsWith('cloud:') ? username.slice('cloud:'.length) : ''
  await request('DELETE', null, null, { profileId, pin })
}

export async function renameSyncedProfile(username, name, pin) {
  validatePin(pin)
  const credentials = readCredentials()[username]
  if (!credentials?.name || !credentials?.pin) {
    throw new Error('This profile is not connected to device sync.')
  }
  if (credentials.pin !== pin) throw new Error('That PIN is not correct.')

  const displayName = name.trim().normalize('NFKC')
  if (!displayName || displayName.length > 40) {
    throw new Error('Enter a profile name with 40 characters or fewer.')
  }

  emitStatus('syncing', 'Updating profile nameâ€¦')
  const payload = await request(
    'PATCH',
    { name: credentials.name, pin },
    getProfileProgress(username),
    { newName: displayName },
  )
  const nextUsername = `cloud:${payload.profileId}`
  const progress = moveProfileProgress(username, nextUsername)

  saveCredentials(nextUsername, payload.name ?? displayName, pin)
  if (nextUsername !== username) removePin(username)
  const account = replaceAccountIdentity(username, payload.name ?? displayName, nextUsername)
  emitStatus('synced', 'Profile name updated.')
  return { account, progress }
}

export async function updateProfileAvatar(username, avatar) {
  const credentials = readCredentials()[username]
  if (!credentials?.name || !credentials?.pin) {
    throw new Error('This profile is not connected to device sync.')
  }

  emitStatus('syncing', 'Updating profile pictureâ€¦')
  const payload = await request(
    'PUT',
    credentials,
    getProfileProgress(username),
    { avatar },
  )
  const account = upsertAccount(payload.name ?? credentials.name, {
    synced: true,
    username,
    avatar: payload.avatar ?? avatar,
  })
  emitStatus('synced', 'Profile picture updated.')
  return account
}

function saveProfileOnExit(username) {
  if (!apiUrl || !navigator.onLine) return
  const credentials = readCredentials()[username]
  if (!credentials?.pin || !credentials?.name) return
  request('PUT', credentials, getProfileProgress(username), { keepalive: true }).catch(() => {})
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

  function saveCurrentProfileOnExit() {
    const now = Date.now()
    if (now - lastExitSave < 500) return
    lastExitSave = now
    const user = getCurrentUserSync()
    if (user) saveProfileOnExit(user.username)
  }

  window.addEventListener('online', syncCurrentProfile)
  window.addEventListener('pagehide', saveCurrentProfileOnExit)
  window.addEventListener('beforeunload', saveCurrentProfileOnExit)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveCurrentProfileOnExit()
    else syncCurrentProfile()
  })

  setTimeout(syncCurrentProfile, 0)
}
