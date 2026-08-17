import { sitePath } from './sitePath.js'

const storageBaseUrl = (import.meta.env.VITE_COMICS_BASE_URL ?? '').replace(/\/+$/, '')

export function assetPath(path = '/') {
  if (/^https?:\/\//i.test(path)) return path
  if (!storageBaseUrl) return sitePath(path)

  const assetRoute = path.startsWith('/') ? path : `/${path}`
  return `${storageBaseUrl}${assetRoute}`
}
