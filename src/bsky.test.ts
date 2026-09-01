import assert from 'node:assert/strict'
import { test, TestContext } from 'node:test'
import { Bluesky } from './bsky'

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
 * ETIMEDOUT 相当の transient なネットワークエラーを再現する。
 */
function transientNetworkError(): Error {
  return new Error('fetch failed', {
    cause: Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }),
  })
}

/**
 * 空の likes API 正常応答を生成する。
 */
function okLikesResponse(): Response {
  return Response.json({ records: [], cursor: '' })
}

registerTest('ETIMEDOUT が一度だけ発生しても retry で成功する', async (t) => {
  let calls = 0
  t.mock.method(Math, 'random', () => 0)
  t.mock.method(globalThis, 'fetch', () => {
    calls += 1
    return calls === 1
      ? Promise.reject(transientNetworkError())
      : Promise.resolve(okLikesResponse())
  })

  const result = await Bluesky.getUserLikes('did:plc:example')
  assert.deepEqual(result, { records: [], cursor: '' })
  assert.equal(calls, 2)
})

registerTest(
  'ETIMEDOUT が retry 上限を超えて続く場合は最終的に throw する',
  async (t) => {
    let calls = 0
    t.mock.method(Math, 'random', () => 0)
    t.mock.method(globalThis, 'fetch', () => {
      calls += 1
      return Promise.reject(transientNetworkError())
    })

    await assert.rejects(
      Bluesky.getUserLikes('did:plc:example'),
      /Failed to fetch \(getUserLikes\).*ETIMEDOUT/
    )
    assert.equal(calls, 3)
  }
)

registerTest('恒久的な 404 応答は retry せず即座に throw する', async (t) => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', () => {
    calls += 1
    return Promise.resolve(
      new Response('not found', { status: 404, statusText: 'Not Found' })
    )
  })

  await assert.rejects(Bluesky.getUserLikes('did:plc:example'), /returned 404/)
  assert.equal(calls, 1)
})

registerTest(
  'cause のない TypeError は retry せず即座に throw する',
  async (t) => {
    let calls = 0
    t.mock.method(globalThis, 'fetch', () => {
      calls += 1
      return Promise.reject(new TypeError('boom'))
    })

    await assert.rejects(
      Bluesky.getUserLikes('did:plc:example'),
      /Failed to fetch \(getUserLikes\)/
    )
    assert.equal(calls, 1)
  }
)

registerTest('503 応答は body を解放してから retry し成功する', async (t) => {
  let calls = 0
  let cancelled = false
  t.mock.method(Math, 'random', () => 0)
  t.mock.method(globalThis, 'fetch', () => {
    calls += 1
    if (calls === 1) {
      return Promise.resolve(
        new Response(
          new ReadableStream({
            cancel() {
              cancelled = true
            },
          }),
          { status: 503, statusText: 'Service Unavailable' }
        )
      )
    }
    return Promise.resolve(okLikesResponse())
  })

  const result = await Bluesky.getUserLikes('did:plc:example')
  assert.deepEqual(result, { records: [], cursor: '' })
  assert.equal(calls, 2)
  assert.equal(cancelled, true)
})

registerTest(
  '503 が retry 上限を超えて続く場合は最終的に throw する',
  async (t) => {
    let calls = 0
    t.mock.method(Math, 'random', () => 0)
    t.mock.method(globalThis, 'fetch', () => {
      calls += 1
      return Promise.resolve(
        new Response('unavailable', {
          status: 503,
          statusText: 'Service Unavailable',
        })
      )
    })

    await assert.rejects(
      Bluesky.getUserLikes('did:plc:example'),
      /returned 503/
    )
    assert.equal(calls, 3)
  }
)

registerTest('429 応答は Retry-After を尊重して retry する', async (t) => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', () => {
    calls += 1
    if (calls === 1) {
      return Promise.resolve(
        new Response('rate limited', {
          status: 429,
          headers: { 'Retry-After': '0' },
        })
      )
    }
    return Promise.resolve(okLikesResponse())
  })

  const result = await Bluesky.getUserLikes('did:plc:example')
  assert.deepEqual(result, { records: [], cursor: '' })
  assert.equal(calls, 2)
})
