import { useMemo, useState } from 'preact/hooks'
import { useLocation } from 'preact-iso'
import { comics } from '../data/comics.js'
import { assetPath } from '../utils/assetPath.js'
import { clearSession, renameAccount } from '../utils/auth.js'
import { getProfileProgress, renameProfileProgress } from '../utils/progress.js'
import { sitePath } from '../utils/sitePath.js'

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

function Profile({ user }) {
  const { route } = useLocation()
  const [currentUser, setCurrentUser] = useState(user)
  const [name, setName] = useState(user.name)
  const [progress, setProgress] = useState(() => getProfileProgress(user.username))
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const comicsByStatus = useMemo(() => {
    const grouped = Object.fromEntries(shelves.map((shelf) => [shelf.status, []]))

    for (const comic of comics) {
      const item = progress[comic.id]
      if (isInHistory(item)) grouped.read.push(comic)
      if (isBookmarked(item)) grouped.saved.push(comic)
    }

    return grouped
  }, [progress])

  const lastRead = useMemo(() => {
    const historyEntries = Object.entries(progress)
      .filter(([, item]) => isInHistory(item))
      .sort(([, first], [, second]) => (
        second.lastReadAt ?? second.updatedAt ?? ''
      ).localeCompare(first.lastReadAt ?? first.updatedAt ?? ''))

    return comics.find((comic) => comic.id === historyEntries[0]?.[0]) ?? null
  }, [progress])

  const lastReadProgress = lastRead ? progress[lastRead.id] : null
  const readingPercent = lastReadProgress?.pageCount
    ? Math.round((lastReadProgress.page / lastReadProgress.pageCount) * 100)
    : null

  function handleRename(event) {
    event.preventDefault()
    setError('')
    setMessage('')

    try {
      const previousUsername = currentUser.username
      const updatedUser = renameAccount(previousUsername, name)
      const updatedProgress = renameProfileProgress(previousUsername, updatedUser.username)

      setCurrentUser(updatedUser)
      setName(updatedUser.name)
      setProgress(updatedProgress)
      setMessage('Profile name updated.')
    } catch (renameError) {
      setError(renameError.message)
    }
  }

  function switchProfile() {
    clearSession()
    route(sitePath('/profiles'), true)
  }

  function signOut() {
    clearSession()
    route(sitePath('/profiles'), true)
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
                    <a class="dashboard-comic" href={sitePath(`/comic/${comic.id}`)} key={comic.id}>
                      {comic.cover ? (
                        <img class="dashboard-cover dashboard-cover-image" src={assetPath(comic.cover)} alt="" />
                      ) : (
                        <span class="dashboard-cover" aria-hidden="true">{comic.issue || 'READ'}</span>
                      )}
                      <strong>{comic.issue ? `Issue ${comic.issue}` : comic.title}</strong>
                    </a>
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
        <form class="rename-form" onSubmit={handleRename}>
          <label for="profile-name">Profile name</label>
          <div class="inline-form">
            <input
              id="profile-name"
              value={name}
              onInput={(event) => setName(event.currentTarget.value)}
              maxLength="40"
              required
            />
            <button type="submit">Save name</button>
          </div>
        </form>
        {message && <p class="success" role="status">{message}</p>}
        {error && <p class="error" role="alert">{error}</p>}
      </div>

      <div class="profile-actions">
        <button type="button" onClick={switchProfile}>Switch profile</button>
        <button class="sign-out-button" type="button" onClick={signOut}>Sign out</button>
      </div>
    </section>
  )
}

export default Profile
