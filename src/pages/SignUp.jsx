import { useState } from 'preact/hooks'
import { useLocation } from 'preact-iso'
import { createAccount } from '../utils/auth.js'
import { sitePath } from '../utils/sitePath.js'

function SignUp() {
  const { route } = useLocation()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSaving(true)

    try {
      createAccount(name)
      route(sitePath('/profiles'), true)
    } catch (accountError) {
      setError(accountError.message)
      setSaving(false)
    }
  }

  return (
    <section class="page narrow">
      <p class="eyebrow">Create a local hero</p>
      <h1>Sign up</h1>
      <p>This profile stays on this browser.</p>
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

        <button type="submit" disabled={saving}>
          {saving ? 'Creating profile…' : 'Create profile'}
        </button>
      </form>
      {error && <p class="error" role="alert">{error}</p>}
      <p class="form-footer">Already have a profile? <a href={sitePath('/profiles')}>Choose it</a>.</p>
    </section>
  )
}

export default SignUp
