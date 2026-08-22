const PROGRESS_KEY = 'king-comics.progress.v1'

export const PROGRESS_CHANGED_EVENT = 'king-comics:progress-changed'

function notifyProgressChanged(username) {
  window.dispatchEvent(new CustomEvent(PROGRESS_CHANGED_EVENT, { detail: { username } }))
}

function readAllProgress() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY)) ?? {}
  } catch {
    return {}
  }
}

export function getProfileProgress(username) {
  return readAllProgress()[username] ?? {}
}

export function setComicProgress(username, comicId, status, details = {}) {
  const allProgress = readAllProgress()
  const profileProgress = allProgress[username] ?? {}
  const previousProgress = profileProgress[comicId] ?? {}
  const wasBookmarked = previousProgress.bookmarked
    ?? (previousProgress.status === 'saved' || previousProgress.status === 'queue')
  const updatedAt = new Date().toISOString()

  profileProgress[comicId] = {
    ...previousProgress,
    ...details,
    status,
    bookmarked: wasBookmarked,
    updatedAt,
    ...(status === 'read' ? { lastReadAt: updatedAt } : {}),
  }

  allProgress[username] = profileProgress
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(allProgress))
  notifyProgressChanged(username)

  return profileProgress
}

export function setComicBookmark(username, comicId, bookmarked) {
  const allProgress = readAllProgress()
  const profileProgress = allProgress[username] ?? {}
  const previousProgress = profileProgress[comicId] ?? {}

  profileProgress[comicId] = {
    ...previousProgress,
    bookmarked,
    updatedAt: new Date().toISOString(),
  }

  allProgress[username] = profileProgress
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(allProgress))
  notifyProgressChanged(username)

  return profileProgress
}

export function deleteProfileProgress(username) {
  const allProgress = readAllProgress()

  if (!(username in allProgress)) return

  delete allProgress[username]
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(allProgress))
  notifyProgressChanged(username)
}

export function replaceProfileProgress(username, profileProgress, notify = true) {
  const allProgress = readAllProgress()
  allProgress[username] = profileProgress ?? {}
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(allProgress))
  if (notify) notifyProgressChanged(username)
  return allProgress[username]
}
