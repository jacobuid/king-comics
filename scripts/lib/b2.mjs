import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export const bucketName = 'king-comics-jacobuid'
export function loadConfig() {
  const file = resolve('.env.b2.local')
  if (existsSync(file)) process.loadEnvFile(file)
}
export async function authorize(keyId = process.env.B2_KEY_ID, key = process.env.B2_APPLICATION_KEY) {
  if (!keyId || !key) throw new Error('B2 credentials are missing. Run provision:b2 first.')
  const response = await fetch('https://api.backblazeb2.com/b2api/v4/b2_authorize_account', {
    headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${key}`).toString('base64')}` },
  })
  if (!response.ok) throw new Error(`B2 authorization failed (${response.status})`)
  return response.json()
}
export async function b2(auth, operation, body) {
  const response = await fetch(`${auth.apiInfo.storageApi.apiUrl}/b2api/v4/${operation}`, {
    method: 'POST', headers: { Authorization: auth.authorizationToken, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw new Error(`B2 ${operation} failed (${response.status})`)
  return response.json()
}
export async function findBucket(auth) {
  const listed = await b2(auth, 'b2_list_buckets', { accountId: auth.accountId, bucketName })
  const bucket = listed.buckets.find(item => item.bucketName === bucketName)
  if (!bucket) throw new Error(`Missing B2 bucket ${bucketName}`)
  return bucket
}
export async function listFiles(auth, bucketId, prefix = '') {
  const files = []
  let startFileName
  do {
    const page = await b2(auth, 'b2_list_file_names', { bucketId, prefix, startFileName, maxFileCount: 10000 })
    files.push(...page.files)
    startFileName = page.nextFileName
  } while (startFileName)
  return files
}
