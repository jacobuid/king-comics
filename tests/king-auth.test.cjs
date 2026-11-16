const assert = require('node:assert/strict')
const test = require('node:test')
const { _test, handler } = require('../infrastructure/sync-api/index.cjs')

test('requires a trusted origin and bearer credential before accessing storage', async () => {
  let called = false
  const send = async () => { called = true; throw Error('Should not call') }
  assert.equal(await _test.authenticatedOwner({ headers: {} }, send), null)
  assert.equal(await _test.authenticatedOwner({ headers: {
    origin: 'https://untrusted.example', authorization: 'Bearer secret',
  } }, send), null)
  assert.equal(called, false)
  assert.equal((await handler({ headers: {}, rawPath: '/profiles' })).statusCode, 401)
})

test('verifies centrally and fails closed for revoked sessions and service failures', async () => {
  const event = { headers: { origin: 'https://jacobuid.github.io', authorization: 'Bearer secret' } }
  const owner = await _test.authenticatedOwner(event, async (url, options) => {
    assert.equal(url, 'https://kingauth.app/api/browser/get-session')
    assert.equal(options.headers.Origin, event.headers.origin)
    assert.equal(options.headers.Authorization, event.headers.authorization)
    assert.equal(options.redirect, 'error')
    return { ok: true, json: async () => ({ user: { id: 'owner-a' } }) }
  })
  assert.equal(owner, 'owner-a')
  assert.equal(await _test.authenticatedOwner(event, async () => ({ status: 401 })), null)
  await assert.rejects(_test.authenticatedOwner(event, async () => ({ status: 503 })))
  assert.equal(await _test.authenticatedOwner(event, async () => ({ ok: true, json: async () => ({ user: { id: '../escape' } }) })), null)
})

test('each account owns multiple profiles and cannot read, list, modify, rename or delete another account profiles', async () => {
  const objects = new Map()
  class GetObjectCommand { constructor(input) { this.input = input } }
  class PutObjectCommand { constructor(input) { this.input = input } }
  class DeleteObjectCommand { constructor(input) { this.input = input } }
  class ListObjectsV2Command { constructor(input) { this.input = input } }
  const commands = { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command }
  const storage = { async send(command) {
    const { Key, Body, Prefix, IfNoneMatch } = command.input
    if (command instanceof PutObjectCommand) {
      if (IfNoneMatch && objects.has(Key)) throw Object.assign(Error(), { name: 'PreconditionFailed' })
      objects.set(Key, Body)
      return {}
    }
    if (command instanceof GetObjectCommand) {
      if (!objects.has(Key)) throw Object.assign(Error(), { name: 'NoSuchKey' })
      return { ETag: 'etag', Body: { transformToString: async () => objects.get(Key) } }
    }
    if (command instanceof DeleteObjectCommand) { objects.delete(Key); return {} }
    return { Contents: [...objects.keys()].filter(key => key.startsWith(Prefix)).map(Key => ({ Key })) }
  } }
  const a = _test.ownerClient(storage, 'owner-a')
  const b = _test.ownerClient(storage, 'owner-b')
  const first = { name: 'Hero', pin: '1234', progress: { comic: { page: 8 } } }
  assert.equal((await _test.createProfile(a, commands, first)).statusCode, 201)
  assert.equal((await _test.createProfile(a, commands, { name: 'Sidekick', pin: '5678' })).statusCode, 201)
  const id = _test.profileId('hero', '1234')
  assert.equal((await _test.syncOwnedProfile(b, commands, id, { progress: {} })).statusCode, 404)
  assert.equal((await _test.syncOwnedProfile(a, commands, '../escape', {})).statusCode, 400)
  const synced = await _test.syncOwnedProfile(a, commands, id, {
    progress: { anotherComic: { page: 3, updatedAt: '2026-11-16T00:00:00.000Z' } },
    avatar: 'sonic-1.jpg', theme: 'green',
  })
  assert.equal(synced.statusCode, 200, 'the owner can sync without a profile PIN')
  assert.equal(JSON.parse(synced.body).progress.comic.page, 8, 'sync keeps existing remote progress')
  assert.equal(JSON.parse(synced.body).progress.anotherComic.page, 3)
  assert.equal(JSON.parse(synced.body).theme, 'green')
  assert.equal((await _test.syncOwnedProfile(a, commands, id, { avatar: '../bad' })).statusCode, 400)
  assert.equal((await _test.loadProfile(b, commands, first)).statusCode, 404)
  assert.equal((await _test.updateProfile(b, commands, first)).statusCode, 404)
  assert.equal((await _test.renameProfile(b, commands, { currentName: 'Hero', name: 'Villain', pin: '1234' })).statusCode, 404)
  assert.equal((await _test.deleteProfile(b, commands, id, '1234')).statusCode, 404)
  assert.equal(JSON.parse((await _test.listProfiles(b, commands)).body).profiles.length, 0)
  assert.equal(JSON.parse((await _test.listProfiles(a, commands)).body).profiles.length, 2)
  assert.equal((await _test.createProfile(b, commands, first)).statusCode, 201)
  assert.equal((await _test.deleteProfile(b, commands, id, '1234')).statusCode, 200)
  assert.equal((await _test.loadProfile(a, commands, first)).statusCode, 200)
  await _test.renameProfile(a, commands, { currentName: 'Hero', name: 'New Hero', pin: '1234' })
  const moved = await _test.syncOwnedProfile(a, commands, id, {})
  assert.equal(JSON.parse(moved.body).code, 'PROFILE_MOVED')
  assert.equal((await _test.syncOwnedProfile(a, commands, JSON.parse(moved.body).movedToProfileId, {})).statusCode, 200)
})
