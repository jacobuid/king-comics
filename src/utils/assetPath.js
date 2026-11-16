import { sitePath } from './sitePath.js'

const storageBaseUrl = (import.meta.env.VITE_COMICS_BASE_URL ?? '').replace(/\/+$/, '')
let mediaBaseUrl = ''
export function setMediaBaseUrl(url) { mediaBaseUrl = url }

export function assetPath(path = '/') {
  if (/^https?:\/\//i.test(path)) return path
  const baseUrl = mediaBaseUrl || storageBaseUrl
  if (!baseUrl) return sitePath(path)

  const assetRoute = path.startsWith('/') ? path : `/${path}`
  return `${baseUrl}${assetRoute}`
}
