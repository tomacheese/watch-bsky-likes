import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rejected-post-'))
process.env.POST_CACHE_PATH = path.join(dir, 'cache')
const notifiedFile = path.join(dir, 'notified.json')
process.env.NOTIFIED_FILE = notifiedFile

const uri = 'at://did:plc:abc/app.bsky.feed.post/retry'
const validUri = 'at://did:plc:abc/app.bsky.feed.post/valid'
const absentUri = 'at://did:plc:abc/app.bsky.feed.post/absent'
const like = (subject: string) => ({
  uri: `${subject}/like`,
  cid: 'cid',
  value: {
    $type: 'app.bsky.feed.like' as const,
    subject: { cid: 'cid', uri: subject },
    createdAt: '2026-01-01T00:00:00.000Z',
  },
})

test('retries rejected details while processing valid and absent posts', async (t) => {
  const { Bluesky } = await import('./bsky')
  const { Notified } = await import('./notified')
  const { processLikes } = await import('./process-likes')
  fs.writeFileSync(notifiedFile, '[]')
  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })
  t.mock.method(console, 'warn', () => undefined)
  let run = 0
  t.mock.method(globalThis, 'fetch', () => {
    run++
    return Promise.resolve(
      Response.json({
        posts:
          run === 1
            ? [
                { uri, record: { embed: { $type: 'app.bsky.embed.images' } } },
                { uri: validUri, record: {} },
              ]
            : [
                {
                  uri,
                  record: {
                    embed: { $type: 'app.bsky.embed.images', images: [{}] },
                  },
                },
              ],
      })
    )
  })
  const sent: string[] = []
  const sender = {
    sendMessage: (message: string) => {
      sent.push(message)
      return Promise.resolve()
    },
  }
  const records = [like(uri), like(validUri), like(absentUri)]
  for (let i = 0; i < 2; i++) {
    const pending = records.filter(
      (record) => !Notified.isNotified(record.value.subject.uri)
    )
    const { posts, unresolvedUris } = await Bluesky.getPosts(
      pending.map((record) => record.value.subject.uri)
    )
    await processLikes(pending, posts, sender, false, unresolvedUris)
    if (i !== 0) continue
    assert.equal(Notified.isNotified(uri), false)
    assert.equal(Notified.isNotified(validUri), true)
    assert.equal(Notified.isNotified(absentUri), true)
  }
  assert.deepEqual(sent, ['https://bsky.app/profile/did:plc:abc/post/retry'])
  assert.equal(Notified.isNotified(uri), true)
  assert.equal(run, 2)
}).catch((error: unknown) => {
  throw error
})

test('unidentified malformed entries leave missing details unresolved', async (t) => {
  const { Bluesky } = await import('./bsky')
  t.mock.method(console, 'warn', () => undefined)
  t.mock.method(globalThis, 'fetch', () =>
    Promise.resolve(Response.json({ posts: [null] }))
  )
  const result = await Bluesky.getPosts([uri, absentUri], false)
  assert.deepEqual(result.unresolvedUris, new Set([uri, absentUri]))
}).catch((error: unknown) => {
  throw error
})
