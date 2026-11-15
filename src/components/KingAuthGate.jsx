import { AuthProvider, ForgotPassword, SignIn, SignUp, useAuth } from '@jacobuid/king-auth'
import { useEffect, useState } from 'preact/hooks'
import { clearSession } from '../utils/auth.js'
import { setAuthOwner } from '../utils/kingAuth.js'
import { sitePath } from '../utils/sitePath.js'

function ReaderAccount({ children, userId }) {
  const { getToken } = useAuth()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setAuthOwner(userId, getToken)
    setReady(true)
    return () => {
      clearSession()
      setAuthOwner(null)
    }
  }, [userId])

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
      <main>
        <section class="page auth-page">
          <p class="eyebrow">Your hero pass</p>
          <h1>Welcome to King Comics</h1>
          {isLoading ? <p role="status">Checking your account…</p> : error ? (
            <>
              <p class="error" role="alert">Could not check your account. Please try again.</p>
              <button type="button" onClick={() => refresh().catch(() => {})}>Try again</button>
            </>
          ) : (
            <>
              <p>Sign in with King Auth to open your reader profiles.</p>
              {view === 'signin' && <SignIn />}
              {view === 'signup' && <><p>New accounts require email verification and owner approval.</p><SignUp /></>}
              {view === 'reset' && <ForgotPassword />}
              <nav class="auth-links" aria-label="Account access">
                {view !== 'signin' && <button type="button" onClick={() => setView('signin')}>Sign in</button>}
                {view !== 'signup' && <button type="button" onClick={() => setView('signup')}>Create account</button>}
                {view !== 'reset' && <button type="button" onClick={() => setView('reset')}>Forgot password?</button>}
              </nav>
            </>
          )}
        </section>
      </main>
    </>
  )
}

export default function KingAuthGate({ children }) {
  return <AuthProvider><Gate>{children}</Gate></AuthProvider>
}
