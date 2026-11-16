import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { b2 } from './b2.mjs'

export async function sha1File(path) {
  const hash = createHash('sha1')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}
export async function uploadFile(auth, bucketId, key, file, existing, dryRun = false) {
  const size = (await stat(file)).size, sha1 = await sha1File(file)
  if (existing?.contentLength === size && existing.contentSha1 === sha1) return false
  if (dryRun) { console.log(`Would upload: ${key}`); return true }
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const upload = await b2(auth, 'b2_get_upload_url', { bucketId })
      const response = await fetch(upload.uploadUrl, {
        method: 'POST', headers: {
          Authorization: upload.authorizationToken, 'X-Bz-File-Name': encodeURIComponent(key),
          'X-Bz-Content-Sha1': sha1, 'Content-Length': String(size),
          'Content-Type': key.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream',
        }, body: createReadStream(file), duplex: 'half',
      })
      if (!response.ok) throw new Error(`Upload HTTP ${response.status}`)
      const result = await response.json()
      if (result.contentSha1 !== sha1 || result.contentLength !== size) throw new Error('Upload checksum mismatch')
      return true
    } catch (error) { if (attempt === 3) throw error }
  }
}
