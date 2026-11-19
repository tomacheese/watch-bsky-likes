import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { before, test, TestContext } from 'node:test'
import type { Bluesky as BlueskyClass } from './bsky'

// BlueskyPostCache reads POST_CACHE_PATH once at class initialization, so the
// env var must be set before ./bsky is imported (hence the dynamic import).
const CACHE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bsky-cache-'))
process.env.POST_CACHE_PATH = CACHE_DIR
let Bluesky: typeof BlueskyClass

before(async () => {
  const module = await import('./bsky')
  Bluesky = module.Bluesky
})

const ACTOR = 'abc'
const URI = `at://did:plc:${ACTOR}/app.bsky.feed.post/xyz`
const URI_BAD = `at://did:plc:${ACTOR}/app.bsky.feed.post/bad`
const cacheFile = (id: string) => path.join(CACHE_DIR, ACTOR, `${id}.json`)

/**
 * Explicitly handles the promise returned by node:test registration and rethrows test failures as-is.
 */
function registerTest(
  name: string,
  function_: (context: TestContext) => Promise<void> | void
): void {
  test(name, function_).catch((error: unknown) => {
    throw error
  })
}

function validPost(uri = URI, embed?: unknown) {
  return { uri, record: embed === undefined ? {} : { embed } }
}

const IMAGES = { $type: 'app.bsky.embed.images', images: [{}] }

registerTest('isImagePost never throws on malformed input', () => {
  const malformed: unknown[] = [
    undefined,
    null,
    {},
    { uri: URI },
    { uri: URI, record: null },
    validPost(URI, { $type: 'app.bsky.embed.images' }),
    validPost(URI, { $type: 'app.bsky.embed.images', images: null }),
  ]
  for (const value of malformed) {
    assert.equal(Bluesky.isImagePost(value), false)
  }
  assert.equal(Bluesky.isImagePost(validPost(URI, IMAGES)), true)
})

registerTest('isPost accepts valid posts and rejects malformed ones', () => {
  assert.equal(Bluesky.isPost(validPost()), true)
  assert.equal(Bluesky.isPost(validPost(URI, IMAGES)), true)
  assert.equal(
    Bluesky.isPost(validPost(URI, { $type: 'app.bsky.embed.video' })),
    true
  )
  const malformed: unknown[] = [
    undefined,
    null,
    'text',
    { uri: 1, record: {} },
    { uri: URI, record: null },
    validPost(URI, 'not-an-object'),
    validPost(URI, { $type: 'app.bsky.embed.images' }),
    validPost(URI, { $type: 'app.bsky.embed.images', images: null }),
  ]
  for (const value of malformed) {
    assert.equal(Bluesky.isPost(value), false)
  }
})

registerTest('re-fetches and overwrites an invalid cache entry', async (t) => {
  fs.mkdirSync(path.join(CACHE_DIR, ACTOR), { recursive: true })
  fs.writeFileSync(
    cacheFile('xyz'),
    JSON.stringify({ uri: URI, record: { embed: { $type: IMAGES.$type } } })
  )
  let calls = 0
  t.mock.method(globalThis, 'fetch', () => {
    calls += 1
    return Promise.resolve(Response.json({ posts: [validPost(URI, IMAGES)] }))
  })

  const posts = await Bluesky.getPosts([URI])
  assert.deepEqual(posts, [validPost(URI, IMAGES)])
  assert.equal(calls, 1)
  assert.deepEqual(
    JSON.parse(fs.readFileSync(cacheFile('xyz'), 'utf8')),
    validPost(URI, IMAGES)
  )
})

registerTest('drops and does not cache a malformed API entry', async (t) => {
  const warn = t.mock.method(console, 'warn', () => undefined)
  t.mock.method(globalThis, 'fetch', () =>
    Promise.resolve(
      Response.json({
        posts: [
          validPost(URI_BAD, { $type: IMAGES.$type }),
          null,
          validPost('at://did:plc:abc/app.bsky.feed.post/ok'),
        ],
      })
    )
  )

  const posts = await Bluesky.getPosts([URI_BAD], false)
  assert.deepEqual(posts, [validPost('at://did:plc:abc/app.bsky.feed.post/ok')])
  assert.equal(fs.existsSync(cacheFile('bad')), false)
  assert.equal(warn.mock.callCount(), 2)
  assert.deepEqual(warn.mock.calls[0].arguments, [
    '⚠️ Skip malformed post in getPostsFromApi',
    URI_BAD,
  ])
})

registerTest('throws when the API body has no posts array', async (t) => {
  for (const body of [{ posts: null }, null]) {
    t.mock.method(globalThis, 'fetch', () =>
      Promise.resolve(Response.json(body))
    )
    await assert.rejects(
      Bluesky.getPosts([URI], false),
      new Error('❌ Invalid response (getPostsFromApi): posts is not an array')
    )
  }
})

registerTest('cleanup', () => {
  fs.rmSync(CACHE_DIR, { recursive: true, force: true })
})
