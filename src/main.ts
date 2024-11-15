import { Notified } from './notified'
import { Configuration } from './config'
import { Discord, Logger } from '@book000/node-utils'
import { Bluesky } from './bsky'

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

  const results = await Bluesky.getUserLikes('hiratake.dev')
  const filteredResults = results.records.filter((record) => {
    const { uri } = record.value.subject
    return !Notified.isNotified(uri)
  })

  const postDetails = await Bluesky.getPosts(
    filteredResults.map((r) => r.value.subject.uri)
  )

  for (const record of filteredResults) {
    const { uri } = record.value.subject
    const createdAt = record.value.createdAt

    const postUrl = Bluesky.getPostUrl(uri)
    if (!postUrl) {
      continue
    }

    console.log(`liked your post: ${postUrl} at ${createdAt}`)

    const postDetail = postDetails.find((p) => p.uri === uri)
    if (!postDetail) {
      console.log(`  -> Skip because postDetail is undefined`)
      continue
    }
    Notified.addNotified(uri)

    if (!Bluesky.isImagePost(postDetail)) {
      console.log(`  -> Skip because postDetail is not an image post`)
      continue
    }

    if (isFirst) {
      continue
    }

    await discord.sendMessage(postUrl)
  }
}

;(async () => {
  await main()
})()
