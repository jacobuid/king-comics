import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { comics } from './src/data/comics.generated.js'

const seriesRoutes = [...new Set(comics.map((comic) => `/${comic.seriesId}`))]

const isGitHubPages = process.env.GITHUB_ACTIONS === 'true'
const base = isGitHubPages ? '/king-comics/' : '/'

export default defineConfig({
  base,
  plugins: [
    preact({
      prerender: {
        enabled: true,
        additionalPrerenderRoutes: [
          '/',
          '/signup',
          '/profiles',
          '/profile',
          ...seriesRoutes,
          ...comics.map((comic) => `/comic/${comic.id}`),
        ],
      },
    }),
  ],
})
