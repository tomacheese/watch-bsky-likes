import axios from 'axios'
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
    embed?: {
      $type: string
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
    embed: {
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

export class Bluesky {
  public static async getUserLikes(actor: string) {
    const baseUrl = 'https://bsky.social/xrpc/com.atproto.repo.listRecords'
    const response = await axios.get<LikeResponse>(baseUrl, {
      params: {
        collection: 'app.bsky.feed.like',
        limit: 100,
        reverse: false,
        cursor: '',
        repo: actor,
      },
    })

    return response.data
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
      // eslint-disable-next-line unicorn/no-array-reduce
      const chunkedUris = uncachedUris.reduce<string[][]>((acc, uri, index) => {
        const chunkIndex = Math.floor(index / 20)
        if (!acc[chunkIndex]) {
          acc[chunkIndex] = []
        }

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

  private static async getPostsFromApi(uris: string[]) {
    const baseUrl = 'https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts'
    const response = await axios.get<PostsResponse>(baseUrl, {
      params: {
        uris,
      },
    })

    return response.data
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
    if (!post.record.embed) {
      return false
    }

    return post.record.embed.images.length > 0
  }
}
