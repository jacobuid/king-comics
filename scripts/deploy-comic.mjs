import { spawnSync } from 'node:child_process'

const catalogFile = 'src/data/comics.generated.js'
const siteUrl = 'https://jacobuid.github.io/king-comics/'

function usage() {
  console.log(`Usage:
  npm run deploy:comic
  npm run deploy:comic -- --message "Add My Little Pony comics"

This verifies a production build, commits only the generated comic catalog,
and pushes main. The GitHub Pages workflow performs the deployment.`)
}

function parseArguments(args) {
  let message = 'Publish updated comic catalog'

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]

    if (argument === '--help' || argument === '-h') return { help: true, message }
    if (argument === '--message' || argument === '-m') {
      message = args[index + 1] ?? ''
      index += 1
      if (!message) throw new Error('--message requires commit text.')
      continue
    }

    throw new Error(`Unknown argument: ${argument}`)
  }

  return { help: false, message }
}

function execute(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: options.capture ? 'utf8' : undefined,
    env: options.env ?? process.env,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  })

  if (result.error) throw result.error

  if (result.status !== 0) {
    const details = options.capture ? result.stderr.trim() : ''
    throw new Error(`${command} exited with status ${result.status}.${details ? ` ${details}` : ''}`)
  }

  return result
}

function captured(command, args) {
  return execute(command, args, { capture: true }).stdout.trim()
}

function catalogHasChanges() {
  return Boolean(captured('git', ['status', '--porcelain', '--', catalogFile]))
}

function main() {
  const options = parseArguments(process.argv.slice(2))
  if (options.help) {
    usage()
    return
  }

  const branch = captured('git', ['branch', '--show-current'])
  if (branch !== 'main') throw new Error(`Expected branch main, but found ${branch || 'detached HEAD'}.`)
  if (!catalogHasChanges()) {
    console.log('The generated comic catalog has no changes to deploy.')
    return
  }

  console.log('Verifying the GitHub Pages production build...')
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  execute(npmCommand, ['run', 'build'], {
    env: { ...process.env, GITHUB_ACTIONS: 'true' },
  })

  console.log('Committing the generated catalog...')
  execute('git', ['add', catalogFile])
  execute('git', ['diff', '--cached', '--check', '--', catalogFile])
  execute('git', ['commit', '-m', options.message, '--', catalogFile])

  console.log('Pushing main to trigger GitHub Pages...')
  execute('git', ['push', 'origin', 'main'])

  console.log(`\nGitHub Pages deployment triggered: ${siteUrl}`)
  console.log('Track it at: https://github.com/jacobuid/king-comics/actions')
}

try {
  main()
} catch (error) {
  console.error(`\nDeploy failed: ${error.message}`)
  process.exitCode = 1
}
