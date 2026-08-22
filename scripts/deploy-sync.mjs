import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const region = process.env.AWS_REGION || 'us-east-2'
const stackName = 'king-comics-sync'
const windowsAwsPath = `${process.env.LOCALAPPDATA}\\Programs\\Amazon\\AWSCLIV2\\aws.exe`
const awsCommand = process.platform === 'win32' && existsSync(windowsAwsPath)
  ? windowsAwsPath
  : 'aws'
const windowsGhPath = 'C:\\Program Files\\GitHub CLI\\gh.exe'
const ghCommand = process.platform === 'win32' && existsSync(windowsGhPath)
  ? windowsGhPath
  : 'gh'

function aws(args, options = {}) {
  return execFileSync(awsCommand, [...args, '--region', region], {
    cwd: root,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  })
}

const template = JSON.parse(readFileSync(
  join(root, 'infrastructure', 'sync-stack.template.json'),
  'utf8',
))
template.Resources.SyncFunction.Properties.Code.ZipFile = readFileSync(
  join(root, 'infrastructure', 'sync-api', 'index.cjs'),
  'utf8',
)

const generatedTemplate = join(tmpdir(), `king-comics-sync-${process.pid}.json`)
writeFileSync(generatedTemplate, JSON.stringify(template))

console.log('Restricting CloudFront to comic asset folders…')
aws([
  's3api', 'put-bucket-policy',
  '--bucket', 'king-comics-jacobuid',
  '--policy', `file://${join(root, 'infrastructure', 's3-cloudfront-policy.json').replaceAll('\\', '/')}`,
])

console.log(`Deploying ${stackName} in ${region}…`)
aws([
  'cloudformation', 'deploy',
  '--stack-name', stackName,
  '--template-file', generatedTemplate,
  '--capabilities', 'CAPABILITY_IAM',
  '--parameter-overrides', 'DataBucketName=king-comics-jacobuid',
  '--no-fail-on-empty-changeset',
])

const syncApiUrl = aws([
  'cloudformation', 'describe-stacks',
  '--stack-name', stackName,
  '--query', 'Stacks[0].Outputs[?OutputKey==`SyncApiUrl`].OutputValue',
  '--output', 'text',
], { capture: true }).trim()

console.log(`\nSync API: ${syncApiUrl}`)

try {
  execFileSync(ghCommand, [
    'variable', 'set', 'VITE_SYNC_API_URL',
    '--body', syncApiUrl,
    '--repo', 'jacobuid/king-comics',
  ], { cwd: root, stdio: 'inherit' })
  console.log('GitHub Actions variable VITE_SYNC_API_URL updated.')
} catch {
  console.warn('Could not update the GitHub variable automatically.')
  console.warn(`Set VITE_SYNC_API_URL to ${syncApiUrl}`)
}

console.log('Push the application changes to main to publish the synced PWA.')
