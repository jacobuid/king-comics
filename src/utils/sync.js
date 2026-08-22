import {
  deleteAccount,
  getCurrentUser,
  getCurrentUserSync,
  listAccounts,
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
    ? JSON.stringify({
        ...credentials,
        avatar: options.avatar ?? '',
        theme: options.theme ?? 'blue',
        progress: progress ?? {},
      })
    : method === 'PUT'
      ? JSON.stringify({
          progress: progress ?? {},
          ...(Object.prototype.hasOwnProperty.call(options, 'avatar')
            ? { avatar: options.avatar }
            : {}),
          ...(Object.prototype.hasOwnProperty.call(options, 'theme')
            ? { theme: options.theme }
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
    const error = new Error(payload.error || 'Could not sync this profile right now.')
    error.status = response.status
    error.code = payload.code || (response.status === 404 ? 'PROFILE_DELETED' : '')
    error.movedToName = payload.movedToName
    error.movedToProfileId = payload.movedToProfileId
    throw error
  }

  return payload
}

async function requestFollowingMoves(method, credentials, progress, options = {}) {
  let resolvedCredentials = { ...credentials }

  for (let depth = 0; depth < 8; depth += 1) {
    try {
      const payload = await request(method, resolvedCredentials, progress, options)
      return { payload, credentials: resolvedCredentials }
    } catch (error) {
      if (error.code !== 'PROFILE_MOVED' || !error.movedToName) throw error
      resolvedCredentials = { ...resolvedCredentials, name: error.movedToName }
    }
  }

  throw new Error('This profile has been renamed too many times to follow automatically.')
}

function applySyncedPayload(username, credentials, payload) {
  const nextUsername = `cloud:${payload.profileId}`

  if (nextUsername !== username) {
    moveProfileProgress(username, nextUsername)
    saveCredentials(nextUsername, payload.name ?? credentials.name, credentials.pin)
    removePin(username)
    replaceAccountIdentity(username, payload.name ?? credentials.name, nextUsername)
  }

  const account = upsertAccount(payload.name ?? credentials.name, {
    synced: true,
    username: nextUsername,
    avatar: payload.avatar ?? '',
    theme: payload.theme ?? 'blue',
    syncOptOut: false,
  })
  const progress = replaceProfileProgress(nextUsername, payload.progress ?? {}, false)
  return { account, progress, username: nextUsername }
}

function removeDeletedProfile(username) {
  deleteAccount(username)
  deleteProfileProgress(username)
  removePin(username)
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
    theme: payload.theme ?? 'blue',
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

export async function migrateLocalProfile(username, pin) {
  validatePin(pin)
  const localAccount = listAccounts().find((account) => account.username === username)
  if (!localAccount) throw new Error('This profile is not stored on this device.')
  if (localAccount.synced) return syncProfile(username)

  emitStatus('syncing', 'Moving this profile to device sync…')
  const progress = getProfileProgress(username)
  const credentials = { name: localAccount.name, pin }
  let payload
  let resolvedCredentials = credentials

  try {
    payload = await request('POST', credentials, progress, {
      avatar: localAccount.avatar ?? '',
      theme: localAccount.theme ?? 'blue',
    })
  } catch (error) {
    if (error.status !== 409) throw error

    const result = await requestFollowingMoves('PUT', credentials, progress)
    payload = result.payload
    resolvedCredentials = result.credentials
  }

  const result = applySyncedPayload(username, resolvedCredentials, payload)
  emitStatus('synced', 'Your profile now syncs across devices.')
  return result
}

export async function connectSyncedAccount(name, pin) {
  validatePin(pin)
  emitStatus('syncing', 'Getting profile…')

  const username = name.trim().normalize('NFKC').toLowerCase()
  const { payload, credentials } = await requestFollowingMoves('GET', { name, pin })
  const account = upsertAccount(payload.name ?? credentials.name, {
    synced: true,
    username: `cloud:${payload.profileId}`,
    avatar: payload.avatar ?? '',
    theme: payload.theme ?? 'blue',
  })
  saveCredentials(account.username, credentials.name, pin)
  replaceProfileProgress(account.username, payload.progress ?? {}, false)
  if (username !== account.username) {
    deleteAccount(username)
    deleteProfileProgress(username)
  }
  emitStatus('synced', 'Profile is up to date.')
  return account
}

export async function syncProfile(username) {
  if (!apiUrl || !navigator.onLine) {
    return { progress: getProfileProgress(username), username }
  }

  const credentials = readCredentials()[username]
  if (!credentials?.pin || !credentials?.name) {
    return { progress: getProfileProgress(username), username }
  }
  if (activeSync) {
    await activeSync.catch(() => {})
    return syncProfile(username)
  }

  emitStatus('syncing', 'Syncing…')
  activeSync = requestFollowingMoves(
    'PUT',
    credentials,
    getProfileProgress(username),
  ).then(({ payload, credentials: resolvedCredentials }) => {
    const result = applySyncedPayload(username, resolvedCredentials, payload)
    emitStatus('synced', 'Synced just now.')
    return result
  }).catch((error) => {
    if (error.code === 'PROFILE_DELETED') {
      removeDeletedProfile(username)
      error.message = 'This profile was deleted on another device.'
      emitStatus('deleted', error.message)
      throw error
    }
    emitStatus('error', error.message)
    throw error
  }).finally(() => {
    activeSync = null
  })

  return activeSync
}

export async function reconcileStoredProfiles() {
  if (!apiUrl || !navigator.onLine) return listAccounts()

  for (const profile of listAccounts()) {
    if (!profile.synced) continue
    await syncProfile(profile.username).catch(() => {})
  }

  return listAccounts()
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

  emitStatus('syncing', 'Updating profile name…')
  const { payload, credentials: resolvedCredentials } = await requestFollowingMoves(
    'PATCH',
    { name: credentials.name, pin },
    getProfileProgress(username),
    { newName: displayName },
  )
  const result = applySyncedPayload(username, resolvedCredentials, payload)
  emitStatus('synced', 'Profile name updated.')
  return { account: result.account, progress: result.progress }
}

export async function updateProfileAvatar(username, avatar) {
  const credentials = readCredentials()[username]
  if (!credentials?.name || !credentials?.pin) {
    throw new Error('This profile is not connected to device sync.')
  }

  emitStatus('syncing', 'Updating profile picture…')
  const { payload, credentials: resolvedCredentials } = await requestFollowingMoves(
    'PUT',
    credentials,
    getProfileProgress(username),
    { avatar },
  )
  const { account } = applySyncedPayload(username, resolvedCredentials, payload)
  emitStatus('synced', 'Profile picture updated.')
  return account
}

export async function updateProfileTheme(username, theme) {
  const credentials = readCredentials()[username]
  if (!credentials?.name || !credentials?.pin) {
    throw new Error('This profile is not connected to device sync.')
  }

  emitStatus('syncing', 'Updating theme…')
  const { payload, credentials: resolvedCredentials } = await requestFollowingMoves(
    'PUT',
    credentials,
    getProfileProgress(username),
    { theme },
  )
  const { account } = applySyncedPayload(username, resolvedCredentials, payload)
  emitStatus('synced', 'Theme updated.')
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
