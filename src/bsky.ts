import fs from 'node:fs'

interface Like {
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

// app.bsky.embed.images: 画像埋め込み
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

// app.bsky.embed.images 以外の既知の embed 種別。
// これらの内部構造（external.uri 等）は現状どのコードからも参照されていないため、
// 判別に必要な $type のみを型に残す。実際にその embed の中身を扱う実装が
// 追加されたタイミングで、該当の型を個別に定義する。
interface NonImagesEmbed {
  $type:
    | 'app.bsky.embed.external'
    | 'app.bsky.embed.record'
    | 'app.bsky.embed.recordWithMedia'
    | 'app.bsky.embed.video'
}

type Embed = ImagesEmbed | NonImagesEmbed

interface Post {
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

// 画像付きの投稿であることが保証される型
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

// 一時的な障害とみなして retry する Node fetch の error.cause.code
const TRANSIENT_CAUSE_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'EPIPE',
])

// 一時的な障害とみなして retry する HTTP status（429: rate limit, 5xx: サーバー側の一時的な問題）
const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503, 504])

// 初回 + retry を含めた最大試行回数
const MAX_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 500

/**
 * 指定ミリ秒だけ待機する（retry の backoff 用）。
 *
 * @param ms 待機時間（ミリ秒）
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * retry 間隔を算出する（exponential backoff + jitter）。
 * 同時多発的な retry が API に一斉に再送されるのを避けるため、指数的な待機時間にランダムな揺らぎを加える。
 *
 * @param attempt 何回目の試行後か（1-indexed）
 */
function backoffDelayMs(attempt: number): number {
  const exponential = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)
  const jitter = Math.random() * RETRY_BASE_DELAY_MS
  return exponential + jitter
}

/**
 * HTTP 429 の Retry-After をミリ秒へ変換する。
 * 秒数形式と HTTP-date 形式を扱い、解釈できない場合は undefined を返す。
 *
 * @param value Retry-After ヘッダー値
 */
function parseRetryAfterMs(value: string | null): number | undefined {
  if (value === null) return undefined
  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10) * 1000
  }
  const timestamp = Date.parse(trimmed)
  if (Number.isNaN(timestamp)) return undefined
  return Math.max(0, timestamp - Date.now())
}

/**
 * retry 前に不要なレスポンスボディを解放する。
 * cancel 自体の失敗は元の一時障害より優先しない。
 *
 * @param response 解放対象レスポンス
 */
async function discardResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel()
  } catch {
    // best-effort cleanup
  }
}

/**
 * 外部 API への fetch を実行するラッパー。
 * ETIMEDOUT 等の一時的なネットワークエラーや 429 / 5xx 応答は bounded retry（backoff + jitter）で回復を試み、
 * 4xx 等の恒久的なエラーは retry せず即座に throw する。
 * 失敗時は operation 名・sanitized endpoint（host + pathname のみ。query に含まれ得る token 等の secret は含めない）・HTTP status または Node fetch の error.cause / cause.code を、エラーメッセージと `cause` に保持したまま throw する。
 *
 * @param operation ログ・エラーメッセージ用の操作名（例: getUserLikes）
 * @param url 呼び出し先の URL
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
        // stack trace を保持するため、元のエラーを cause として連鎖させる
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

  // MAX_ATTEMPTS >= 1 であるため、上のループ内で必ず return または throw される
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
      // 20件ずつ取得
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
    if (!embed) {
      return false
    }

    if (embed.$type !== 'app.bsky.embed.images') {
      return false
    }

    return embed.images.length > 0
  }
}
