import { useState } from 'preact/hooks'
import { useLocation } from 'preact-iso'
import Modal from '../components/Modal.jsx'
import { createSession, deleteAccount, listAccounts } from '../utils/auth.js'
import { deleteProfileProgress } from '../utils/progress.js'
import { sitePath } from '../utils/sitePath.js'
import {
  connectSyncedAccount,
  forgetSyncCredentials,
  isSyncConfigured,
  syncProfile,
} from '../utils/sync.js'

function ProfilePicker() {
  const { route } = useLocation()
  const [profiles, setProfiles] = useState(() => listAccounts())
  const [selecting, setSelecting] = useState('')
  const [profileToDelete, setProfileToDelete] = useState(null)
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [connecting, setConnecting] = useState(false)

  async function chooseProfile(profile) {
    setSelecting(profile.username)
    await syncProfile(profile.username).catch(() => {})
    await createSession(profile.username)
    route(sitePath('/profile'), true)
  }

  async function connectProfile(event) {
    event.preventDefault()
    setError('')
    setConnecting(true)

    try {
      const profile = await connectSyncedAccount(name, pin)
      await createSession(profile.username)
      route(sitePath('/profile'), true)
    } catch (connectError) {
      setError(connectError.message)
      setConnecting(false)
    }
  }

  function confirmDelete() {
    if (!profileToDelete) return

    deleteAccount(profileToDelete.username)
    deleteProfileProgress(profileToDelete.username)
    forgetSyncCredentials(profileToDelete.username)
    setProfiles(listAccounts())
    setProfileToDelete(null)
  }

  return (
    <section class="page profiles-page">
      <p class="eyebrow">Choose your hero</p>
      <h1>Who is reading?</h1>

      {profiles.length > 0 ? (
        <div class="profile-grid">
          {profiles.map((profile) => (
            <article class="profile-card" key={profile.username}>
              <button
                class="profile-select"
                type="button"
                disabled={Boolean(selecting)}
                onClick={() => chooseProfile(profile)}
              >
                <span class="profile-avatar" aria-hidden="true">
                  {profile.name.charAt(0).toUpperCase()}
                </span>
                <span>{selecting === profile.username ? 'Opening…' : profile.name}</span>
              </button>
              <button
                class="delete-profile"
                type="button"
                aria-label={`Delete ${profile.name}`}
                title={`Delete ${profile.name}`}
                onClick={() => setProfileToDelete(profile)}
              >
                ×
              </button>
            </article>
          ))}
        </div>
      ) : (
        <p>No profiles live on this browser yet.</p>
      )}

      <a class="button" href={sitePath('/signup')}>Create a profile</a>

      {isSyncConfigured() && (
        <section class="profile-connect">
          <h2>Open a profile from another device</h2>
          <p>Enter the same profile name and four-digit PIN.</p>
          <form onSubmit={connectProfile}>
            <label for="connect-name">Name</label>
            <input
              id="connect-name"
              value={name}
              onInput={(event) => setName(event.currentTarget.value)}
              autoComplete="username"
              maxLength="40"
              required
            />
            <label for="connect-pin">PIN</label>
            <input
              id="connect-pin"
              type="password"
              value={pin}
              onInput={(event) => setPin(event.currentTarget.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              autoComplete="current-password"
              pattern="[0-9]{4}"
              maxLength="4"
              required
            />
            <button type="submit" disabled={connecting}>
              {connecting ? 'Opening…' : 'Open synced profile'}
            </button>
          </form>
          {error && <p class="error" role="alert">{error}</p>}
        </section>
      )}

      <Modal
        open={Boolean(profileToDelete)}
        title="Delete profile?"
        content={(
          <p>
            Are you sure you want to delete <strong>{profileToDelete?.name}</strong>?
            Their local reading progress will also be removed from this device.
          </p>
        )}
        onClose={() => setProfileToDelete(null)}
        actions={[
          {
            label: 'Cancel',
            onClick: () => setProfileToDelete(null),
          },
          {
            label: 'Delete profile',
            tone: 'danger',
            onClick: confirmDelete,
          },
        ]}
      />
    </section>
  )
}

export default ProfilePicker
