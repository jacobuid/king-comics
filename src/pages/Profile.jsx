import { faXmark } from '@fortawesome/free-solid-svg-icons'
import { useEffect, useMemo, useState } from 'preact/hooks'
import { useLocation } from 'preact-iso'
import FontAwesomeIcon from '../components/FontAwesomeIcon.jsx'
import Modal from '../components/Modal.jsx'
import { comics } from '../data/comics.js'
import { assetPath } from '../utils/assetPath.js'
import { clearSession } from '../utils/auth.js'
import { getProfileProgress, setComicBookmark } from '../utils/progress.js'
import { sitePath } from '../utils/sitePath.js'
import {
  isSyncConfigured,
  renameSyncedProfile,
  SYNC_STATUS_EVENT,
  syncProfile,
} from '../utils/sync.js'

const shelves = [
  { status: 'read', title: 'History' },
  { status: 'saved', title: 'Bookmarks' },
]

function normalizedStatus(status) {
  if (status === 'finished' || status === 'reading') return 'read'
  if (status === 'queue') return 'saved'
  return status
}

function isBookmarked(item) {
  return item?.bookmarked ?? normalizedStatus(item?.status) === 'saved'
}

function isInHistory(item) {
  return Boolean(item?.lastReadAt) || normalizedStatus(item?.status) === 'read'
}

function historyTimestamp(item) {
  return item?.lastReadAt ?? item?.updatedAt ?? ''
}

function Profile({ user }) {
  const { route } = useLocation()
  const [progress, setProgress] = useState(() => getProfileProgress(user.username))
  const [error, setError] = useState('')
  const [syncStatus, setSyncStatus] = useState({ status: 'idle', message: '' })
  const [editingName, setEditingName] = useState(false)
  const [profileName, setProfileName] = useState(user.name)
  const [profilePin, setProfilePin] = useState('')
  const [nameError, setNameError] = useState('')
  const [savingName, setSavingName] = useState(false)

  useEffect(() => {
    function updateSyncStatus(event) {
      setSyncStatus(event.detail)
    }

    window.addEventListener(SYNC_STATUS_EVENT, updateSyncStatus)
    return () => window.removeEventListener(SYNC_STATUS_EVENT, updateSyncStatus)
  }, [])

  const comicsByStatus = useMemo(() => {
    const grouped = Object.fromEntries(shelves.map((shelf) => [shelf.status, []]))

    for (const comic of comics) {
      const item = progress[comic.id]
      if (isInHistory(item)) grouped.read.push(comic)
      if (isBookmarked(item)) grouped.saved.push(comic)
    }

    grouped.read.sort((first, second) => (
      historyTimestamp(progress[second.id]).localeCompare(historyTimestamp(progress[first.id]))
    ))

    return grouped
  }, [progress])

  const lastRead = useMemo(() => {
    const historyEntries = Object.entries(progress)
      .filter(([, item]) => isInHistory(item))
      .sort(([, first], [, second]) => (
        historyTimestamp(second).localeCompare(historyTimestamp(first))
      ))

    return comics.find((comic) => comic.id === historyEntries[0]?.[0]) ?? null
  }, [progress])

  const lastReadProgress = lastRead ? progress[lastRead.id] : null
  const readingPercent = lastReadProgress?.pageCount
    ? Math.round((lastReadProgress.page / lastReadProgress.pageCount) * 100)
    : null

  function switchProfile() {
    clearSession()
    route(sitePath('/profiles'), true)
  }

  function signOut() {
    clearSession()
    route(sitePath('/profiles'), true)
  }

  function removeBookmark(comicId) {
    const updatedProgress = setComicBookmark(user.username, comicId, false)
    setProgress({ ...updatedProgress })
  }

  async function syncNow() {
    setError('')
    try {
      const updatedProgress = await syncProfile(user.username)
      setProgress({ ...updatedProgress })
    } catch (syncError) {
      setError(syncError.message)
    }
  }

  function openNameEditor() {
    setProfileName(user.name)
    setProfilePin('')
    setNameError('')
    setEditingName(true)
  }

  function closeNameEditor() {
    if (savingName) return
    setEditingName(false)
    setNameError('')
  }

  async function saveProfileName(event) {
    event.preventDefault()
    setNameError('')
    setSavingName(true)

    try {
      const result = await renameSyncedProfile(user.username, profileName, profilePin)
      setProgress({ ...result.progress })
      setEditingName(false)
      setProfilePin('')
    } catch (renameError) {
      setNameError(renameError.message)
    } finally {
      setSavingName(false)
    }
  }

  return (
    <section class="page profile-page">
      <section class="reading-hero">
        <div class="reading-hero-copy">
          <p class="eyebrow">Recently Read</p>
          <h2>{lastRead?.title ?? 'Your history starts here'}</h2>
          <p class="hero-meta">
            {lastRead ? (
              <>
                <span>{lastRead.issue}</span>
                {lastReadProgress?.pageCount && (
                  <span>Page {lastReadProgress.page} of {lastReadProgress.pageCount}</span>
                )}
              </>
            ) : 'The latest comic added to History will appear here.'}
          </p>
          {readingPercent !== null && (
            <div class="hero-progress" aria-label={`${readingPercent}% complete`}>
              <span style={{ width: `${readingPercent}%` }} />
            </div>
          )}
          <a class="dashboard-cta" href={sitePath(lastRead ? `/comic/${lastRead.id}` : '/')}>
            {lastRead ? 'Continue reading' : 'Browse comics'} <span aria-hidden="true">→</span>
          </a>
        </div>
        <div
          class={lastRead?.cover ? 'reading-hero-art has-cover' : 'reading-hero-art'}
          style={lastRead?.cover ? { backgroundImage: `url(${assetPath(lastRead.cover)})` } : undefined}
          aria-hidden="true"
        >
          {!lastRead?.cover && <span>{lastRead?.issue ?? 'POW!'}</span>}
        </div>
      </section>

      <div class="dashboard-shelves">
        {shelves.map((shelf) => (
          <section class="dashboard-shelf" key={shelf.status}>
            <h2>{shelf.title}</h2>
            {comicsByStatus[shelf.status].length > 0 ? (
              <div class="cover-row-frame">
                <div class="cover-row">
                  {comicsByStatus[shelf.status].map((comic) => (
                    <article class="dashboard-comic" key={comic.id}>
                      <a class="dashboard-comic-link" href={sitePath(`/comic/${comic.id}`)}>
                        {comic.cover ? (
                          <img
                            class="dashboard-cover dashboard-cover-image"
                            src={assetPath(comic.cover)}
                            alt=""
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <span class="dashboard-cover" aria-hidden="true">{comic.issue || 'READ'}</span>
                        )}
                        <strong>{comic.issue ? `Issue ${comic.issue}` : comic.title}</strong>
                      </a>
                      {shelf.status === 'saved' && (
                        <button
                          class="remove-bookmark"
                          type="button"
                          onClick={() => removeBookmark(comic.id)}
                          aria-label={`Remove ${comic.title} from Bookmarks`}
                          title="Remove from Bookmarks"
                        >
                          <FontAwesomeIcon icon={faXmark} />
                        </button>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <p class="empty-list">No comics here yet. Add some from the library.</p>
            )}
          </section>
        ))}
      </div>

      <div class="profile-settings">
        <h2>Profile settings</h2>
        {user.synced && (
          <div class="sync-setting">
            <div>
              <strong>Profile name</strong>
              <p class="sync-message">{user.name}</p>
            </div>
            <button type="button" onClick={openNameEditor}>Edit profile</button>
          </div>
        )}
        {isSyncConfigured() && (
          user.synced ? (
            <div class="sync-setting">
              <div>
                <strong>Device sync</strong>
                <p class={syncStatus.status === 'error' ? 'error' : 'sync-message'}>
                  {syncStatus.message || 'Bookmarks and history sync automatically.'}
                </p>
              </div>
              <button type="button" onClick={syncNow} disabled={syncStatus.status === 'syncing'}>
                Sync now
              </button>
            </div>
          ) : (
            <div class="sync-setting">
              <div>
                <strong>Device sync is off</strong>
                <p class="sync-message">Add a PIN to use this profile on another device.</p>
              </div>
              <a class="button" href={sitePath('/profiles')}>Set up sync</a>
            </div>
          )
        )}
        {error && <p class="error" role="alert">{error}</p>}
      </div>

      <div class="profile-actions">
        <button type="button" onClick={switchProfile}>Switch profile</button>
        <button class="sign-out-button" type="button" onClick={signOut}>Sign out</button>
      </div>

      <Modal
        open={editingName}
        title="Edit profile"
        content={(
          <form class="profile-modal-form" onSubmit={saveProfileName}>
            <label for="edit-profile-name">Profile name</label>
            <input
              id="edit-profile-name"
              value={profileName}
              onInput={(event) => setProfileName(event.currentTarget.value)}
              autoComplete="username"
              maxLength="40"
              disabled={savingName}
              required
              autofocus
            />
            <label for="edit-profile-pin">Enter your four-digit PIN to confirm</label>
            <input
              id="edit-profile-pin"
              type="password"
              value={profilePin}
              onInput={(event) => setProfilePin(event.currentTarget.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              autoComplete="current-password"
              pattern="[0-9]{4}"
              maxLength="4"
              disabled={savingName}
              required
            />
            {nameError && <p class="error" role="alert">{nameError}</p>}
            <button type="submit" disabled={savingName}>
              {savingName ? 'Savingâ€¦' : 'Save profile name'}
            </button>
          </form>
        )}
        onClose={closeNameEditor}
        actions={[{ label: 'Cancel', disabled: savingName, onClick: closeNameEditor }]}
      />
    </section>
  )
}

export default Profile
