import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadConfig } from './lib/b2.mjs'

loadConfig()
const cli = resolve('node_modules/wrangler/bin/wrangler.js')
const config = resolve('services/api/wrangler.json')
const file = resolve('.npm-cache/worker-secrets.json')
function run(args) { execFileSync(process.execPath, [cli, ...args, '--config', config], { stdio: 'inherit', env: process.env }) }
run(['d1', 'migrations', 'apply', 'king-comics-prod', '--remote'])
run(['deploy'])
try {
  mkdirSync(resolve('.npm-cache'), { recursive: true })
  writeFileSync(file, JSON.stringify({
    B2_KEY_ID: process.env.B2_READ_KEY_ID,
    B2_APPLICATION_KEY: process.env.B2_READ_APPLICATION_KEY,
    MEDIA_SIGNING_SECRET: process.env.MEDIA_SIGNING_SECRET,
  }))
  run(['secret', 'bulk', file])
} finally { try { unlinkSync(file) } catch {} }
