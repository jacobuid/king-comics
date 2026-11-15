let ownerId = null
let tokenGetter = () => null

export function setAuthOwner(id, getToken = () => null) {
  ownerId = id
  tokenGetter = getToken
}

export function getAuthOwner() {
  return ownerId
}

export function accountStorageKey(key) {
  return `${key}:user:${ownerId ?? 'signed-out'}`
}

export function getAuthToken() {
  return tokenGetter()
}
