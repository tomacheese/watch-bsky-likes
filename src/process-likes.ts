import { Bluesky, Like, Post } from './bsky'
import { Notified } from './notified'

/**
 * メッセージを送信するオブジェクト。Discord クラスが構造的に満たす。
 */
export interface MessageSender {
  sendMessage(message: string): Promise<unknown>
}

/**
 * いいねされた投稿を順に処理し、画像投稿を Discord へ通知する。
 * 画像投稿は送信が成功してから通知済みとして記録するため、送信に失敗した投稿は次回実行で再送される。
 *
 * @param records 未通知のいいねレコード
 * @param postDetails 投稿の詳細
 * @param discord 通知の送信先
 * @param isFirst 初回実行かどうか。初回は送信せず通知済みとして記録のみ行う
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
