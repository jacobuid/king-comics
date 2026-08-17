import { spawnSync } from 'node:child_process'
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

function usage() {
  console.log(`Usage:
  npm run publish:comics
  npm run publish:comics -- --series "Series Folder"
  npm run publish:comics -- --series "Series Folder" --dry-run

Without --series, every changed comic archive is synchronized. AWS sync uploads
only new or changed files and never deletes remote objects.`)
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
  run('aws', [
    's3', 'sync', comicSource, comicDestination,
    '--exclude', '*.gitkeep',
    '--profile', profile,
    ...dryRunArguments,
  ])

  console.log(`${options.dryRun ? 'Checking' : 'Uploading'} generated covers...`)
  if (options.series) {
    for (const comic of selectedComics) {
      if (!comic.cover) continue

      const coverFilename = comic.cover.split('/').at(-1)
      run('aws', [
        's3', 'cp', path.join(coversRoot, coverFilename),
        `s3://${bucket}${comic.cover}`,
        '--profile', profile,
        ...dryRunArguments,
      ])
    }
  } else {
    run('aws', [
      's3', 'sync', coversRoot, `s3://${bucket}/generated/covers`,
      '--profile', profile,
      ...dryRunArguments,
    ])
  }

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
    console.log('\nThe assets are live on CloudFront. To update the website catalog, commit and push:')
    console.log('  git add src/data/comics.generated.js')
    console.log('  git commit -m "Add comics to the catalog"')
    console.log('  git push origin main')
  }
}

main().catch((error) => {
  console.error(`\nPublish failed: ${error.message}`)
  process.exitCode = 1
})
