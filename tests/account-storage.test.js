import assert from 'node:assert/strict'
import test from 'node:test'
import { setAuthOwner } from '../src/utils/kingAuth.js'
import { createLocalAccount, createSession, getCurrentUserSync, listAccounts } from '../src/utils/auth.js'
import { getProfileProgress, setComicBookmark } from '../src/utils/progress.js'
import { importLegacyBrowserProfiles } from '../src/utils/legacyProfiles.js'

test('account UUID scopes profiles, active reader and progress on shared browsers', async () => {
  const values = new Map()
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  }
  globalThis.window = new EventTarget()
  setAuthOwner('owner-a')
  createLocalAccount('Hero')
  createLocalAccount('Sidekick')
  await createSession('hero')
  setComicBookmark('hero', 'comic', true)
  setAuthOwner('owner-b')
  assert.deepEqual(listAccounts(), [])
  assert.equal(getCurrentUserSync(), null)
  assert.deepEqual(getProfileProgress('hero'), {})
  createLocalAccount('Hero')
  setAuthOwner('owner-a')
  assert.equal(listAccounts().length, 2)
  assert.equal(getCurrentUserSync().name, 'Hero')
  assert.equal(getProfileProgress('hero').comic.bookmarked, true)
  setAuthOwner(null)
  assert.deepEqual(listAccounts(), [])
  assert.equal(getCurrentUserSync(), null)

  values.set('king-comics.accounts.v1', JSON.stringify({ old: { name: 'Previous Hero', username: 'old' } }))
  values.set('king-comics.progress.v1', JSON.stringify({ old: { comic: { bookmarked: false } } }))
  setAuthOwner('owner-a')
  assert.equal(listAccounts().length, 2, 'legacy profiles require explicit import')
  importLegacyBrowserProfiles()
  assert.equal(listAccounts().length, 3)
  setComicBookmark('legacy:old', 'comic', true)
  importLegacyBrowserProfiles()
  assert.equal(getProfileProgress('legacy:old').comic.bookmarked, true, 'repeating import preserves new progress')
  setAuthOwner('owner-b')
  assert.equal(listAccounts().length, 1, 'copied legacy profiles belong to the chosen account')
  assert.ok(values.has('king-comics.accounts.v1'), 'original records remain intact')
  setAuthOwner(null)
})
