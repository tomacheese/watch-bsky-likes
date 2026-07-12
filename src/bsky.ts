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
    const filename = this.getCachePath(uri)
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
    const filename = this.getCachePath(uri)
    if (!filename) {
      return
    }

    const directory = filename.split('/').slice(0, -1).join('/')
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true })
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

    return `${this.PATH.POST_CACHE_PATH}/${actor}/${cid}.json`
  }
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
    const response = await fetch(url.href)
    if (!response.ok)
      throw new Error(
        `❌ Failed to fetch likes: ${response.status} ${response.statusText}`
      )
    return (await response.json()) as LikeResponse
  }

  public static async getPosts(uris: string[], isCacheUsed = true) {
    const posts: Post[] = []
    const uncachedUris: string[] = []

    for (const uri of uris) {
      let post: Post | undefined
      if (isCacheUsed) {
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
      // eslint-disable-next-line unicorn/no-array-reduce
      const chunkedUris = uncachedUris.reduce<string[][]>(
        (accumulator, uri, index) => {
          const chunkIndex = Math.floor(index / 20)
          accumulator[chunkIndex] ??= []

          accumulator[chunkIndex].push(uri)
          return accumulator
        },
        []
      )

      for (const chunk of chunkedUris) {
        const response = await this.getPostsFromApi(chunk)
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
    const parameters = new URLSearchParams()
    for (const uri of uris) {
      parameters.append('uris', uri)
    }

    url.search = parameters.toString()
    const response = await fetch(url.href)
    if (!response.ok)
      throw new Error(
        `❌ Failed to fetch posts: ${response.status} ${response.statusText}`
      )
    return (await response.json()) as PostsResponse
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
