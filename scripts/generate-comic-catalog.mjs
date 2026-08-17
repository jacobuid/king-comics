import AdmZip from 'adm-zip'
import { createExtractorFromData } from 'node-unrar-js'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

const projectRoot = process.cwd()
const comicsRoot = path.join(projectRoot, 'public', 'comics')
const coversRoot = path.join(projectRoot, 'public', 'generated', 'covers')
const libarchiveRoot = path.join(projectRoot, 'public', 'libarchive')
const generatedFile = path.join(projectRoot, 'src', 'data', 'comics.generated.js')
const supportedExtensions = new Set(['.cbr', '.cbz'])
const coverExtensions = ['.avif', '.gif', '.jpg', '.png', '.webp']

async function findArchives(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const archives = []

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) archives.push(...await findArchives(entryPath))
    if (entry.isFile() && supportedExtensions.has(path.extname(entry.name).toLowerCase())) {
      archives.push(entryPath)
    }
  }

  return archives
}

function naturalCompare(first, second) {
  return first.localeCompare(second, undefined, { numeric: true, sensitivity: 'base' })
}

async function extractCover(filePath, comicId) {
  const archiveDetails = await stat(filePath)

  for (const extension of coverExtensions) {
    const coverFilename = `${comicId}${extension}`
    const coverPath = path.join(coversRoot, coverFilename)
    const coverDetails = await stat(coverPath).catch(() => null)

    if (coverDetails && coverDetails.mtimeMs >= archiveDetails.mtimeMs) {
      return `/generated/covers/${coverFilename}`
    }
  }

  try {
    const zip = new AdmZip(filePath)
    const imageEntries = zip.getEntries()
      .filter((entry) => {
        const normalizedName = entry.entryName.replaceAll('\\', '/')
        const basename = normalizedName.split('/').at(-1)
        return !entry.isDirectory
          && !normalizedName.startsWith('__MACOSX/')
          && !basename.startsWith('._')
          && /\.(avif|gif|jpe?g|png|webp)$/i.test(basename)
      })
      .sort((first, second) => naturalCompare(first.entryName, second.entryName))

    const coverEntry = imageEntries[0]
    if (!coverEntry) return null

    const extension = path.extname(coverEntry.entryName).toLowerCase().replace('.jpeg', '.jpg')
    const coverFilename = `${comicId}${extension}`
    await writeFile(path.join(coversRoot, coverFilename), coverEntry.getData())
    return `/generated/covers/${coverFilename}`
  } catch {
    // Some comic archives have a CBZ extension but contain RAR data.
  }

  try {
    const archiveData = Uint8Array.from(await readFile(filePath)).buffer
    const extractor = await createExtractorFromData({ data: archiveData })
    const fileHeaders = [...extractor.getFileList().fileHeaders]
    const imageHeaders = fileHeaders
      .filter((header) => {
        const normalizedName = header.name.replaceAll('\\', '/')
        const basename = normalizedName.split('/').at(-1)
        return !header.flags.directory
          && !normalizedName.startsWith('__MACOSX/')
          && !basename.startsWith('._')
          && /\.(avif|gif|jpe?g|png|webp)$/i.test(basename)
      })
      .sort((first, second) => naturalCompare(first.name, second.name))

    const coverHeader = imageHeaders[0]
    if (!coverHeader) return null

    const extractedFiles = [...extractor.extract({ files: [coverHeader.name] }).files]
    const coverFile = extractedFiles.find((file) => file.fileHeader.name === coverHeader.name)
    if (!coverFile?.extraction) return null

    const extension = path.extname(coverHeader.name).toLowerCase().replace('.jpeg', '.jpg')
    const coverFilename = `${comicId}${extension}`
    await writeFile(path.join(coversRoot, coverFilename), coverFile.extraction)
    return `/generated/covers/${coverFilename}`
  } catch (error) {
    console.warn(`Could not generate a cover for ${path.basename(filePath)}: ${error.message}`)
    return null
  }
}

async function comicFromPath(filePath) {
  const relativePath = path.relative(comicsRoot, filePath).split(path.sep).join('/')
  const parts = relativePath.split('/')
  const filename = parts.at(-1)
  const filenameTitle = filename.slice(0, -path.extname(filename).length)
  const series = parts.length > 1 ? parts.slice(0, -1).join(' / ') : 'Unsorted'
  const seriesTitle = series.split(' / ').at(-1).replace(/\s*\(\d{4}\)\s*$/, '')
  const seriesId = series.toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'series'
  const datedIssue = filenameTitle.match(/(\d{1,4})(?=(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\d{4}\b)/i)
  const explicitIssue = filenameTitle.match(/(?:issue\s*|#)(\d+[a-z]?)/i)
  const trailingIssue = filenameTitle.match(/(?:^|\D)(\d{1,4})(?:\D*$)/)
  const issueNumber = datedIssue?.[1] ?? explicitIssue?.[1] ?? trailingIssue?.[1]
  const normalizedIssue = issueNumber ? issueNumber.replace(/^0+(?=\d)/, '') : ''
  const compactSeries = seriesTitle.toLowerCase().replace(/[^a-z0-9]+/g, '')
  const compactFilename = filenameTitle.toLowerCase().replace(/[^a-z0-9]+/g, '')
  const title = compactFilename.startsWith(compactSeries) ? seriesTitle : filenameTitle
  const slug = filenameTitle.toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'comic'
  const hash = createHash('sha1').update(relativePath).digest('hex').slice(0, 8)
  const archive = `/comics/${relativePath.split('/').map(encodeURIComponent).join('/')}`
  const id = `${slug}-${hash}`

  return {
    id,
    title,
    series,
    seriesId,
    issue: normalizedIssue ? `#${normalizedIssue}` : '',
    archive,
    cover: await extractCover(filePath, id),
  }
}

await mkdir(comicsRoot, { recursive: true })
await mkdir(coversRoot, { recursive: true })
await mkdir(libarchiveRoot, { recursive: true })

const archivePaths = (await findArchives(comicsRoot)).sort(naturalCompare)
const comics = await Promise.all(archivePaths.map(comicFromPath))
const activeCoverFiles = new Set(
  comics
    .map((comic) => comic.cover?.split('/').at(-1))
    .filter(Boolean),
)
const generatedCoverEntries = await readdir(coversRoot, { withFileTypes: true })
const staleCoverEntries = generatedCoverEntries.filter((entry) => (
  entry.isFile() && !activeCoverFiles.has(entry.name)
))

await Promise.all(staleCoverEntries.map((entry) => unlink(path.join(coversRoot, entry.name))))

const source = `// Generated by npm run catalog. Do not edit by hand.\nexport const comics = ${JSON.stringify(comics, null, 2)}\n`

await writeFile(generatedFile, source, 'utf8')
await copyFile(
  path.join(projectRoot, 'node_modules', 'libarchive.js', 'dist', 'worker-bundle.js'),
  path.join(libarchiveRoot, 'worker-bundle.js'),
)
await copyFile(
  path.join(projectRoot, 'node_modules', 'libarchive.js', 'dist', 'libarchive.wasm'),
  path.join(libarchiveRoot, 'libarchive.wasm'),
)

console.log(`Comic catalog generated with ${comics.length} comic${comics.length === 1 ? '' : 's'}.`)
if (staleCoverEntries.length > 0) {
  console.log(`Removed ${staleCoverEntries.length} stale generated cover${staleCoverEntries.length === 1 ? '' : 's'}.`)
}
