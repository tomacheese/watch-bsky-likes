import fs from 'node:fs'

export interface Like {
  uri: string
  cid: string
  value: {
    $type: 'app.bsky.feed.like'
    subject: {
      cid: string
      uri: string
    }
    createdAt: string
  }
}

interface LikeResponse {
  records: Like[]
  cursor: string
}

interface ImagesEmbed {
  $type: 'app.bsky.embed.images'
  images: {
    alt: string
    aspectRatio: {
      height: number
      width: number
    }
    image: {
      $type: string
      ref: {
        $link: string
      }
      mimeType: string
      size: number
    }
  }[]
}

// Known embed types other than app.bsky.embed.images.
// Their internals (e.g. external.uri) are not read anywhere, so only the
// $type needed for discrimination is kept. Define each type in full when code
// that actually uses that embed is added.
interface NonImagesEmbed {
  $type:
    | 'app.bsky.embed.external'
    | 'app.bsky.embed.record'
    | 'app.bsky.embed.recordWithMedia'
    | 'app.bsky.embed.video'
}

type Embed = ImagesEmbed | NonImagesEmbed

export interface Post {
  uri: string
  cid: string
  author: {
    did: string
    handle: string
    displayName: string
    avatar: string
    associated?: {
      chat: {
        allowIncoming: string
      }
    }
    labels: {
      src: string
      uri: string
      cid: string
      val: string
      cts: string
    }[]
    createdAt: string
  }
  record: {
    $type: string
    createdAt: string
    embed?: Embed
    langs: string[]
    text: string
    facets?: {
      features: {
        $type: string
        tag?: string
        uri?: string
      }[]
      index: {
        byteEnd: number
        byteStart: number
      }
    }[]
    labels?: {
      $type: string
      values: {
        val: string
      }[]
    }
    reply?: {
      parent: {
        cid: string
        uri: string
      }
      root: {
        cid: string
        uri: string
      }
    }
  }
  embed?: {
    $type: string
    images: {
      thumb: string
      fullsize: string
      alt: string
      aspectRatio: {
        height: number
        width: number
      }
    }[]
  }
  replyCount: number
  repostCount: number
  likeCount: number
  quoteCount: number
  indexedAt: string
  labels: {
    src: string
    uri: string
    cid: string
    val: string
    cts: string
    ver?: number
  }[]
}

type ImagePost = Post & {
  record: Post['record'] & {
    embed: ImagesEmbed
  }
}

interface PostsResponse {
  posts: Post[]
}

class BlueskyPostCache {
  private static PATH = {
    POST_CACHE_PATH: process.env.POST_CACHE_PATH ?? 'data/post_cache/',
  }

  public static getPost(uri: string): Post | undefined {
    const filename = BlueskyPostCache.getCachePath(uri)
    if (!filename) {
      return
    }

    try {
      const data = fs.readFileSync(filename, 'utf8')
      return JSON.parse(data) as Post
    } catch {
      return undefined
    }
  }

  public static setPost(uri: string, post: Post) {
    const filename = BlueskyPostCache.getCachePath(uri)
    if (!filename) {
      return
    }

    const dir = filename.split('/').slice(0, -1).join('/')
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    fs.writeFileSync(filename, JSON.stringify(post))
  }

  private static getCachePath(uri: string) {
    // at://did:plc:ue7cgpjh53q4pnderbhfhmub/app.bsky.feed.post/3lavcbiwtus2o
    // => data/post_cache/ue7cgpjh53q4pnderbhfhmub/3lavcbiwtus2o.json
    const regex = /at:\/\/did:plc:(.+?)\/app\.bsky\.feed\.post\/(.+)/
    const match = regex.exec(uri)
    if (!match) {
      return
    }

    const actor = match[1]
    const cid = match[2]

    return `${BlueskyPostCache.PATH.POST_CACHE_PATH}/${actor}/${cid}.json`
  }
}

// Node fetch error.cause.code values treated as transient and retried
const TRANSIENT_CAUSE_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'EPIPE',
])

// HTTP statuses treated as transient and retried
const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503, 504])

// Maximum number of attempts, including the first one
const MAX_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 500

/**
 * Waits for the given number of milliseconds (used for retry backoff).
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Computes the retry delay (exponential backoff + jitter).
 * Random jitter is added to the exponential delay so that concurrent retries do not hit the API all at once.
 *
 * @param attempt Number of the attempt that just failed (1-indexed)
 */
function backoffDelayMs(attempt: number): number {
  const exponential = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)
  const jitter = Math.random() * RETRY_BASE_DELAY_MS
  return exponential + jitter
}

/**
 * Converts an HTTP 429 Retry-After header value to milliseconds.
 * Handles both the delay-seconds and HTTP-date formats, and returns undefined if the value cannot be parsed.
 *
 * @param value Retry-After header value
 */
function parseRetryAfterMs(value: string | null): number | undefined {
  if (value === null) return undefined
  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10) * 1000
  }
  const timestamp = Date.parse(trimmed)
  return Number.isNaN(timestamp)
    ? undefined
    : Math.max(0, timestamp - Date.now())
}

/**
 * Releases the unused response body before a retry.
 * A failure of the cancel itself must not take precedence over the original transient failure.
 *
 * @param response Response whose body should be released
 */
async function discardResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel()
  } catch {
    // best-effort cleanup
  }
}

/**
 * Wrapper around fetch for external APIs.
 * Transient network errors such as ETIMEDOUT and 429 / 5xx responses are retried a bounded number of times (backoff + jitter);
 * permanent errors such as 4xx are thrown immediately without retrying.
 * On failure, the thrown error names the operation and a sanitized endpoint (origin + pathname only, so secrets such as tokens that may appear in the query are never included).
 * For HTTP errors the status appears in the message; for network failures the original error is attached as `cause` and its code is included.
 *
 * @param operation Operation name used in error messages (e.g. getUserLikes)
 * @param url URL to call
 */
async function fetchExternal(operation: string, url: URL): Promise<Response> {
  const endpoint = `${url.origin}${url.pathname}`

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response
    try {
      res = await fetch(url.href)
    } catch (error) {
      const cause = error instanceof Error ? error.cause : undefined
      const causeCode =
        cause && typeof cause === 'object' && 'code' in cause
          ? String(cause.code)
          : undefined

      if (
        causeCode &&
        TRANSIENT_CAUSE_CODES.has(causeCode) &&
        attempt < MAX_ATTEMPTS
      ) {
        await sleep(backoffDelayMs(attempt))
        continue
      }

      throw new Error(
        `❌ Failed to fetch (${operation}): ${endpoint}${
          causeCode ? ` (cause: ${causeCode})` : ''
        }`,
        // Chain the original error as cause to preserve its stack trace
        { cause: error }
      )
    }

    if (!res.ok) {
      if (TRANSIENT_STATUS_CODES.has(res.status) && attempt < MAX_ATTEMPTS) {
        const retryDelay =
          res.status === 429
            ? (parseRetryAfterMs(res.headers.get('Retry-After')) ??
              backoffDelayMs(attempt))
            : backoffDelayMs(attempt)
        await discardResponseBody(res)
        await sleep(retryDelay)
        continue
      }

      throw new Error(
        `❌ Failed to fetch (${operation}): ${endpoint} returned ${res.status} ${res.statusText}`
      )
    }

    return res
  }

  // MAX_ATTEMPTS >= 1, so the loop above always returns or throws
  throw new Error(
    `❌ Failed to fetch (${operation}): ${endpoint} (unreachable)`
  )
}

export class Bluesky {
  public static async getUserLikes(actor: string): Promise<LikeResponse> {
    const baseUrl = 'https://bsky.social/xrpc/com.atproto.repo.listRecords'
    const url = new URL(baseUrl)
    url.search = new URLSearchParams({
      collection: 'app.bsky.feed.like',
      limit: '100',
      reverse: 'false',
      cursor: '',
      repo: actor,
    }).toString()
    const res = await fetchExternal('getUserLikes', url)
    return (await res.json()) as LikeResponse
  }

  public static async getPosts(uris: string[], useCache = true) {
    const posts: Post[] = []
    const uncachedUris: string[] = []

    for (const uri of uris) {
      let post: Post | undefined
      if (useCache) {
        post = BlueskyPostCache.getPost(uri)
      }

      if (!post) {
        uncachedUris.push(uri)
        continue
      }

      posts.push(post)
    }

    if (uncachedUris.length > 0) {
      const chunkedUris = uncachedUris.reduce<string[][]>((acc, uri, index) => {
        const chunkIndex = Math.floor(index / 20)
        acc[chunkIndex] ??= []

        acc[chunkIndex].push(uri)
        return acc
      }, [])

      for (const chunk of chunkedUris) {
        const response = await Bluesky.getPostsFromApi(chunk)
        posts.push(...response.posts)

        for (const post of response.posts) {
          BlueskyPostCache.setPost(post.uri, post)
        }
      }
    }

    return posts
  }

  private static async getPostsFromApi(uris: string[]): Promise<PostsResponse> {
    const baseUrl = 'https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts'
    const url = new URL(baseUrl)
    const params = new URLSearchParams()
    for (const uri of uris) {
      params.append('uris', uri)
    }

    url.search = params.toString()
    const res = await fetchExternal('getPostsFromApi', url)
    return (await res.json()) as PostsResponse
  }

  public static getPostUrl(uri: string) {
    const regex = /at:\/\/(.+)\/app\.bsky\.feed\.post\/(.+)/

    const match = regex.exec(uri)
    if (!match) {
      console.log('No match', uri)
      return
    }

    const actor = match[1]
    const cid = match[2]

    return `https://bsky.app/profile/${actor}/post/${cid}`
  }

  public static isImagePost(post: Post): post is ImagePost {
    const embed = post.record.embed
    return embed?.$type === 'app.bsky.embed.images' && embed.images.length > 0
  }
}
