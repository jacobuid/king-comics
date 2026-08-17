import { useState } from 'preact/hooks'
import { useLocation } from 'preact-iso'
import Modal from '../components/Modal.jsx'
import { createSession, deleteAccount, listAccounts } from '../utils/auth.js'
import { deleteProfileProgress } from '../utils/progress.js'
import { sitePath } from '../utils/sitePath.js'

function ProfilePicker() {
  const { route } = useLocation()
  const [profiles, setProfiles] = useState(() => listAccounts())
  const [selecting, setSelecting] = useState('')
  const [profileToDelete, setProfileToDelete] = useState(null)

  async function chooseProfile(profile) {
    setSelecting(profile.username)
    await createSession(profile.username)
    route(sitePath('/profile'), true)
  }

  function confirmDelete() {
    if (!profileToDelete) return

    deleteAccount(profileToDelete.username)
    deleteProfileProgress(profileToDelete.username)
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

      <Modal
        open={Boolean(profileToDelete)}
        title="Delete profile?"
        content={(
          <p>
            Are you sure you want to delete <strong>{profileToDelete?.name}</strong>?
            Their reading progress will also be removed.
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
