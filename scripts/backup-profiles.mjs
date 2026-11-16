import {createHash} from 'node:crypto'
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {loadConfig} from './lib/b2.mjs'
loadConfig()
const config=JSON.parse(readFileSync('services/api/wrangler.json','utf8'))
const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/d1/database/'+config.d1_databases[0].database_id+'/query',{
 method:'POST',headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({sql:'SELECT key, value, etag FROM profile_objects ORDER BY key'})
})
const payload=await response.json()
if(!response.ok||!payload.success)throw Error('Profile backup query failed')
const exportedAt=new Date().toISOString()
const backup={format:'king-comics.profile-backup.v2',backend:'Cloudflare D1',exportedAt,objects:payload.result[0].results.map(row=>({key:row.key,raw:row.value,etag:row.etag,sha256:createHash('sha256').update(row.value).digest('hex')}))}
mkdirSync('.archive-backups/profiles',{recursive:true})
const path='.archive-backups/profiles/profiles-'+exportedAt.replaceAll(':','-')+'.json'
writeFileSync(path,JSON.stringify(backup,null,2)+'\n',{flag:'wx'})
console.log('Saved '+backup.objects.length+' profile/rename records from D1 to '+path)
