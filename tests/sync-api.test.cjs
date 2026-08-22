const assert = require('node:assert/strict')
const test = require('node:test')
const { _test } = require('../infrastructure/sync-api/index.cjs')

test('normalizes profile names consistently across devices', () => {
  assert.equal(_test.normalizeName('  JACOB  '), 'jacob')
  assert.equal(_test.normalizeName('Ａｌｅｘ'), 'alex')
  assert.equal(_test.profileKey('jacob', '1234'), _test.profileKey(_test.normalizeName(' JACOB '), '1234'))
  assert.notEqual(_test.profileKey('superman', '1234'), _test.profileKey('superman', '5678'))
})

test('accepts only four digit PINs', () => {
  assert.equal(_test.validPin('0427'), true)
  assert.equal(_test.validPin('427'), false)
  assert.equal(_test.validPin('12a4'), false)
  assert.equal(_test.pinHash('superman', '1234'), _test.pinHash('superman', '1234'))
  assert.notEqual(_test.pinHash('superman', '1234'), _test.pinHash('superman', '5678'))
})

test('keeps the newest per-comic change when two devices sync', () => {
  const saved = {
    comicA: { page: 3, updatedAt: '2026-08-20T12:00:00.000Z' },
    comicB: { bookmarked: true, updatedAt: '2026-08-22T12:00:00.000Z' },
  }
  const device = {
    comicA: { page: 8, updatedAt: '2026-08-22T12:00:00.000Z' },
    comicB: { bookmarked: false, updatedAt: '2026-08-21T12:00:00.000Z' },
  }

  assert.deepEqual(_test.mergeProgress(saved, device), {
    comicA: device.comicA,
    comicB: saved.comicB,
  })
})
