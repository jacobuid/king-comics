export function sitePath(path = '/') {
  const route = path.startsWith('/') ? path : `/${path}`

  if (typeof window === 'undefined') return route

  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  return `${base}${route}` || '/'
}
