import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import AdmZip from 'adm-zip'

const aws = join(process.env.LOCALAPPDATA, 'Programs/Amazon/AWSCLIV2/aws.exe')
function run(args) { return execFileSync(aws, [...args, '--profile', 'default', '--region', 'us-east-2', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }) }
const resources = JSON.parse(run(['cloudformation', 'list-stack-resources', '--stack-name', 'king-comics-sync']))
const name = resources.StackResourceSummaries.find(item => item.ResourceType === 'AWS::Lambda::Function')?.PhysicalResourceId
if (!name) throw new Error('Legacy sync function not found')
const previous = JSON.parse(run(['lambda', 'get-function', '--function-name', name]))
mkdirSync('.archive-backups/b2-migration', { recursive: true })
const saved = await fetch(previous.Code.Location)
if (!saved.ok) throw new Error('Could not back up previous Lambda code')
writeFileSync('.archive-backups/b2-migration/previous-sync-lambda.zip', Buffer.from(await saved.arrayBuffer()))
const zip = new AdmZip()
zip.addFile('index.cjs', Buffer.from(`exports.handler = async event => {
  const method = event.requestContext?.http?.method ?? event.httpMethod
  const headers = {}
  for (const key of ['authorization', 'origin', 'content-type', 'x-profile-id', 'x-profile-pin', 'x-profile-name']) {
    if (event.headers?.[key]) headers[key] = event.headers[key]
  }
  const response = await fetch('https://king-comics-api.jacobuid-king-videos.workers.dev' + (event.rawPath || '/profiles'), {
    method, headers, redirect: 'error',
    ...(['POST','PUT','PATCH'].includes(method) ? {body:event.isBase64Encoded ? Buffer.from(event.body,'base64').toString('utf8') : event.body} : {})
  })
  return {statusCode:response.status,headers:{'content-type':'application/json','cache-control':'no-store'},body:await response.text()}
}
`))
const path = resolve('.archive-backups/b2-migration/sync-bridge.zip')
zip.writeZip(path)
run(['lambda', 'update-function-code', '--function-name', name, '--zip-file', `fileb://${path.replaceAll('\\', '/')}`])
run(['lambda', 'wait', 'function-updated-v2', '--function-name', name])
console.log('Legacy sync URL now forwards to Cloudflare. No further profile updates are written to S3. Previous Lambda code backed up locally.')
