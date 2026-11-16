import { execFileSync } from 'node:child_process'
import { resolve, sep } from 'node:path'
import { stat } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { authorize, findBucket, listFiles, loadConfig } from './lib/b2.mjs'
import { uploadFile } from './lib/upload-b2.mjs'

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: npm run publish:comic -- [--series "Series Folder"] [--dry-run]\nUploads changed archives and covers to the private Backblaze B2 bucket.')
} else {
  let series = '', dryRun = false
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--series') { series = args[++index]; if (!series) throw new Error('--series requires a folder name.') }
    else if (args[index] === '--dry-run') dryRun = true
    else throw new Error('Unknown argument: ' + args[index])
  }
  const comicsRoot = resolve('public/comics')
  if (series) {
    const directory = resolve(comicsRoot, series)
    if (!directory.startsWith(comicsRoot + sep) || !(await stat(directory)).isDirectory()) throw new Error('Series must be a directory inside public/comics.')
  }
  execFileSync(process.execPath, ['scripts/generate-comic-catalog.mjs'], { stdio: 'inherit' })
  const { comics } = await import(pathToFileURL(resolve('src/data/comics.generated.js')).href + '?updated=' + Date.now())
  const name = series.split(/[\\/]+/).join(' / ')
  const selected = series ? comics.filter(comic => comic.series === name) : comics
  if (!selected.length) throw new Error('No comic archives found.')
  loadConfig()
  const auth = await authorize(), bucket = await findBucket(auth)
  const remote = new Map((await listFiles(auth, bucket.bucketId)).map(file => [file.fileName, file]))
  const keys = [...new Set(selected.flatMap(comic => [comic.archive, comic.cover].filter(Boolean)).map(url => decodeURIComponent(url).replace(/^\//, '')))]
  let next = 0, changed = 0
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < keys.length) {
      const key = keys[next++], path = resolve('public', key)
      if (!path.startsWith(resolve('public') + sep)) throw new Error('Invalid catalog asset path.')
      if (await uploadFile(auth, bucket.bucketId, key, path, remote.get(key), dryRun)) changed++
    }
  }))
  console.log((dryRun ? 'Dry run: ' : 'Publish complete: ') + changed + ' changed assets; ' + keys.length + ' checked. No remote objects deleted.')
  if (!dryRun) console.log('Deploy the updated catalog with npm run deploy:comic.')
}
