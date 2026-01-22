# watch-bsky-likes

Bluesky ユーザーのいいねを監視し、いいねした画像投稿を Discord に通知するツールです。

## 機能

- 指定した Bluesky ユーザーのいいねを定期的に取得
- いいねした画像投稿を Discord に通知
- 既に通知したいいねの重複通知を防止

## 必要要件

- Node.js（`.node-version` 参照）
- pnpm

## インストール

```bash
# リポジトリのクローン
git clone https://github.com/tomacheese/watch-bsky-likes.git
cd watch-bsky-likes

# 依存関係のインストール
pnpm install
```

## 設定

`data/config.json` を作成し、Discord の通知設定を行います。

```json
{
  "discord": {
    "webhookUrl": "https://discord.com/api/webhooks/..."
  }
}
```

または Bot Token を使用する場合:

```json
{
  "discord": {
    "token": "your-bot-token",
    "channelId": "channel-id"
  }
}
```

## 使用方法

```bash
# 実行
pnpm start

# 開発モード（ファイル変更を監視）
pnpm dev
```

## Docker での実行

```bash
docker build -t watch-bsky-likes .
docker run -v $(pwd)/data:/app/data watch-bsky-likes
```

## ライセンス

このプロジェクトは [MIT](LICENSE) ライセンスの下で公開されています。
