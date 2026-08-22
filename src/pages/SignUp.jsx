import { useState } from 'preact/hooks'
import { useLocation } from 'preact-iso'
import { sitePath } from '../utils/sitePath.js'
import { registerSyncedAccount } from '../utils/sync.js'

function SignUp() {
  const { route } = useLocation()
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSaving(true)

    try {
      if (pin !== confirmPin) throw new Error('The PINs do not match.')
      await registerSyncedAccount(name, pin)
      route(sitePath('/profiles'), true)
    } catch (accountError) {
      setError(accountError.message)
      setSaving(false)
    }
  }

  return (
    <section class="page narrow">
      <p class="eyebrow">Create your hero</p>
      <h1>Create profile</h1>
      <p>Use the same name and PIN to bring bookmarks and history to another device.</p>
      <form onSubmit={handleSubmit}>
        <label for="signup-name">Name</label>
        <input
          id="signup-name"
          name="name"
          value={name}
          onInput={(event) => setName(event.currentTarget.value)}
          autoComplete="username"
          maxLength="40"
          required
        />

        <label for="signup-pin">Four-digit PIN</label>
        <input
          id="signup-pin"
          name="pin"
          type="password"
          value={pin}
          onInput={(event) => setPin(event.currentTarget.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          autoComplete="new-password"
          pattern="[0-9]{4}"
          maxLength="4"
          required
        />

        <label for="signup-pin-confirm">Confirm PIN</label>
        <input
          id="signup-pin-confirm"
          name="pin-confirm"
          type="password"
          value={confirmPin}
          onInput={(event) => setConfirmPin(event.currentTarget.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          autoComplete="new-password"
          pattern="[0-9]{4}"
          maxLength="4"
          required
        />

        <button type="submit" disabled={saving}>
          {saving ? 'Creating profile…' : 'Create profile'}
        </button>
      </form>
      {error && <p class="error" role="alert">{error}</p>}
      <p class="form-footer">Already have a profile? <a href={sitePath('/profiles')}>Open it</a>.</p>
    </section>
  )
}

export default SignUp
