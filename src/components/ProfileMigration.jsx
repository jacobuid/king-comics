import {
  faLaptop,
  faMobileScreenButton,
  faUser,
} from '@fortawesome/free-solid-svg-icons'
import { useEffect, useState } from 'preact/hooks'
import FontAwesomeIcon from './FontAwesomeIcon.jsx'
import Modal from './Modal.jsx'
import {
  getCurrentUserSync,
  PROFILES_CHANGED_EVENT,
  setAccountSyncOptOut,
  SESSION_CHANGED_EVENT,
} from '../utils/auth.js'
import { isSyncConfigured, migrateLocalProfile } from '../utils/sync.js'

export const OPEN_PROFILE_MIGRATION_EVENT = 'king-comics:open-profile-migration'

export function openProfileMigration(force = false) {
  window.dispatchEvent(new CustomEvent(OPEN_PROFILE_MIGRATION_EVENT, {
    detail: { force },
  }))
}

function ProfileMigration() {
  const [profile, setProfile] = useState(null)
  const [open, setOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const [migrating, setMigrating] = useState(false)

  useEffect(() => {
    function refreshProfile() {
      const currentProfile = getCurrentUserSync()
      setProfile(currentProfile)

      if (!currentProfile || currentProfile.synced || !isSyncConfigured()) {
        setOpen(false)
        return
      }

      if (!currentProfile.syncOptOut) {
        setOpen(true)
      }
    }

    function openForCurrentProfile(event) {
      const currentProfile = getCurrentUserSync()
      setProfile(currentProfile)
      if (event.detail?.force || (currentProfile && !currentProfile.synced && isSyncConfigured())) {
        setPin('')
        setConfirmPin('')
        setError('')
        setOpen(true)
      }
    }

    refreshProfile()
    window.addEventListener(PROFILES_CHANGED_EVENT, refreshProfile)
    window.addEventListener(SESSION_CHANGED_EVENT, refreshProfile)
    window.addEventListener(OPEN_PROFILE_MIGRATION_EVENT, openForCurrentProfile)

    return () => {
      window.removeEventListener(PROFILES_CHANGED_EVENT, refreshProfile)
      window.removeEventListener(SESSION_CHANGED_EVENT, refreshProfile)
      window.removeEventListener(OPEN_PROFILE_MIGRATION_EVENT, openForCurrentProfile)
    }
  }, [])

  function keepLocal() {
    if (migrating) return
    if (profile && !profile.synced) setAccountSyncOptOut(profile.username, true)
    setOpen(false)
    setError('')
  }

  async function migrate(event) {
    event.preventDefault()
    setError('')

    if (pin !== confirmPin) {
      setError('The PINs do not match.')
      return
    }
    if (!profile) {
      setError('Open a local profile before setting up sync.')
      return
    }

    setMigrating(true)
    try {
      await migrateLocalProfile(profile.username, pin)
      setOpen(false)
      setPin('')
      setConfirmPin('')
    } catch (migrationError) {
      setError(migrationError.message)
    } finally {
      setMigrating(false)
    }
  }

  return (
    <Modal
      open={open}
      title="Exciting news!"
      content={(
        <>
          <div class="sync-migration-illustration" aria-hidden="true">
            <div class="sync-device laptop-device">
              <FontAwesomeIcon icon={faLaptop} />
              <span><FontAwesomeIcon icon={faUser} /></span>
            </div>
            <div class="sync-transfer-path">
              <i />
              <i />
              <i />
              <span><FontAwesomeIcon icon={faUser} /></span>
            </div>
            <div class="sync-device phone-device">
              <FontAwesomeIcon icon={faMobileScreenButton} />
              <span><FontAwesomeIcon icon={faUser} /></span>
            </div>
          </div>
          <p>
            You can now sync your reading progress between multiple devices—all you need is a PIN.
          </p>
          <p class="sync-migration-note">
            Your history, bookmarks, profile picture, and theme will all come with you.
          </p>
          <form id="profile-migration-form" class="profile-modal-form" onSubmit={migrate}>
            <label for="migration-pin">Choose a four-digit PIN</label>
            <input
              id="migration-pin"
              type="password"
              value={pin}
              onInput={(event) => setPin(event.currentTarget.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              autoComplete="new-password"
              pattern="[0-9]{4}"
              maxLength="4"
              disabled={migrating}
              required
              autofocus
            />
            <label for="migration-pin-confirm">Confirm PIN</label>
            <input
              id="migration-pin-confirm"
              type="password"
              value={confirmPin}
              onInput={(event) => setConfirmPin(event.currentTarget.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              autoComplete="new-password"
              pattern="[0-9]{4}"
              maxLength="4"
              disabled={migrating}
              required
            />
            {error && <p class="error" role="alert">{error}</p>}
          </form>
        </>
      )}
      onClose={keepLocal}
      actions={[
        {
          label: 'Keep on this device',
          tone: 'secondary',
          disabled: migrating,
          onClick: keepLocal,
        },
        {
          label: migrating ? 'Syncing…' : 'Sync profile',
          type: 'submit',
          form: 'profile-migration-form',
          disabled: migrating,
        },
      ]}
    />
  )
}

export default ProfileMigration
