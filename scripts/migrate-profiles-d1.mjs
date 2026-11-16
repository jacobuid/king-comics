import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { loadConfig } from './lib/b2.mjs'
import profileAPI from '../services/api/profile-core.cjs'

loadConfig()
const config = JSON.parse(readFileSync('services/api/wrangler.json', 'utf8'))
const aws = join(process.env.LOCALAPPDATA, 'Programs/Amazon/AWSCLIV2/aws.exe')
function source(args) { return JSON.parse(execFileSync(aws, [...args, '--profile', 'king-comics', '--region', 'us-east-2', '--output', 'json'], { encoding: 'utf8' })) }
async function query(sql, params = []) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${config.d1_databases[0].database_id}/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ sql, params }),
  })
  const payload = await response.json()
  if (!response.ok || !payload.success || payload.result.some(result => !result.success)) throw new Error('D1 profile migration query failed')
  return payload.result[0]
}
const directory = resolve('.archive-backups/b2-migration')
mkdirSync(directory, { recursive: true })
const snapshot = { exportedAt: new Date().toISOString(), objects: [] }
const listed = source(['s3api', 'list-objects-v2', '--bucket', 'king-comics-jacobuid', '--prefix', 'profiles/'])
const temporary = join(directory, `.profile-source-${process.pid}.tmp`)
try {
  for (const item of listed.Contents ?? []) {
    const metadata = source(['s3api', 'get-object', '--bucket', 'king-comics-jacobuid', '--key', item.Key, temporary])
    const raw = readFileSync(temporary, 'utf8')
    snapshot.objects.push({ key: item.Key, raw, etag: metadata.ETag, sha256: createHash('sha256').update(raw).digest('hex') })
  }
} finally { try { unlinkSync(temporary) } catch {} }
writeFileSync(join(directory, `profile-source-${Date.now()}.json`), JSON.stringify(snapshot, null, 2))
for (const object of snapshot.objects) {
  const existing = (await query('SELECT value FROM profile_objects WHERE key = ?', [object.key])).results[0]
  let value = object.raw
  if (existing && existing.value !== object.raw) {
    const saved = JSON.parse(existing.value), incoming = JSON.parse(object.raw)
    const newer = (saved.updatedAt ?? '') >= (incoming.updatedAt ?? '') ? saved : incoming
    value = JSON.stringify({ ...newer, ...(newer.type === 'profile-moved' ? {} : { progress: profileAPI._test.mergeProgress(incoming.progress, saved.progress) }) })
  }
  await query('INSERT INTO profile_objects (key, value, etag) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, etag = excluded.etag', [object.key, value, crypto.randomUUID()])
  const verified = (await query('SELECT value FROM profile_objects WHERE key = ?', [object.key])).results[0]
  if (verified?.value !== value) throw new Error(`Profile verification failed: ${object.key}`)
}
console.log(`Migrated and verified ${snapshot.objects.length} profile/rename documents into D1; source and local backup preserved.`)
