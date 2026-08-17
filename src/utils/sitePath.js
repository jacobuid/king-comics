export function sitePath(path = '/') {
  const route = path.startsWith('/') ? path : `/${path}`
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  return `${base}${route}` || '/'
}

export function routerPath(path = '/') {
  const route = path.startsWith('/') ? path : `/${path}`

  // Vite prerenders routes without its deployment base, while the hydrated
  // browser router sees the full GitHub Pages pathname.
  return typeof window === 'undefined' ? route : sitePath(route)
}
