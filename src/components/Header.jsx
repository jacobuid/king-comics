import { faBookOpen, faCircleUser } from '@fortawesome/free-solid-svg-icons'
import { useLocation } from 'preact-iso'
import { useEffect, useRef, useState } from 'preact/hooks'
import FontAwesomeIcon from './FontAwesomeIcon.jsx'
import { avatarPath } from '../data/avatars.js'
import { getComic, getSeries } from '../data/comics.js'
import {
  getCurrentUser,
  PROFILES_CHANGED_EVENT,
  SESSION_CHANGED_EVENT,
} from '../utils/auth.js'
import { sitePath } from '../utils/sitePath.js'

function Header() {
  const { path } = useLocation()
  const [activeProfile, setActiveProfile] = useState(null)
  const [menuMode, setMenuMode] = useState('static')
  const menuSlotRef = useRef(null)
  const appBase = sitePath('/').replace(/\/$/, '')
  const appPath = appBase && path.startsWith(`${appBase}/`) ? path.slice(appBase.length) : path
  const pathParts = appPath.split('/').filter(Boolean)
  const currentSeries = pathParts.length === 1 ? getSeries(decodeURIComponent(pathParts[0])) : null
  const currentComic = pathParts.length === 2 && pathParts[0] === 'comic'
    ? getComic(decodeURIComponent(pathParts[1]))
    : null
  const backLink = currentComic
    ? {
        href: sitePath(`/${currentComic.seriesId}#comic-${currentComic.id}`),
        label: '← Series',
        ariaLabel: `Back to ${currentComic.series}`,
      }
    : currentSeries
      ? {
          href: `${sitePath('/')}#series-${currentSeries.id}`,
          label: '← All Series',
          ariaLabel: 'Back to all series',
        }
      : null

  useEffect(() => {
    async function refreshNavigation() {
      setActiveProfile(await getCurrentUser())
    }

    refreshNavigation()
    window.addEventListener(SESSION_CHANGED_EVENT, refreshNavigation)
    window.addEventListener(PROFILES_CHANGED_EVENT, refreshNavigation)

    return () => {
      window.removeEventListener(SESSION_CHANGED_EVENT, refreshNavigation)
      window.removeEventListener(PROFILES_CHANGED_EVENT, refreshNavigation)
    }
  }, [])

  useEffect(() => {
    let lastScrollY = Math.max(window.scrollY, 0)
    let animationFrame = null
    let preserveMenuStateUntil = 0

    function preserveMenuState() {
      preserveMenuStateUntil = performance.now() + 400
    }

    function updateMenu() {
      animationFrame = null
      const scrollY = Math.max(window.scrollY, 0)
      const menuTop = menuSlotRef.current
        ? menuSlotRef.current.getBoundingClientRect().top + scrollY
        : Number.POSITIVE_INFINITY

      setMenuMode((currentMode) => {
        if (scrollY < menuTop) return 'static'
        if (performance.now() < preserveMenuStateUntil) {
          return currentMode === 'static' ? 'fixed-hidden' : currentMode
        }
        if (scrollY < lastScrollY - 3) return 'fixed-visible'
        if (scrollY > lastScrollY + 3) return 'fixed-hidden'
        return currentMode === 'static' ? 'fixed-visible' : currentMode
      })

      lastScrollY = scrollY
    }

    function queueUpdate() {
      if (animationFrame === null) animationFrame = window.requestAnimationFrame(updateMenu)
    }

    updateMenu()
    window.addEventListener('scroll', queueUpdate, { passive: true })
    window.addEventListener('resize', queueUpdate)
    window.addEventListener('king-comics:preserve-menu-state', preserveMenuState)

    return () => {
      window.removeEventListener('scroll', queueUpdate)
      window.removeEventListener('resize', queueUpdate)
      window.removeEventListener('king-comics:preserve-menu-state', preserveMenuState)
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame)
    }
  }, [])

  return (
    <header class={`site-header menu-${menuMode}`}>
      <a class="brand" href={sitePath('/')} aria-label="King Comics home">
        <img src={sitePath('/king-comics-logo.png')} alt="King Comics" />
      </a>
      <div class="header-menu-slot" ref={menuSlotRef}>
        <div class={`header-menu ${menuMode}`}>
          {backLink && (
            <a class="header-back-link" href={backLink.href} aria-label={backLink.ariaLabel}>
              {backLink.label}
            </a>
          )}
          {activeProfile ? (
            <nav aria-label="Main navigation">
              <a class="header-library-link" href={sitePath('/')} aria-label="Open Library">
                <FontAwesomeIcon icon={faBookOpen} />
                <span>Library</span>
              </a>
              <a
                class="header-profile-link"
                href={sitePath('/profile')}
                aria-label={`Open ${activeProfile.name}'s profile`}
              >
                {activeProfile.avatar ? (
                  <img
                    class="header-profile-avatar"
                    src={avatarPath(activeProfile.avatar)}
                    alt=""
                  />
                ) : (
                  <FontAwesomeIcon icon={faCircleUser} />
                )}
                <span>{activeProfile.name}</span>
              </a>
            </nav>
          ) : null}
        </div>
      </div>
    </header>
  )
}

export default Header
