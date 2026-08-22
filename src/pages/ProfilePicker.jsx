import { useState } from 'preact/hooks'
import { useLocation } from 'preact-iso'
import Modal from '../components/Modal.jsx'
import { avatarPath } from '../data/avatars.js'
import { createSession, deleteAccount, listAccounts } from '../utils/auth.js'
import { deleteProfileProgress } from '../utils/progress.js'
import { sitePath } from '../utils/sitePath.js'
import {
  connectSyncedAccount,
  deleteSyncedProfile,
  forgetSyncCredentials,
  registerSyncedAccount,
  syncProfile,
} from '../utils/sync.js'

function pinInputValue(event) {
  return event.currentTarget.value.replace(/\D/g, '').slice(0, 4)
}

function ProfilePicker() {
  const { route } = useLocation()
  const [profiles, setProfiles] = useState(() => listAccounts())
  const [selecting, setSelecting] = useState('')
  const [profileToDelete, setProfileToDelete] = useState(null)

  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createPin, setCreatePin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)

  const [showImport, setShowImport] = useState(false)
  const [importName, setImportName] = useState('')
  const [importPin, setImportPin] = useState('')
  const [importError, setImportError] = useState('')
  const [importing, setImporting] = useState(false)

  const [deletePin, setDeletePin] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)

  async function openProfile(profile) {
    await createSession(profile.username)
    route(sitePath('/profile'), true)
  }

  async function chooseProfile(profile) {
    setSelecting(profile.username)
    await syncProfile(profile.username).catch(() => {})
    await openProfile(profile)
  }

  function closeCreate() {
    if (creating) return
    setShowCreate(false)
    setCreateError('')
  }

  async function createProfile(event) {
    event.preventDefault()
    setCreateError('')
    setCreating(true)

    try {
      if (createPin !== confirmPin) throw new Error('The PINs do not match.')
      await registerSyncedAccount(createName, createPin)
      setProfiles(listAccounts())
      setShowCreate(false)
      setCreateName('')
      setCreatePin('')
      setConfirmPin('')
      setCreating(false)
    } catch (error) {
      setCreateError(error.message)
      setCreating(false)
    }
  }

  function closeImport() {
    if (importing) return
    setShowImport(false)
    setImportError('')
  }

  async function importProfile(event) {
    event.preventDefault()
    setImportError('')
    setImporting(true)

    try {
      await connectSyncedAccount(importName, importPin)
      setProfiles(listAccounts())
      setShowImport(false)
      setImportName('')
      setImportPin('')
      setImporting(false)
    } catch (error) {
      setImportError(error.message)
      setImporting(false)
    }
  }

  function openDelete(profile) {
    setProfileToDelete(profile)
    setDeletePin('')
    setDeleteError('')
  }

  function closeDelete() {
    if (deleting) return
    setProfileToDelete(null)
    setDeletePin('')
    setDeleteError('')
  }

  async function confirmDelete() {
    if (!profileToDelete) return

    setDeleteError('')
    setDeleting(true)

    try {
      if (profileToDelete.synced) {
        await deleteSyncedProfile(profileToDelete.username, deletePin)
      }
      deleteAccount(profileToDelete.username)
      deleteProfileProgress(profileToDelete.username)
      forgetSyncCredentials(profileToDelete.username)
      setProfiles(listAccounts())
      setProfileToDelete(null)
      setDeletePin('')
    } catch (error) {
      setDeleteError(error.message)
    } finally {
      setDeleting(false)
    }
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
                {profile.avatar ? (
                  <img class="profile-avatar" src={avatarPath(profile.avatar)} alt="" />
                ) : (
                  <span class="profile-avatar" aria-hidden="true">
                    {profile.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <span>{selecting === profile.username ? 'Opening…' : profile.name}</span>
              </button>
              <button
                class="delete-profile"
                type="button"
                aria-label={`Delete ${profile.name}`}
                title={`Delete ${profile.name}`}
                onClick={() => openDelete(profile)}
              >
                ×
              </button>
            </article>
          ))}
        </div>
      ) : (
        <p>No profiles live on this browser yet.</p>
      )}

      <div class="profile-gate-actions">
        <button type="button" onClick={() => setShowCreate(true)}>Create a profile</button>
        <button type="button" onClick={() => setShowImport(true)}>Import a profile</button>
      </div>

      <Modal
        open={showCreate}
        title="Create your hero"
        content={(
          <form class="profile-modal-form" onSubmit={createProfile}>
            <p>Create a profile that can be used on all your devices.</p>
            <label for="create-profile-name">Profile name</label>
            <input
              id="create-profile-name"
              value={createName}
              onInput={(event) => setCreateName(event.currentTarget.value)}
              autoComplete="username"
              maxLength="40"
              disabled={creating}
              required
              autofocus
            />
            <label for="create-profile-pin">Four-digit PIN</label>
            <input
              id="create-profile-pin"
              type="password"
              value={createPin}
              onInput={(event) => setCreatePin(pinInputValue(event))}
              inputMode="numeric"
              autoComplete="new-password"
              pattern="[0-9]{4}"
              maxLength="4"
              disabled={creating}
              required
            />
            <label for="confirm-profile-pin">Confirm PIN</label>
            <input
              id="confirm-profile-pin"
              type="password"
              value={confirmPin}
              onInput={(event) => setConfirmPin(pinInputValue(event))}
              inputMode="numeric"
              autoComplete="new-password"
              pattern="[0-9]{4}"
              maxLength="4"
              disabled={creating}
              required
            />
            {createError && <p class="error" role="alert">{createError}</p>}
            <button type="submit" disabled={creating}>
              {creating ? 'Creating…' : 'Create profile'}
            </button>
          </form>
        )}
        onClose={closeCreate}
        actions={[{ label: 'Cancel', disabled: creating, onClick: closeCreate }]}
      />

      <Modal
        open={showImport}
        title="Import a profile"
        content={(
          <form class="profile-modal-form" onSubmit={importProfile}>
            <p>Enter the profile name and PIN used on the other device.</p>
            <label for="import-profile-name">Profile name</label>
            <input
              id="import-profile-name"
              value={importName}
              onInput={(event) => setImportName(event.currentTarget.value)}
              autoComplete="username"
              maxLength="40"
              disabled={importing}
              required
              autofocus
            />
            <label for="import-profile-pin">Four-digit PIN</label>
            <input
              id="import-profile-pin"
              type="password"
              value={importPin}
              onInput={(event) => setImportPin(pinInputValue(event))}
              inputMode="numeric"
              autoComplete="current-password"
              pattern="[0-9]{4}"
              maxLength="4"
              disabled={importing}
              required
            />
            {importError && <p class="error" role="alert">{importError}</p>}
            <button type="submit" disabled={importing}>
              {importing ? 'Importing…' : 'Import profile'}
            </button>
          </form>
        )}
        onClose={closeImport}
        actions={[{ label: 'Cancel', disabled: importing, onClick: closeImport }]}
      />

      <Modal
        open={Boolean(profileToDelete)}
        title="Delete profile?"
        content={(
          <>
            <p>
              Are you sure you want to delete <strong>{profileToDelete?.name}</strong>?
              {profileToDelete?.synced
                ? ' Their synced profile and reading progress will be permanently deleted.'
                : ' Their local reading progress will also be removed from this device.'}
            </p>
            {profileToDelete?.synced && (
              <>
                <label for="delete-profile-pin">Enter the four-digit PIN to confirm</label>
                <input
                  id="delete-profile-pin"
                  type="password"
                  value={deletePin}
                  onInput={(event) => {
                    setDeletePin(pinInputValue(event))
                    setDeleteError('')
                  }}
                  inputMode="numeric"
                  autoComplete="current-password"
                  pattern="[0-9]{4}"
                  maxLength="4"
                  disabled={deleting}
                  autofocus
                />
              </>
            )}
            {deleteError && <p class="error" role="alert">{deleteError}</p>}
          </>
        )}
        onClose={closeDelete}
        actions={[
          { label: 'Cancel', disabled: deleting, onClick: closeDelete },
          {
            label: deleting ? 'Deleting…' : 'Delete profile',
            tone: 'danger',
            disabled: deleting || (profileToDelete?.synced && deletePin.length !== 4),
            onClick: confirmDelete,
          },
        ]}
      />
    </section>
  )
}

export default ProfilePicker
