#!/bin/sh
set -eu

image=${1:-watch-bsky-likes}
data_dir=$(mktemp -d)
trap 'rm -rf "$data_dir"' EXIT

for run in first replacement; do
  docker run --rm -i --user "$(id -u):$(id -g)" -v "$data_dir:/data" --entrypoint node "$image" --import tsx - "$run" <<'NODE'
const assert = require('node:assert/strict')
const { Notified } = require('./src/notified.ts')
const { Bluesky } = require('./src/bsky.ts')
const { processLikes } = require('./src/process-likes.ts')

const oldUri = 'at://did:plc:abc/app.bsky.feed.post/old'
const newUri = 'at://did:plc:abc/app.bsky.feed.post/new'
const first = process.argv[2] === 'first'
const uri = first ? oldUri : newUri
const like = { value: { subject: { uri }, createdAt: '2026-01-01' } }
const post = { uri, record: { embed: { $type: 'app.bsky.embed.images', images: [{}] } } }
const sent = []

assert.equal(process.env.NOTIFIED_FILE, '/data/notified.json')
assert.equal(process.env.POST_CACHE_PATH, '/data/post_cache')
assert.equal(Notified.isFirst(), first)
if (!first) {
  assert.equal(Notified.isNotified(oldUri), true)
  assert.equal(Notified.isNotified(newUri), false)
}
async function run() {
  const cachedPost = { uri: oldUri, record: {} }
  globalThis.fetch = async () => {
    assert.equal(first, true, 'replacement should use the persisted cache')
    return Response.json({ posts: [cachedPost] })
  }
  assert.deepEqual(await Bluesky.getPosts([oldUri]), [cachedPost])
  await processLikes([like], [post], { sendMessage: async (message) => sent.push(message) }, first)
  assert.equal(sent.length, first ? 0 : 1)
  assert.equal(Notified.isNotified(uri), true)
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
NODE
done
