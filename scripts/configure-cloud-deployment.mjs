import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { loadConfig } from './lib/b2.mjs'

loadConfig()
const gh = process.platform === 'win32' ? 'C:/Program Files/GitHub CLI/gh.exe' : 'gh'
const repo = 'jacobuid/king-comics'
for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'B2_READ_KEY_ID', 'B2_READ_APPLICATION_KEY', 'MEDIA_SIGNING_SECRET']) {
  if (!process.env[name]) throw new Error(`Missing ${name}`)
  execFileSync(gh, ['secret', 'set', name, '--repo', repo], { input: process.env[name], stdio: ['pipe', 'pipe', 'pipe'] })
  console.log(`Configured repository secret ${name}`)
}
const url = 'https://king-comics-api.jacobuid-king-videos.workers.dev'
for (const name of ['VITE_SYNC_API_URL', 'VITE_MEDIA_API_URL']) {
  execFileSync(gh, ['variable', 'set', name, '--repo', repo], { input: url, stdio: ['pipe', 'pipe', 'pipe'] })
}
try { execFileSync(gh, ['variable', 'delete', 'VITE_COMICS_BASE_URL', '--repo', repo], { stdio: ['ignore', 'pipe', 'pipe'] }) } catch {}
let local = existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : ''
for (const [name, value] of [['VITE_COMICS_BASE_URL', ''], ['VITE_SYNC_API_URL', url], ['VITE_MEDIA_API_URL', url]]) {
  const pattern = new RegExp(`^${name}=.*$`, 'm')
  local = pattern.test(local) ? local.replace(pattern, `${name}=${value}`) : `${local}\n${name}=${value}\n`
}
writeFileSync('.env.local', local)
console.log('Frontend deployment and local environment now target Cloudflare/B2. No storage credentials were exposed to the frontend.')
