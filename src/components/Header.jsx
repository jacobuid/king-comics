import { useLocation } from 'preact-iso'
import { useEffect, useRef, useState } from 'preact/hooks'
import { getComic, getSeries } from '../data/comics.js'
import {
  getCurrentUser,
  listAccounts,
  PROFILES_CHANGED_EVENT,
  SESSION_CHANGED_EVENT,
} from '../utils/auth.js'
import { sitePath } from '../utils/sitePath.js'

function Header() {
  const { path } = useLocation()
  const [hasProfiles, setHasProfiles] = useState(false)
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
      ? { href: sitePath('/'), label: '← All Series', ariaLabel: 'Back to all series' }
      : null

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

  useEffect(() => {
    let lastScrollY = Math.max(window.scrollY, 0)
    let animationFrame = null

    function updateMenu() {
      animationFrame = null
      const scrollY = Math.max(window.scrollY, 0)
      const menuTop = menuSlotRef.current
        ? menuSlotRef.current.getBoundingClientRect().top + scrollY
        : Number.POSITIVE_INFINITY

      setMenuMode((currentMode) => {
        if (scrollY < menuTop) return 'static'
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

    return () => {
      window.removeEventListener('scroll', queueUpdate)
      window.removeEventListener('resize', queueUpdate)
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
              <a href={sitePath('/profile')}>{activeProfile.name}</a>
            </nav>
          ) : !hasProfiles ? (
            <nav aria-label="Main navigation">
              <a href={sitePath('/signup')}>Sign up</a>
            </nav>
          ) : null}
        </div>
      </div>
    </header>
  )
}

export default Header
