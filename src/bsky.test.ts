import assert from 'node:assert/strict'
import { test, TestContext } from 'node:test'
import { Bluesky, Post } from './bsky'

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

registerTest('recognizes only images attached to the post', () => {
  const images = { $type: 'app.bsky.embed.images', images: [{}] }
  const cases: [unknown, boolean][] = [
    [images, true],
    [{ ...images, images: [] }, false],
    [{ $type: 'app.bsky.embed.images' }, false],
    [{ $type: 'app.bsky.embed.recordWithMedia', media: images }, true],
    [
      {
        $type: 'app.bsky.embed.recordWithMedia',
        media: { ...images, images: [] },
      },
      false,
    ],
    [
      {
        $type: 'app.bsky.embed.recordWithMedia',
        media: { $type: 'app.bsky.embed.images' },
      },
      false,
    ],
    [{ $type: 'app.bsky.embed.recordWithMedia' }, false],
    [{ $type: 'app.bsky.embed.recordWithMedia', media: null }, false],
    [
      {
        $type: 'app.bsky.embed.recordWithMedia',
        media: { $type: 'app.bsky.embed.external' },
      },
      false,
    ],
    [
      {
        $type: 'app.bsky.embed.recordWithMedia',
        media: { $type: 'app.bsky.embed.video' },
      },
      false,
    ],
    [{ $type: 'app.bsky.embed.record', record: { embed: images } }, false],
    [{ $type: 'app.bsky.embed.external' }, false],
    [{ $type: 'app.bsky.embed.video' }, false],
    [undefined, false],
  ]
  for (const [embed, expected] of cases) {
    const post = { record: { embed } } as Post
    assert.equal(Bluesky.isImagePost(post), expected, JSON.stringify(embed))
  }
  return Promise.resolve()
})

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

registerTest(
  'times out stalled headers and retries with an abort signal',
  async (t) => {
    const originalSetTimeout = setTimeout
    t.mock.method(globalThis, 'setTimeout', ((
      callback: () => void,
      delay?: number
    ) =>
      originalSetTimeout(
        callback,
        delay === 10_000 ? 10 : 0
      )) as typeof setTimeout)
    const signals: AbortSignal[] = []
    t.mock.method(
      globalThis,
      'fetch',
      (_input: string | URL | Request, init?: RequestInit) => {
        assert.ok(init?.signal)
        signals.push(init.signal)
        return new Promise<Response>(() => {
          /* deliberately stalled */
        })
      }
    )

    await assert.rejects(
      Bluesky.getUserLikes('private-actor'),
      (error: Error) => {
        assert.match(
          error.message,
          /Failed to fetch \(getUserLikes\).*ETIMEDOUT/
        )
        assert.doesNotMatch(error.message, /private-actor/)
        return true
      }
    )
    assert.equal(signals.length, 3)
    assert.ok(signals.every((signal) => signal.aborted))
  }
)

registerTest(
  'times out an incomplete body and retries successfully',
  async (t) => {
    const originalSetTimeout = setTimeout
    t.mock.method(globalThis, 'setTimeout', ((
      callback: () => void,
      delay?: number
    ) =>
      originalSetTimeout(
        callback,
        delay === 10_000 ? 10 : 0
      )) as typeof setTimeout)
    let calls = 0
    let signal: AbortSignal | undefined
    t.mock.method(
      globalThis,
      'fetch',
      (_input: string | URL | Request, init?: RequestInit) => {
        calls++
        if (calls > 1) return Promise.resolve(okLikesResponse())
        assert.ok(init?.signal)
        signal = init.signal
        return Promise.resolve(
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode('{"records":'))
              },
            })
          )
        )
      }
    )

    assert.deepEqual(await Bluesky.getUserLikes('example'), {
      records: [],
      cursor: '',
    })
    assert.equal(calls, 2)
    assert.equal(signal?.aborted, true)
  }
)

registerTest(
  'caps Retry-After and does not wait for body cancellation',
  async (t) => {
    const originalSetTimeout = setTimeout
    const delays: number[] = []
    t.mock.method(globalThis, 'setTimeout', ((
      callback: () => void,
      delay?: number
    ) => {
      delays.push(delay ?? 0)
      return originalSetTimeout(callback, delay === 10_000 ? delay : 0)
    }) as typeof setTimeout)
    let calls = 0
    t.mock.method(globalThis, 'fetch', () => {
      calls++
      return Promise.resolve(
        calls === 1
          ? new Response(
              new ReadableStream({
                cancel: () =>
                  new Promise<void>(() => {
                    /* deliberately stalled */
                  }),
              }),
              {
                status: 429,
                headers: { 'Retry-After': '999999999999999999999999' },
              }
            )
          : okLikesResponse()
      )
    })

    assert.deepEqual(await Bluesky.getUserLikes('example'), {
      records: [],
      cursor: '',
    })
    assert.equal(calls, 2)
    assert.ok(delays.includes(5000))
  }
)
