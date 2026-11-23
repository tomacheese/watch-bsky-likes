import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { Notified } from './notified'
import { processLikes } from './process-likes'
import { Like } from './bsky'

void test('persists the complete first baseline and an empty baseline', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'notified-test-'))
  const previous = process.env.NOTIFIED_FILE
  process.env.NOTIFIED_FILE = path.join(directory, 'notified.json')
  t.after(() => {
    if (previous === undefined) delete process.env.NOTIFIED_FILE
    else process.env.NOTIFIED_FILE = previous
    fs.rmSync(directory, { recursive: true, force: true })
  })
  const sender = {
    sendMessage: () => Promise.reject(new Error('unexpected send')),
  }
  const records = ['one', 'two'].map((uri) => ({
    value: { subject: { uri } },
  })) as Like[]

  t.mock.method(fs, 'renameSync', () => {
    throw new Error('interrupted')
  })
  await assert.rejects(processLikes(records, [], sender, true), /interrupted/)
  assert.equal(Notified.isFirst(), true)
  t.mock.restoreAll()
  await processLikes(records, [], sender, true)
  assert.equal(Notified.isFirst(), false)
  assert.equal(Notified.isNotified('one'), true)
  assert.equal(Notified.isNotified('two'), true)

  fs.unlinkSync(process.env.NOTIFIED_FILE)
  await processLikes([], [], sender, true)
  assert.equal(Notified.isFirst(), false)
  assert.deepEqual(
    JSON.parse(fs.readFileSync(process.env.NOTIFIED_FILE, 'utf8')),
    []
  )
})

void test('preserves the previous state when an acknowledgement write is interrupted', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'notified-test-'))
  const previous = process.env.NOTIFIED_FILE
  process.env.NOTIFIED_FILE = path.join(directory, 'notified.json')
  t.after(() => {
    if (previous === undefined) delete process.env.NOTIFIED_FILE
    else process.env.NOTIFIED_FILE = previous
    fs.rmSync(directory, { recursive: true, force: true })
  })
  Notified.saveBaseline(['one'])
  t.mock.method(fs, 'renameSync', () => {
    throw new Error('interrupted')
  })
  assert.throws(() => {
    Notified.addNotified('two')
  }, /interrupted/)
  assert.equal(Notified.isNotified('one'), true)
  assert.equal(Notified.isNotified('two'), false)
})

void test('rejects and preserves malformed or invalid state', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'notified-test-'))
  const previous = process.env.NOTIFIED_FILE
  process.env.NOTIFIED_FILE = path.join(directory, 'notified.json')
  t.after(() => {
    if (previous === undefined) delete process.env.NOTIFIED_FILE
    else process.env.NOTIFIED_FILE = previous
    fs.rmSync(directory, { recursive: true, force: true })
  })
  for (const contents of ['["one"', '{}', '["one", 2]']) {
    fs.writeFileSync(process.env.NOTIFIED_FILE, contents)
    assert.throws(() => Notified.isFirst())
    assert.throws(() => {
      Notified.addNotified('two')
    })
    assert.equal(fs.readFileSync(process.env.NOTIFIED_FILE, 'utf8'), contents)
  }
})
