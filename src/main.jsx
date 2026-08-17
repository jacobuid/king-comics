import { hydrate, prerender as renderToString } from 'preact-iso'
import App from './App.jsx'
import './index.css'

if (typeof window !== 'undefined') {
  hydrate(<App />, document.getElementById('root'))
}

export async function prerender() {
  return renderToString(<App />)
}
