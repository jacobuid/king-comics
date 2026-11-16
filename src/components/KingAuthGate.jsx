import { AuthProvider, ForgotPassword, SignIn, SignUp, useAuth } from '@jacobuid/king-auth'
import { useEffect, useState } from 'preact/hooks'
import { clearSession } from '../utils/auth.js'
import { setAuthOwner } from '../utils/kingAuth.js'
import { sitePath } from '../utils/sitePath.js'
import { clearMediaAccess, refreshMediaAccess } from '../utils/mediaAccess.js'

function ReaderAccount({ children, userId }) {
  const { getToken } = useAuth()
  const [ready, setReady] = useState(false)
  const [mediaError, setMediaError] = useState('')

  useEffect(() => {
    setAuthOwner(userId, getToken)
    let active = true
    async function openLibrary() {
      try {
        await refreshMediaAccess(getToken)
        if (active) { setMediaError(''); setReady(true) }
      } catch (error) { if (active) { setReady(false); setMediaError(error.message) } }
    }
    openLibrary()
    const timer = setInterval(openLibrary, 3600_000)
    window.addEventListener('online', openLibrary)
    return () => {
      active = false
      clearInterval(timer)
      window.removeEventListener('online', openLibrary)
      clearSession()
      setAuthOwner(null)
      clearMediaAccess()
    }
  }, [userId])

  if (mediaError) return <main><p class="error" role="alert">{mediaError}</p><button type="button" onClick={() => window.location.reload()}>Try again</button></main>
  return ready ? children : <p class="status" role="status">Opening your profiles…</p>
}

function Gate({ children }) {
  const { user, isSignedIn, isLoading, error, refresh } = useAuth()
  const [view, setView] = useState('signin')
  if (isSignedIn && !isLoading) {
    return <ReaderAccount key={user.id} userId={user.id}>{children}</ReaderAccount>
  }

  return (
    <>
      <header class="site-header">
        <a class="brand" href={sitePath('/')} aria-label="King Comics home">
          <img src={sitePath('/header-blue.jpg')} alt="King Comics" />
        </a>
      </header>
      <main class="auth-main">
        <section class="page auth-page" aria-labelledby="auth-title">
          <nav class="auth-tabs" aria-label="Account access">
            <button type="button" aria-pressed={view === 'signin'} onClick={() => setView('signin')}>Sign in</button>
            <button type="button" aria-pressed={view === 'signup'} onClick={() => setView('signup')}>Create account</button>
          </nav>
          <div class="auth-intro">
            <h1 id="auth-title">{view === 'signup' ? 'Create your account.' : view === 'reset' ? 'Let’s get you back in.' : 'Welcome back.'}</h1>
            <p>{view === 'signup' ? 'One King Auth account. A hero profile for every reader.' : view === 'reset' ? 'Reset your King Auth password to return to your library.' : 'Sign in to your King Auth account.'}</p>
          </div>
          {isLoading ? <p role="status">Checking your account…</p> : error ? (
            <>
              <p class="error" role="alert">Could not check your account. Please try again.</p>
              <button type="button" onClick={() => refresh().catch(() => {})}>Try again</button>
            </>
          ) : (
            <>
              {view === 'signin' && <SignIn className="auth-card-form" />}
              {view === 'signup' && <><SignUp className="auth-card-form" /><p class="auth-approval-note">New accounts require email verification and owner approval.</p></>}
              {view === 'reset' && <ForgotPassword className="auth-card-form" />}
              <div class="auth-links">
                <button type="button" onClick={() => setView(view === 'signin' ? 'reset' : 'signin')}>
                  {view === 'signin' ? 'Forgot your password?' : 'Back to sign in'}
                </button>
              </div>
            </>
          )}
          <footer class="auth-footer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z" /><path d="m8.5 12 2.5 2.5 4.5-5" /></svg>
            <span>Secure sign-in by King Auth</span>
          </footer>
        </section>
      </main>
    </>
  )
}

export default function KingAuthGate({ children }) {
  return <AuthProvider><Gate>{children}</Gate></AuthProvider>
}
