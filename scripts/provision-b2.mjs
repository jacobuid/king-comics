import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { authorize, b2, bucketName } from './lib/b2.mjs'

if (existsSync('.env.b2.local')) throw new Error('B2 configuration already exists; refusing to rotate existing credentials.')
const auth = await authorize(process.env.B2_BOOTSTRAP_KEY_ID, process.env.B2_BOOTSTRAP_APPLICATION_KEY)
const listed = await b2(auth, 'b2_list_buckets', { accountId: auth.accountId, bucketName })
let bucket = listed.buckets.find(item => item.bucketName === bucketName)
if (!bucket) bucket = await b2(auth, 'b2_create_bucket', {
  accountId: auth.accountId, bucketName, bucketType: 'allPrivate',
  defaultServerSideEncryption: { mode: 'SSE-B2', algorithm: 'AES256' },
})
if (bucket.bucketType !== 'allPrivate') throw new Error('Expected a private B2 bucket.')
const runtime = await b2(auth, 'b2_create_key', {
  accountId: auth.accountId, keyName: `king-comics-worker-${Date.now()}`,
  capabilities: ['listBuckets', 'listFiles', 'readFiles'], bucketIds: [bucket.bucketId],
})
const writer = await b2(auth, 'b2_create_key', {
  accountId: auth.accountId, keyName: `king-comics-publisher-${Date.now()}`,
  capabilities: ['listBuckets', 'listFiles', 'readFiles', 'writeFiles'], bucketIds: [bucket.bucketId],
})
const secrets = {
  B2_KEY_ID: writer.applicationKeyId, B2_APPLICATION_KEY: writer.applicationKey,
  B2_READ_KEY_ID: runtime.applicationKeyId, B2_READ_APPLICATION_KEY: runtime.applicationKey,
  B2_BUCKET_ID: bucket.bucketId,
  CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
  CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
  MEDIA_SIGNING_SECRET: crypto.randomUUID() + crypto.randomUUID(),
}
writeFileSync('.env.b2.local', Object.entries(secrets).map(([name, value]) => `${name}=${value}`).join('\n') + '\n', { flag: 'wx' })
async function cf(path, body) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${secrets.CLOUDFLARE_ACCOUNT_ID}/${path}`, {
    method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${secrets.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const payload = await response.json()
  if (!response.ok || !payload.success) throw new Error(`Cloudflare ${path} failed (${response.status})`)
  return payload.result
}
const databases = await cf('d1/database')
const db = databases.find(item => item.name === 'king-comics-prod') ?? await cf('d1/database', { name: 'king-comics-prod' })
const config = JSON.parse(readFileSync('services/api/wrangler.json', 'utf8'))
config.account_id = secrets.CLOUDFLARE_ACCOUNT_ID
config.d1_databases[0].database_id = db.uuid
writeFileSync('services/api/wrangler.json', JSON.stringify(config, null, 2) + '\n')
console.log(`Provisioned private ${bucketName} B2 bucket and king-comics-prod D1 database. Credentials saved only in ignored .env.b2.local.`)
