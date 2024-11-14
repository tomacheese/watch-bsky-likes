import axios from 'axios'
import { Notified } from './notified'
import { Configuration } from './config'
import { Discord, Logger } from '@book000/node-utils'

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

async function getUserLikes(actor: string) {
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

async function getPostDetail(uris: string) {
  const baseUrl = 'https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts'
  const response = await axios.get<LikeResponse>(baseUrl, {
    params: {
      uris,
    },
  })

  return response.data
}

function getPostUrl(uri: string) {
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

async function main() {
  const logger = Logger.configure('main')

  const config = new Configuration('data/config.json')
  config.load()
  if (!config.validate()) {
    logger.error('❌ Configuration is invalid')
    logger.error(
      `💡 Missing check(s): ${config.getValidateFailures().join(', ')}`
    )
    return
  }

  const discord = new Discord(config.get('discord'))

  const isFirst = Notified.isFirst()

  const results = await getUserLikes('hiratake.dev')
  const filteredResults = results.records.filter((record) => {
    const { uri } = record.value.subject
    return !Notified.isNotified(uri)
  })

  for (const record of filteredResults) {
    const { uri } = record.value.subject
    const createdAt = record.value.createdAt

    const postUrl = getPostUrl(uri)
    if (!postUrl) {
      continue
    }

    Notified.addNotified(uri)

    console.log(`liked your post: ${postUrl} at ${createdAt}`)

    if (isFirst) {
      continue
    }

    await discord.sendMessage(postUrl)
  }
}

;(async () => {
  await main()
})()
