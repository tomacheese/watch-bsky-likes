import { Bluesky, Like, Post } from './bsky'
import { Notified } from './notified'

/**
 * Object that can send a message. The Discord class satisfies it structurally.
 */
export interface MessageSender {
  sendMessage(message: string): Promise<unknown>
}

/**
 * Processes liked posts in order and notifies Discord about image posts.
 * An image post is recorded as notified only after the send succeeds, so a post whose send failed is retried on the next run.
 *
 * @param records Like records not yet notified
 * @param postDetails Post details
 * @param discord Destination for notifications
 * @param isFirst Whether this is the first run. On the first run nothing is sent and posts are only recorded as notified
 */
export async function processLikes(
  records: Like[],
  postDetails: Post[],
  discord: MessageSender,
  isFirst: boolean
): Promise<void> {
  for (const record of records) {
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
      Notified.addNotified(uri)
      continue
    }

    if (!Bluesky.isImagePost(postDetail)) {
      console.log(`  -> Skip because postDetail is not an image post`)
      Notified.addNotified(uri)
      continue
    }

    if (isFirst) {
      Notified.addNotified(uri)
      continue
    }

    await discord.sendMessage(postUrl)
    Notified.addNotified(uri)
  }
}
