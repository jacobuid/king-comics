import { PROFILES_CHANGED_EVENT, SESSION_CHANGED_EVENT, getCurrentUserSync } from './auth.js'
import { validTheme } from '../data/themes.js'

export function applyTheme(theme) {
  document.documentElement.dataset.theme = validTheme(theme) ? theme : 'blue'
}

export function startProfileTheme() {
  function refreshTheme() {
    applyTheme(getCurrentUserSync()?.theme)
  }

  refreshTheme()
  window.addEventListener(PROFILES_CHANGED_EVENT, refreshTheme)
  window.addEventListener(SESSION_CHANGED_EVENT, refreshTheme)
}
