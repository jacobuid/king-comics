import { hydrate, prerender as renderToString } from 'preact-iso'
import App from './App.jsx'
import './index.css'

if (typeof window !== 'undefined') {
  hydrate(<App />, document.getElementById('root'))

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
      }).catch((error) => {
        console.warn('Could not register the offline app worker.', error)
      })
    })
  }
}

export async function prerender() {
  return renderToString(<App />)
}
