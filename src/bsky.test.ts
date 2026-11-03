import assert from 'node:assert/strict'
import { test, TestContext } from 'node:test'
import { Bluesky } from './bsky'

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

/**
 * Reproduces a transient network error equivalent to ETIMEDOUT.
 */
function transientNetworkError(): Error {
  return new Error('fetch failed', {
    cause: Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }),
  })
}

/**
 * Creates a successful, empty likes API response.
 */
function okLikesResponse(): Response {
  return Response.json({ records: [], cursor: '' })
}

registerTest('succeeds on retry when ETIMEDOUT occurs only once', async (t) => {
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
  'finally throws when ETIMEDOUT persists beyond the retry limit',
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

registerTest(
  'throws immediately on a permanent 404 response without retrying',
  async (t) => {
    let calls = 0
    t.mock.method(globalThis, 'fetch', () => {
      calls += 1
      return Promise.resolve(
        new Response('not found', { status: 404, statusText: 'Not Found' })
      )
    })

    await assert.rejects(
      Bluesky.getUserLikes('did:plc:example'),
      /returned 404/
    )
    assert.equal(calls, 1)
  }
)

registerTest(
  'throws immediately on a TypeError without cause, without retrying',
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

registerTest(
  'releases the body of a 503 response, then retries and succeeds',
  async (t) => {
    let calls = 0
    let cancelled = false
    t.mock.method(Math, 'random', () => 0)
    t.mock.method(globalThis, 'fetch', () => {
      calls += 1
      return Promise.resolve(
        calls === 1
          ? new Response(
              new ReadableStream({
                cancel() {
                  cancelled = true
                },
              }),
              { status: 503, statusText: 'Service Unavailable' }
            )
          : okLikesResponse()
      )
    })

    const result = await Bluesky.getUserLikes('did:plc:example')
    assert.deepEqual(result, { records: [], cursor: '' })
    assert.equal(calls, 2)
    assert.equal(cancelled, true)
  }
)

registerTest(
  'finally throws when 503 persists beyond the retry limit',
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

registerTest('retries a 429 response honoring Retry-After', async (t) => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', () => {
    calls += 1
    return Promise.resolve(
      calls === 1
        ? new Response('rate limited', {
            status: 429,
            headers: { 'Retry-After': '0' },
          })
        : okLikesResponse()
    )
  })

  const result = await Bluesky.getUserLikes('did:plc:example')
  assert.deepEqual(result, { records: [], cursor: '' })
  assert.equal(calls, 2)
})
