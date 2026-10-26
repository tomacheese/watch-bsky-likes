import { Notified } from './notified'
import { Configuration } from './config'
import { Discord, Logger } from '@book000/node-utils'
import { Bluesky } from './bsky'
import { processLikes } from './process-likes'

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

  await processLikes(filteredResults, postDetails, discord, isFirst)
}

;(async () => {
  try {
    await main()
  } catch (error) {
    // fetch のネットワークエラーなどで main() が reject した場合、
    // 未処理のまま unhandledRejection として落ちるのを防ぐ
    const logger = Logger.configure('main')
    logger.error('❌ Unhandled error in main', error as Error)
    process.exitCode = 1
  }
})()
