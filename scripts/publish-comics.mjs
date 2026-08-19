import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const bucket = 'king-comics-jacobuid'
const profile = 'king-comics'
const cloudFrontBaseUrl = 'https://d1ktco3tjlf7cv.cloudfront.net'
const siteBaseUrl = 'https://jacobuid.github.io/king-comics'
const projectRoot = process.cwd()
const comicsRoot = path.join(projectRoot, 'public', 'comics')
const coversRoot = path.join(projectRoot, 'public', 'generated', 'covers')
const catalogScript = path.join(projectRoot, 'scripts', 'generate-comic-catalog.mjs')
const catalogFile = path.join(projectRoot, 'src', 'data', 'comics.generated.js')
const windowsAwsPath = 'C:\\Program Files\\Amazon\\AWSCLIV2\\aws.exe'
const awsCommand = process.platform === 'win32' && existsSync(windowsAwsPath)
  ? windowsAwsPath
  : 'aws'

function usage() {
  console.log(`Usage:
  npm run publish:comic
  npm run publish:comic -- --series "Series Folder"
  npm run publish:comic -- --series "Series Folder" --dry-run

Without --series, every changed comic archive is synchronized. AWS sync uploads
only new or changed comic archives. Generated covers are synchronized separately,
and obsolete files are deleted only from the generated/covers prefix.`)
}

function parseArguments(args) {
  let series = ''
  let dryRun = false

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]

    if (argument === '--help' || argument === '-h') return { help: true }
    if (argument === '--dry-run') {
      dryRun = true
      continue
    }
    if (argument === '--series') {
      series = args[index + 1] ?? ''
      index += 1
      if (!series) throw new Error('--series requires a folder name.')
      continue
    }

    throw new Error(`Unknown argument: ${argument}`)
  }

  return { dryRun, help: false, series }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
  })

  if (result.error) {
    if (result.error.code === 'ENOENT') {
      throw new Error(`${command} was not found. Install it or add it to PATH.`)
    }
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}.`)
  }
}

async function resolveSeriesDirectory(series) {
  if (!series) return comicsRoot

  const directory = path.resolve(comicsRoot, series)
  const comicsPrefix = `${path.resolve(comicsRoot)}${path.sep}`

  if (!directory.startsWith(comicsPrefix)) {
    throw new Error('The series folder must be inside public/comics.')
  }

  const details = await stat(directory).catch(() => null)
  if (!details?.isDirectory()) throw new Error(`Series folder not found: ${series}`)

  return directory
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  if (options.help) {
    usage()
    return
  }

  const comicSource = await resolveSeriesDirectory(options.series)
  const comicDestination = options.series
    ? `s3://${bucket}/comics/${options.series.split(/[\\/]+/).join('/')}`
    : `s3://${bucket}/comics`
  const dryRunArguments = options.dryRun ? ['--dryrun'] : []

  console.log('Generating the comic catalog and covers...')
  run(process.execPath, [catalogScript])

  const catalogUrl = `${pathToFileURL(catalogFile).href}?updated=${Date.now()}`
  const { comics } = await import(catalogUrl)
  const catalogSeriesName = options.series.split(/[\\/]+/).join(' / ')
  const selectedComics = options.series
    ? comics.filter((comic) => comic.series === catalogSeriesName)
    : comics

  if (options.series && selectedComics.length === 0) {
    throw new Error(`No supported CBZ or CBR files were found in ${options.series}.`)
  }

  console.log(`${options.dryRun ? 'Checking' : 'Uploading'} comic archives...`)
  run(awsCommand, [
    's3', 'sync', comicSource, comicDestination,
    '--exclude', '*.gitkeep',
    '--profile', profile,
    ...dryRunArguments,
  ])

  console.log(`${options.dryRun ? 'Checking' : 'Uploading'} generated covers...`)
  run(awsCommand, [
    's3', 'sync', coversRoot, `s3://${bucket}/generated/covers`,
    '--delete',
    '--profile', profile,
    ...dryRunArguments,
  ])

  const selectedSeries = new Map()
  for (const comic of selectedComics) selectedSeries.set(comic.seriesId, comic.series)

  console.log(`\n${options.dryRun ? 'Dry run complete.' : 'Publish complete.'}`)
  console.log(`Catalog: ${comics.length} comics across ${new Set(comics.map((comic) => comic.seriesId)).size} series`)
  console.log('\nSeries pages:')
  for (const [seriesId, seriesName] of selectedSeries) {
    console.log(`  ${seriesName}: ${siteBaseUrl}/${seriesId}/`)
  }

  if (options.series) {
    console.log('\nComic asset URLs:')
    for (const comic of selectedComics) {
      console.log(`  ${`${comic.title} ${comic.issue}`.trim()}`)
      console.log(`    Archive: ${cloudFrontBaseUrl}${comic.archive}`)
      if (comic.cover) console.log(`    Cover:   ${cloudFrontBaseUrl}${comic.cover}`)
    }
  }

  if (!options.dryRun) {
    console.log('\nThe assets are live on CloudFront and the local catalog is updated.')
    console.log('Deploy the catalog to GitHub Pages with:')
    console.log('  npm run deploy:comic')
  }
}

main().catch((error) => {
  console.error(`\nPublish failed: ${error.message}`)
  process.exitCode = 1
})
