import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const bucket = 'king-comics-jacobuid'
const region = process.env.AWS_REGION || 'us-east-2'
const profile = process.env.AWS_PROFILE || 'king-comics'
const timestamp = new Date().toISOString()
const output = resolve(root, '.archive-backups', 'profiles', `profiles-${timestamp.replaceAll(':', '-')}.json`)
const windowsAws = join(process.env.LOCALAPPDATA || '', 'Programs', 'Amazon', 'AWSCLIV2', 'aws.exe')
const awsCommand = process.platform === 'win32' && existsSync(windowsAws) ? windowsAws : 'aws'

function aws(args) {
  return JSON.parse(execFileSync(awsCommand, [
    ...args, '--profile', profile, '--region', region, '--output', 'json', '--no-cli-pager',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }))
}

mkdirSync(dirname(output), { recursive: true })
const listing = aws(['s3api', 'list-objects-v2', '--bucket', bucket, '--prefix', 'profiles/'])
const objects = []

for (const item of listing.Contents ?? []) {
  if (!item.Key.endsWith('.json')) continue
  const temporary = join(dirname(output), `.profile-backup-${process.pid}.tmp`)
  try {
    const metadata = aws(['s3api', 'get-object', '--bucket', bucket, '--key', item.Key, temporary])
    const raw = readFileSync(temporary, 'utf8')
    objects.push({
      key: item.Key,
      lastModified: metadata.LastModified,
      etag: metadata.ETag,
      sha256: createHash('sha256').update(raw).digest('hex'),
      raw,
    })
    JSON.parse(raw)
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary)
  }
}

const backup = { format: 'king-comics.profile-backup.v1', exportedAt: timestamp, bucket, region, objects }
writeFileSync(output, `${JSON.stringify(backup, null, 2)}\n`, { flag: 'wx' })
const saved = JSON.parse(readFileSync(output, 'utf8'))
for (const object of saved.objects) {
  if (createHash('sha256').update(object.raw).digest('hex') !== object.sha256) {
    throw new Error(`Backup verification failed: ${object.key}`)
  }
}
const active = saved.objects.filter(object => JSON.parse(object.raw).type !== 'profile-moved')
console.log(`Saved and verified ${saved.objects.length} objects (${active.length} active profiles).`)
console.log(`Backup: ${output}`)
console.log('The backup preserves complete profile documents, including progress and rename records; original S3 objects were not changed.')
