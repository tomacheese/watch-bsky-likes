# watch-bsky-likes

Watches the likes of a Bluesky user and notifies Discord about liked posts that contain images.

## Features

- Periodically fetches the likes of a specified Bluesky user
- Notifies Discord about liked image posts
- Prevents duplicate notifications for likes that were already notified
- Retries transient network errors and 429 / 5xx responses with backoff
- On the first run (no `data/notified.json` yet), existing likes are only recorded and nothing is sent

## Requirements

- Node.js (see `.node-version`)
- pnpm

## Installation

```bash
git clone https://github.com/tomacheese/watch-bsky-likes.git
cd watch-bsky-likes
pnpm install
```

## Configuration

### Discord

Create `data/config.json` with either a webhook:

```json
{
  "discord": {
    "webhookUrl": "https://discord.com/api/webhooks/..."
  }
}
```

or a bot token and channel:

```json
{
  "discord": {
    "token": "your-bot-token",
    "channelId": "channel-id"
  }
}
```

### Watched user

The watched Bluesky user is currently hardcoded in `src/main.ts`. To change it, edit this line and replace `'hiratake.dev'` with the handle you want to watch:

```typescript
const results = await Bluesky.getUserLikes('hiratake.dev')
```

### Data files

State is stored under `data/` (created on demand): `config.json`, `notified.json` (override with the `NOTIFIED_FILE` environment variable) and `post_cache/` (override with `POST_CACHE_PATH`).

## Usage

```bash
# Run once
pnpm start

# Development mode (restarts on file changes)
pnpm dev

# Run tests
pnpm test
```

## Docker

The container runs `pnpm start` every 10 minutes.

```bash
docker build -t watch-bsky-likes .
docker run -v $(pwd)/data:/app/data watch-bsky-likes
```

## License

This project is released under the [MIT](LICENSE) license.
