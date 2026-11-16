import { setMediaBaseUrl } from './assetPath.js'

const apiUrl = (import.meta.env.VITE_MEDIA_API_URL ?? '').replace(/\/+$/, '')
export async function refreshMediaAccess(getToken) {
  if (!apiUrl) return
  const token = getToken()
  if (!token) throw new Error('Sign in to open your library.')
  const response = await fetch(`${apiUrl}/media-session`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, credentials: 'omit', cache: 'no-store',
  })
  if (!response.ok) throw new Error('Could not open the library. Please try again.')
  const ticket = await response.json()
  if (typeof ticket.token !== 'string') throw new Error('Invalid media access response.')
  setMediaBaseUrl(`${apiUrl}/media/${ticket.token}`)
}
export function clearMediaAccess() { setMediaBaseUrl('') }
