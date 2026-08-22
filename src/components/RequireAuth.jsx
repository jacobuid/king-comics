import { useEffect, useState } from 'preact/hooks'
import { useLocation } from 'preact-iso'
import { getCurrentUser } from '../utils/auth.js'
import { sitePath } from '../utils/sitePath.js'

function RequireAuth({ page: Page, ...props }) {
  const { route } = useLocation()
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let active = true

    getCurrentUser().then((currentUser) => {
      if (!active) return

      if (!currentUser) {
        route(sitePath('/profiles'), true)
        return
      }

      setUser(currentUser)
      setChecking(false)
    })

    return () => {
      active = false
    }
  }, [route])

  if (checking) {
    return <p class="status" role="status">Checking your hero pass…</p>
  }

  return <Page {...props} user={user} />
}

export default RequireAuth
