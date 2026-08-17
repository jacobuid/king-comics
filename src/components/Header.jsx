import { useEffect, useState } from 'preact/hooks'
import {
  getCurrentUser,
  listAccounts,
  PROFILES_CHANGED_EVENT,
  SESSION_CHANGED_EVENT,
} from '../utils/auth.js'
import { sitePath } from '../utils/sitePath.js'

function Header() {
  const [hasProfiles, setHasProfiles] = useState(false)
  const [activeProfile, setActiveProfile] = useState(null)

  useEffect(() => {
    async function refreshNavigation() {
      setHasProfiles(listAccounts().length > 0)
      setActiveProfile(await getCurrentUser())
    }

    refreshNavigation()
    window.addEventListener(PROFILES_CHANGED_EVENT, refreshNavigation)
    window.addEventListener(SESSION_CHANGED_EVENT, refreshNavigation)

    return () => {
      window.removeEventListener(PROFILES_CHANGED_EVENT, refreshNavigation)
      window.removeEventListener(SESSION_CHANGED_EVENT, refreshNavigation)
    }
  }, [])

  return (
    <header>
      <a class="brand" href={sitePath('/')}>King Comics</a>
      {activeProfile ? (
        <nav aria-label="Main navigation">
          <a href={sitePath('/profile')}>{activeProfile.name}</a>
        </nav>
      ) : !hasProfiles ? (
        <nav aria-label="Main navigation">
          <a href={sitePath('/signup')}>Sign up</a>
        </nav>
      ) : null}
    </header>
  )
}

export default Header
