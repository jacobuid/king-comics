import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { authorize, findBucket, listFiles, loadConfig } from './lib/b2.mjs'

// Retirement is limited to the exact, verified King Comics resources.
const bucket = 'king-comics-jacobuid', distribution = 'E3C2G8VW4ZZM4W', stack = 'king-comics-sync'
const aws = join(process.env.LOCALAPPDATA, 'Programs/Amazon/AWSCLIV2/aws.exe')
function run(args) {
  const output = execFileSync(aws, [...args, '--profile', 'default', '--region', 'us-east-2', '--output', 'json', '--no-cli-pager'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  return output.trim() ? JSON.parse(output) : {}
}
const directory = resolve('.archive-backups/b2-migration')
const report = JSON.parse(readFileSync(join(directory, 'asset-copy-report.json'), 'utf8'))
const proof = JSON.parse(readFileSync(join(directory, 'cutover-verification.json'), 'utf8'))
if (!proof.allChecksumsMatch || proof.sourceBucket !== bucket || proof.objects !== 2292) throw new Error('Verified migration report required.')
loadConfig()
const auth = await authorize(), destination = await findBucket(auth)
const files = new Map((await listFiles(auth, destination.bucketId)).map(file => [file.fileName, file]))
const source = run(['s3api', 'list-objects-v2', '--bucket', bucket]).Contents ?? []
if (source.length !== proof.objects) throw new Error('Source inventory changed; stop and reverify migration.')
for (const object of source) {
  const expected = report.objects[object.Key], actual = files.get(object.Key)
  if (!expected || expected.sourceEtag !== object.ETag.replaceAll('"', '') || object.Size !== expected.size || actual?.contentLength !== expected.size || actual.contentSha1 !== expected.sha1) throw new Error(`Source/destination verification failed: ${object.Key}`)
}
if (run(['s3api', 'get-bucket-versioning', '--bucket', bucket]).Status) throw new Error('Versioned bucket needs separate retirement review.')
const current = run(['cloudfront', 'get-distribution-config', '--id', distribution])
if (!current.DistributionConfig.Origins.Items.every(origin => origin.DomainName.startsWith(`${bucket}.s3`))) throw new Error('Distribution has unrelated origins; refusing changes.')
const resources = run(['cloudformation', 'list-stack-resources', '--stack-name', stack]).StackResourceSummaries
const lambda = resources.find(item => item.ResourceType === 'AWS::Lambda::Function')?.PhysicalResourceId
if (!lambda?.startsWith('king-comics-sync-')) throw new Error('Unexpected sync stack resources.')
writeFileSync(join(directory, 'retired-distribution-config.json'), JSON.stringify(current, null, 2))
writeFileSync(join(directory, 'retired-stack-resources.json'), JSON.stringify(resources, null, 2))
const summary = { objects: source.length, bytes: proof.bytes, bucket, distribution, stack, verifiedCopiesInB2: true }
console.log('Retirement plan:', JSON.stringify(summary))
if (!process.argv.includes('--apply')) {
  console.log('Dry run only. Add --apply to retire these verified AWS resources.')
} else {
  const disabled = { ...current.DistributionConfig, Enabled: false }
  const path = join(directory, 'disabled-distribution.json')
  writeFileSync(path, JSON.stringify(disabled))
  run(['cloudfront', 'update-distribution', '--id', distribution, '--if-match', current.ETag, '--distribution-config', `file://${path.replaceAll('\\', '/')}`])
  console.log('CloudFront disable initiated.')
  run(['cloudformation', 'delete-stack', '--stack-name', stack])
  console.log('Old Lambda/IAM sync stack deletion initiated.')
  for (let index = 0; index < source.length; index += 1000) {
    const deletion = join(directory, 'verified-source-deletion.json')
    writeFileSync(deletion, JSON.stringify({ Objects: source.slice(index, index + 1000).map(item => ({ Key: item.Key })), Quiet: true }))
    const result = run(['s3api', 'delete-objects', '--bucket', bucket, '--delete', `file://${deletion.replaceAll('\\', '/')}`])
    if (result.Errors?.length) throw new Error('AWS reported object deletion errors; inspect retirement report.')
  }
  if ((run(['s3api', 'list-objects-v2', '--bucket', bucket]).Contents ?? []).length) throw new Error('Source bucket is not empty; refusing bucket deletion.')
  run(['s3api', 'delete-bucket', '--bucket', bucket])
  summary.bucketDeleted = true
  console.log('Verified source objects and empty S3 bucket removed; B2 copies preserved.')
  const deadline = Date.now() + 45 * 60_000
  while (true) {
    const status = run(['cloudfront', 'get-distribution', '--id', distribution])
    if (status.Distribution.Status === 'Deployed' && !status.Distribution.DistributionConfig.Enabled) {
      run(['cloudfront', 'delete-distribution', '--id', distribution, '--if-match', status.ETag])
      summary.distributionDeleted = true
      console.log('Old CloudFront distribution deleted.')
      break
    }
    if (Date.now() > deadline) throw new Error('CloudFront disable is still propagating. Distribution is disabled; finish deletion after deployment.')
    console.log('Waiting for CloudFront disable propagation...')
    await new Promise(resolve => setTimeout(resolve, 20_000))
  }
  run(['cloudformation', 'wait', 'stack-delete-complete', '--stack-name', stack])
  summary.stackDeleted = true
  try { run(['logs', 'delete-log-group', '--log-group-name', `/aws/lambda/${lambda}`]); summary.oldLogsDeleted = true } catch { summary.oldLogsDeleted = false }
  const oacs = [...new Set(current.DistributionConfig.Origins.Items.map(origin => origin.OriginAccessControlId).filter(Boolean))]
  for (const id of oacs) {
    try {
      const oac = run(['cloudfront', 'get-origin-access-control', '--id', id])
      if (oac.OriginAccessControl.OriginAccessControlConfig.Name.startsWith('king-comics')) run(['cloudfront', 'delete-origin-access-control', '--id', id, '--if-match', oac.ETag])
    } catch { console.log('An origin access control is retained because it is shared or already removed.') }
  }
  summary.retiredAt = new Date().toISOString()
  writeFileSync(join(directory, 'aws-retirement.json'), JSON.stringify(summary, null, 2))
  console.log('AWS retirement complete:', JSON.stringify(summary))
}
