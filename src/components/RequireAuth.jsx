import { useEffect, useState } from 'preact/hooks'
import { useLocation } from 'preact-iso'
import { getCurrentUser, SESSION_CHANGED_EVENT } from '../utils/auth.js'
import { sitePath } from '../utils/sitePath.js'

function RequireAuth({ page: Page, ...props }) {
  const { route } = useLocation()
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let active = true

    function refreshUser() {
      getCurrentUser().then((currentUser) => {
        if (!active) return

        if (!currentUser) {
          route(sitePath('/profiles'), true)
          return
        }

        setUser(currentUser)
        setChecking(false)
      })
    }

    refreshUser()
    window.addEventListener(SESSION_CHANGED_EVENT, refreshUser)

    return () => {
      active = false
      window.removeEventListener(SESSION_CHANGED_EVENT, refreshUser)
    }
  }, [route])

  if (checking) {
    return <p class="status" role="status">Checking your hero pass…</p>
  }

  return <Page {...props} user={user} />
}

export default RequireAuth
