import { hydrate, prerender as renderToString } from 'preact-iso'
import App from './App.jsx'
import { startProfileSync } from './utils/sync.js'
import { startProfileTheme } from './utils/theme.js'
import './index.css'

if (typeof window !== 'undefined') {
  hydrate(<App />, document.getElementById('root'))
  startProfileTheme()
  startProfileSync()

  if ('serviceWorker' in navigator) {
    if (import.meta.env.PROD) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
          scope: import.meta.env.BASE_URL,
          updateViaCache: 'none',
        }).then((registration) => registration.update()).catch((error) => {
          console.warn('Could not register the offline app worker.', error)
        })
      })
    } else {
      Promise.all([
        navigator.serviceWorker.getRegistrations()
          .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister()))),
        caches.keys()
          .then((keys) => Promise.all(
            keys
              .filter((key) => key.startsWith('king-comics-'))
              .map((key) => caches.delete(key)),
          )),
      ]).then(() => {
        if (navigator.serviceWorker.controller && !sessionStorage.getItem('king-comics-dev-worker-cleared')) {
          sessionStorage.setItem('king-comics-dev-worker-cleared', 'true')
          window.location.reload()
        } else {
          sessionStorage.removeItem('king-comics-dev-worker-cleared')
        }
      }).catch((error) => {
        console.warn('Could not clear the development app worker.', error)
      })
    }
  }
}

export async function prerender() {
  return renderToString(<App />)
}
