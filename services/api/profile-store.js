class Command { constructor(input) { this.input = input } }
export class GetObjectCommand extends Command {}
export class PutObjectCommand extends Command {}
export class DeleteObjectCommand extends Command {}
export class ListObjectsV2Command extends Command {}
export const commands = { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command }

function failure(name, status) { return Object.assign(new Error(name), { name, $metadata: { httpStatusCode: status } }) }
export function profileStore(db) {
  return { async send(command) {
    const { Key, Body, IfMatch, IfNoneMatch, Prefix, ContinuationToken } = command.input
    if (command instanceof GetObjectCommand) {
      const record = await db.prepare('SELECT value, etag FROM profile_objects WHERE key = ?').bind(Key).first()
      if (!record) throw failure('NoSuchKey', 404)
      return { ETag: record.etag, Body: { transformToString: async () => record.value } }
    }
    if (command instanceof PutObjectCommand) {
      const etag = crypto.randomUUID()
      let result
      if (IfNoneMatch === '*') {
        result = await db.prepare('INSERT INTO profile_objects (key, value, etag) VALUES (?, ?, ?) ON CONFLICT(key) DO NOTHING').bind(Key, Body, etag).run()
      } else if (IfMatch) {
        result = await db.prepare('UPDATE profile_objects SET value = ?, etag = ? WHERE key = ? AND etag = ?').bind(Body, etag, Key, IfMatch).run()
      } else {
        result = await db.prepare('INSERT INTO profile_objects (key, value, etag) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, etag = excluded.etag').bind(Key, Body, etag).run()
      }
      if (result.meta.changes !== 1) throw failure('PreconditionFailed', 412)
      return { ETag: etag }
    }
    if (command instanceof DeleteObjectCommand) {
      await db.prepare('DELETE FROM profile_objects WHERE key = ?').bind(Key).run()
      return {}
    }
    if (command instanceof ListObjectsV2Command) {
      const { results } = await db.prepare('SELECT key FROM profile_objects WHERE substr(key, 1, ?) = ? AND key > ? ORDER BY key LIMIT 1001').bind(Prefix.length, Prefix, ContinuationToken ?? '').all()
      return {
        Contents: results.slice(0, 1000).map(row => ({ Key: row.key })),
        IsTruncated: results.length > 1000,
        NextContinuationToken: results.length > 1000 ? results[999].key : undefined,
      }
    }
    throw new Error('Unsupported profile storage operation')
  } }
}
