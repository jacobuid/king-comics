import { createHash } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { authorize, b2, findBucket, listFiles, loadConfig } from './lib/b2.mjs'

loadConfig()
const auth = await authorize()
const bucket = await findBucket(auth)
const inventoryFile = process.argv[2] || '.archive-backups/b2-migration/aws-inventory.json'
const source = JSON.parse(readFileSync(inventoryFile, 'utf8')).Contents.filter(item => process.argv.includes('--profiles-only')
  ? item.Key.startsWith('profiles/')
  : /^(comics\/|generated\/covers\/)/.test(item.Key) || (process.argv.includes('--include-profiles') && item.Key.startsWith('profiles/')))
const remote = new Map((await listFiles(auth, bucket.bucketId)).map(item => [item.fileName, item]))
const reportPath = '.archive-backups/b2-migration/asset-copy-report.json'
mkdirSync(dirname(reportPath), { recursive: true })
const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : { objects: {} }
const run = promisify(execFile)
const aws = join(process.env.LOCALAPPDATA || '', 'Programs/Amazon/AWSCLIV2/aws.exe')
const publicRoot = resolve('public')
async function checksums(file) {
  const md5 = createHash('md5'), sha1 = createHash('sha1'), parts = []
  let part = createHash('md5'), bytes = 0
  for await (const chunk of createReadStream(file)) {
    md5.update(chunk); sha1.update(chunk)
    for (let offset = 0; offset < chunk.length;) {
      const length = Math.min(chunk.length - offset, 8 * 1024 * 1024 - bytes)
      part.update(chunk.subarray(offset, offset + length)); bytes += length; offset += length
      if (bytes === 8 * 1024 * 1024) { parts.push(part.digest()); part = createHash('md5'); bytes = 0 }
    }
  }
  if (bytes) parts.push(part.digest())
  return { md5: md5.digest('hex'), sha1: sha1.digest('hex'), multipart: `${createHash('md5').update(Buffer.concat(parts)).digest('hex')}-${parts.length}` }
}
let next = 0, completed = 0, uploadedBytes = 0
async function worker() {
  let upload
  while (next < source.length) {
    const item = source[next++]
    let file = resolve(publicRoot, item.Key)
    if (!file.startsWith(publicRoot + sep)) throw new Error('Invalid asset path')
    let size = await stat(file).then(x => x.size).catch(() => -1)
    let hashes = size === item.Size ? await checksums(file) : null
    const etag = item.ETag.replaceAll('"', '')
    if (!hashes || ![hashes.md5, hashes.multipart].includes(etag)) {
      file = resolve('.archive-backups/b2-migration/source', item.Key)
      mkdirSync(dirname(file), { recursive: true })
      await run(existsSync(aws) ? aws : 'aws', ['s3api', 'get-object', '--bucket', 'king-comics-jacobuid', '--key', item.Key, '--profile', 'king-comics', '--region', 'us-east-2', file])
      size = (await stat(file)).size; hashes = await checksums(file)
      if (size !== item.Size) throw new Error(`Source size mismatch: ${item.Key}`)
    }
    const saved = remote.get(item.Key)
    if (!saved || saved.contentLength !== size || saved.contentSha1 !== hashes.sha1) {
      if (saved) throw new Error(`B2 destination already has different content: ${item.Key}`)
      for (let attempt = 0; attempt < 5; attempt++) {
        upload ??= await b2(auth, 'b2_get_upload_url', { bucketId: bucket.bucketId })
        try {
          const response = await fetch(upload.uploadUrl, {
            method: 'POST', headers: {
              Authorization: upload.authorizationToken, 'X-Bz-File-Name': encodeURIComponent(item.Key),
              'X-Bz-Content-Sha1': hashes.sha1, 'Content-Length': String(size),
              'Content-Type': item.Key.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream',
              'X-Bz-Info-source-etag': etag,
            }, body: createReadStream(file), duplex: 'half',
          })
          if (!response.ok) throw new Error(`Upload HTTP ${response.status}`)
          const result = await response.json()
          if (result.contentSha1 !== hashes.sha1 || result.contentLength !== size) throw new Error('B2 checksum mismatch')
          uploadedBytes += size
          break
        } catch (error) { upload = null; if (attempt === 4) throw error }
      }
    }
    report.objects[item.Key] = { size, sha1: hashes.sha1, sourceEtag: etag }
    completed++
    if (completed % 25 === 0 || completed === source.length) {
      writeFileSync(reportPath, JSON.stringify(report, null, 2))
      console.log(`Verified ${completed}/${source.length} objects; uploaded ${(uploadedBytes / 1e9).toFixed(2)} GB`)
    }
  }
}
await Promise.all(Array.from({ length: 4 }, worker))
const destination = new Map((await listFiles(auth, bucket.bucketId)).map(item => [item.fileName, item]))
for (const item of source) {
  const result = destination.get(item.Key), expected = report.objects[item.Key]
  if (!result || result.contentLength !== expected.size || result.contentSha1 !== expected.sha1) throw new Error(`Final verification failed: ${item.Key}`)
}
report.verifiedAt = new Date().toISOString()
writeFileSync(reportPath, JSON.stringify(report, null, 2))
console.log(`Migration verified: ${source.length} B2 assets match their AWS originals. No source objects deleted.`)
