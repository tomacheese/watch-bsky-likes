import assert from 'node:assert/strict'
import { test, TestContext } from 'node:test'
import { Like, Post } from './bsky'
import { Notified } from './notified'
import { processLikes } from './process-likes'

const POST_URI = 'at://did:plc:abc/app.bsky.feed.post/xyz'
const POST_URL = 'https://bsky.app/profile/did:plc:abc/post/xyz'

/**
 * node:test の登録 Promise を明示的に処理し、テスト失敗をそのまま再送出する。
 *
 * @param name テスト名
 * @param function_ テスト本体
 */
function registerTest(
  name: string,
  function_: (context: TestContext) => Promise<void>
): void {
  test(name, function_).catch((error: unknown) => {
    throw error
  })
}

/**
 * いいねレコードを生成する。
 */
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
 * 投稿を生成する。processLikes が参照する uri と record.embed のみを設定する。
 *
 * @param embedType embed の $type
 */
function post(embedType: string): Post {
  const embed =
    embedType === 'app.bsky.embed.images'
      ? { $type: embedType, images: [{}] }
      : { $type: embedType }
  return { uri: POST_URI, record: { embed } } as unknown as Post
}

registerTest(
  '画像投稿の送信が失敗した場合は通知済みとして記録しない',
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
  '画像投稿の送信が成功した後に通知済みとして記録する',
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

registerTest('初回実行では送信せずに通知済みとして記録する', async (t) => {
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
})

registerTest('画像以外の投稿は送信せずに通知済みとして記録する', async (t) => {
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

  await processLikes([like()], [post('app.bsky.embed.external')], sender, false)

  assert.deepEqual(calls, [`add:${POST_URI}`])
})
