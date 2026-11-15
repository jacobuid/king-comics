import { listAccounts, upsertAccount } from './auth.js'
import { replaceProfileProgress } from './progress.js'

export function importLegacyBrowserProfiles() {
  const profiles = JSON.parse(localStorage.getItem('king-comics.accounts.v1') ?? '{}')
  const progress = JSON.parse(localStorage.getItem('king-comics.progress.v1') ?? '{}')
  const existing = new Set(listAccounts().map(profile => profile.username))
  for (const profile of Object.values(profiles)) {
    if (!profile?.name || !profile.username) continue
    const username = `legacy:${profile.username}`
    if (existing.has(username)) continue
    upsertAccount(profile.name, {
      username, avatar: profile.avatar ?? '', theme: profile.theme ?? 'blue',
      synced: false, syncOptOut: true,
    })
    replaceProfileProgress(username, progress[profile.username] ?? {}, false)
  }
}
