import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { commands, profileStore } from '../services/api/profile-store.js'
import profileAPI from '../services/api/profile-core.cjs'
import worker, { issueTicket, verifyTicket, mediaKey } from '../services/api/worker.js'

function database() {
  const sql = new DatabaseSync(':memory:')
  sql.exec(readFileSync(new URL('../services/api/migrations/0001_profiles.sql', import.meta.url), 'utf8'))
  return {
    sql,
    prepare(query) {
      return { bind(...params) {
        const statement = sql.prepare(query)
        return {
          async first() { return statement.get(...params) ?? null },
          async all() { return { results: statement.all(...params) } },
          async run() { return { meta: { changes: Number(statement.run(...params).changes) } } },
        }
      } }
    },
  }
}

test('D1 profile adapter atomically rejects stale updates and duplicate creates', async () => {
  const db = database(), store = profileStore(db)
  const { PutObjectCommand, GetObjectCommand } = commands
  const first = await store.send(new PutObjectCommand({ Key: 'profiles/test.json', Body: '{}', IfNoneMatch: '*' }))
  await assert.rejects(store.send(new PutObjectCommand({ Key: 'profiles/test.json', Body: '{}', IfNoneMatch: '*' })), { name: 'PreconditionFailed' })
  await store.send(new PutObjectCommand({ Key: 'profiles/test.json', Body: '{"page":8}', IfMatch: first.ETag }))
  await assert.rejects(store.send(new PutObjectCommand({ Key: 'profiles/test.json', Body: '{"page":2}', IfMatch: first.ETag })), { name: 'PreconditionFailed' })
  assert.equal(await (await store.send(new GetObjectCommand({ Key: 'profiles/test.json' }))).Body.transformToString(), '{"page":8}')
  db.sql.close()
})

test('existing profile behavior works on D1 with account ownership and progress merging', async () => {
  const db = database()
  const a = profileAPI._test.ownerClient(profileStore(db), 'account-a')
  const b = profileAPI._test.ownerClient(profileStore(db), 'account-b')
  const created = await profileAPI._test.createProfile(a, commands, { name: 'Hero', pin: '1234', progress: { comic: { page: 8, updatedAt: '2026-11-16' } } })
  const id = JSON.parse(created.body).profileId
  assert.equal((await profileAPI._test.syncOwnedProfile(b, commands, id, {})).statusCode, 404)
  const synced = await profileAPI._test.syncOwnedProfile(a, commands, id, { progress: { comic: { page: 2, updatedAt: '2026-11-15' } } })
  assert.equal(JSON.parse(synced.body).progress.comic.page, 8)
  assert.equal(JSON.parse((await profileAPI._test.listProfiles(b, commands)).body).profiles.length, 0)
  assert.equal(JSON.parse((await profileAPI._test.listProfiles(a, commands)).body).profiles.length, 1)
  db.sql.close()
})

test('media tickets reject expiry, tampering and a different signing secret', async () => {
  const issued = await issueTicket('private-test-secret', 'account-a')
  assert.equal(await verifyTicket('private-test-secret', issued.token), true)
  assert.equal(await verifyTicket('wrong-secret', issued.token), false)
  assert.equal(await verifyTicket('private-test-secret', issued.token + 'x'), false)
  const expired = await issueTicket('private-test-secret', 'account-a', Date.now() - 1)
  assert.equal(await verifyTicket('private-test-secret', expired.token), false)
})

test('media routes cannot expose profile documents or escape asset prefixes', async () => {
  assert.equal(mediaKey('comics/Series/Issue%201.cbz'), 'comics/Series/Issue 1.cbz')
  for (const path of ['profiles/private.json', 'comics/%2e%2e/profiles/a', 'comics/a%5cb', 'generated/not-covers/a', 'comics/%']) assert.equal(mediaKey(path), null)
  const response = await worker.fetch(new Request('https://test.invalid/media/invalid/comics/book.cbz'), { MEDIA_SIGNING_SECRET: 'test' }, {})
  assert.equal(response.status, 401)
  const denied = await worker.fetch(new Request('https://test.invalid/profiles', { headers: { Origin: 'https://evil.invalid' } }), {}, {})
  assert.equal(denied.status, 403)
})
