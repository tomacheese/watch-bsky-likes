import assert from 'node:assert/strict'
import { test, TestContext } from 'node:test'
import { Like, Post } from './bsky'
import { Notified } from './notified'
import { processLikes } from './process-likes'

const POST_URI = 'at://did:plc:abc/app.bsky.feed.post/xyz'
const POST_URL = 'https://bsky.app/profile/did:plc:abc/post/xyz'

/**
 * Explicitly handles the promise returned by node:test registration and rethrows test failures as-is.
 */
function registerTest(
  name: string,
  function_: (context: TestContext) => Promise<void>
): void {
  test(name, function_).catch((error: unknown) => {
    throw error
  })
}

function like(): Like {
  return {
    uri: 'at://did:plc:me/app.bsky.feed.like/1',
    cid: 'cid',
    value: {
      $type: 'app.bsky.feed.like',
      subject: { cid: 'cid', uri: POST_URI },
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  }
}

/**
 * Creates a post. Only uri and record.embed, which processLikes reads, are set.
 */
function post(embedType: string): Post {
  const embed =
    embedType === 'app.bsky.embed.images'
      ? { $type: embedType, images: [{}] }
      : { $type: embedType }
  return { uri: POST_URI, record: { embed } } as unknown as Post
}

registerTest(
  'does not record an image post as notified when sending fails',
  async (t) => {
    const added: string[] = []
    t.mock.method(Notified, 'addNotified', (uri: string) => {
      added.push(uri)
    })
    const sender = {
      sendMessage: () => Promise.reject(new Error('send failed')),
    }

    await assert.rejects(
      processLikes([like()], [post('app.bsky.embed.images')], sender, false),
      { message: 'send failed' }
    )
    assert.deepEqual(added, [])
  }
)

registerTest(
  'records an image post as notified after sending succeeds',
  async (t) => {
    const calls: string[] = []
    t.mock.method(Notified, 'addNotified', (uri: string) => {
      calls.push(`add:${uri}`)
    })
    const sender = {
      sendMessage: (message: string) => {
        calls.push(`send:${message}`)
        return Promise.resolve('id')
      },
    }

    await processLikes([like()], [post('app.bsky.embed.images')], sender, false)

    assert.deepEqual(calls, [`send:${POST_URL}`, `add:${POST_URI}`])
  }
)

registerTest(
  'records posts as notified without sending on the first run',
  async (t) => {
    const calls: string[] = []
    t.mock.method(Notified, 'addNotified', (uri: string) => {
      calls.push(`add:${uri}`)
    })
    const sender = {
      sendMessage: (message: string) => {
        calls.push(`send:${message}`)
        return Promise.resolve('id')
      },
    }

    await processLikes([like()], [post('app.bsky.embed.images')], sender, true)

    assert.deepEqual(calls, [`add:${POST_URI}`])
  }
)

registerTest(
  'records non-image posts as notified without sending',
  async (t) => {
    const calls: string[] = []
    t.mock.method(Notified, 'addNotified', (uri: string) => {
      calls.push(`add:${uri}`)
    })
    const sender = {
      sendMessage: (message: string) => {
        calls.push(`send:${message}`)
        return Promise.resolve('id')
      },
    }

    await processLikes(
      [like()],
      [post('app.bsky.embed.external')],
      sender,
      false
    )

    assert.deepEqual(calls, [`add:${POST_URI}`])
  }
)
