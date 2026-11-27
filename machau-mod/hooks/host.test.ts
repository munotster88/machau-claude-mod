// Run: node --test hooks/host.test.ts   (Node 22.6+ reads TypeScript directly)
// These run the mod's real commands on the computer the test runs on (a Mac or a Windows machine), through a stand-in
// for the engine's `$.process.run`, with the home folder pointed at a scratch folder.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { appendHome, base64, detect, powershell, readHome, readMachine, utf16le, utf8, within, type Run } from './host.ts'
import { decide, parseMacReading, parseWindowsReading } from './lib.ts'

const home = mkdtempSync(join(tmpdir(), 'machau-mod-'))
const env = { ...process.env, HOME: home, USERPROFILE: home }
const $: Run = {
  process: {
    run: argv =>
      new Promise((res, rej) =>
        execFile(argv[0], argv.slice(1), { env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => (err ? rej(err) : res({ stdout }))),
      ),
  },
}
const WIN = process.platform === 'win32'

test('encoding matches the standard one', () => {
  for (const s of ['', 'a', 'ab', 'abc', 'Write-Output "x"; $a = 1', 'नमस्ते – ok']) {
    assert.equal(base64(utf8(s)), Buffer.from(s, 'utf8').toString('base64'))
    assert.equal(base64(utf16le(s)), Buffer.from(s, 'utf16le').toString('base64'))
  }
  assert.equal(powershell('x')[0], 'powershell.exe')
})

test('a slow or failing call gives the fallback', async () => {
  assert.equal(await within(new Promise<string>(() => {}), 30, 'late'), 'late')
  assert.equal(await within(Promise.reject(new Error('no')), 30, 'failed'), 'failed')
  assert.equal(await within(Promise.resolve('ok'), 30, 'late'), 'ok')
})

test('knows which computer this is, with and without the engine saying', async () => {
  const expected = WIN ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux'
  assert.equal(await detect($), expected)
  assert.equal(await detect($, undefined), expected) // found by asking the computer
})

test('writes and reads its small files under the home folder', async () => {
  const os = await detect($)
  const rel = '.local/state/machau-mod/events.jsonl'
  assert.equal(await readHome($, os, rel), '') // missing file
  const lines = [
    JSON.stringify({ at: '2026-11-21T00:00:00Z', piece: 'loaded', detail: { os } }),
    JSON.stringify({ piece: 'liveGuard', detail: `it's "live" now; $HOME %USERPROFILE% \`tick\` 'quoted' & | > नमस्ते` }),
  ]
  for (const l of lines) await appendHome($, os, rel, l)
  const onDisk = readFileSync(join(home, '.local', 'state', 'machau-mod', 'events.jsonl'), 'utf8')
  assert.deepEqual(onDisk.split('\n').filter(Boolean), lines)
  assert.deepEqual((await readHome($, os, rel)).split(/\r?\n/).filter(Boolean), lines)
  // the person's own switches, written by hand in an editor
  mkdirSync(join(home, '.config', 'machau-mod'), { recursive: true })
  writeFileSync(join(home, '.config', 'machau-mod', 'profile.json'), '{ "switches": { "autoShrink": false } }')
  assert.deepEqual(JSON.parse(await readHome($, os, '.config/machau-mod/profile.json')), { switches: { autoShrink: false } })
  assert.equal(await readHome($, os, '../outside'), '') // only the mod's own paths
})

test('reads this computer and reaches a verdict', async () => {
  const os = await detect($)
  if (os !== 'mac' && os !== 'windows') return
  const started = Date.now()
  const out = await readMachine($, os, 20_000)
  const reading = os === 'mac' ? parseMacReading(out) : parseWindowsReading(out)
  console.log(`reading on ${os} in ${Date.now() - started} ms:`, JSON.stringify(reading), JSON.stringify(reading && decide(reading)))
  assert.ok(reading, `no reading from: ${out.slice(0, 300)}`)
  assert.ok(reading.ram_gb >= 1 && reading.cores >= 1)
  assert.ok(reading.free_pct !== null && reading.free_pct >= 0 && reading.free_pct <= 100)
  assert.ok(['ok', 'wait', 'full'].includes(decide(reading).verdict))
})

test('process output is read from stdout (a result object must never turn into "[object Object]")', async () => {
  const { text } = await import('./host.ts')
  assert.equal(text({ stdout: 'hello' }), 'hello')
  assert.equal(text('plain'), 'plain')
  assert.equal(text(undefined), '')
})
