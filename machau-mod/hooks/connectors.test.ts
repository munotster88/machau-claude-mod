import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { COMPANY_CONNECTORS, connectorsSeen, heartbeatBody, maskSecrets, splitMcp } from './lib.ts'

const raw = readFileSync(fileURLToPath(new URL('../.mcp.json', import.meta.url)), 'utf8')
const servers = (JSON.parse(raw) as { mcpServers: Record<string, Record<string, unknown>> }).mcpServers

test('condition (a): the connector bundle holds addresses only: no key, token, header, program or personal id', () => {
  assert.ok(Object.keys(servers).length >= 1)
  for (const [name, s] of Object.entries(servers)) {
    assert.deepEqual(Object.keys(s).sort(), ['type', 'url'], `${name} may only have type and url`)
    assert.equal(s.type, 'http')
    const u = new URL(String(s.url))
    assert.equal(u.protocol, 'https:')
    assert.equal(u.username + u.password + u.search + u.hash, '', `${name}: no credentials or query in the address`)
    assert.match(u.hostname, /\.(bamboostan\.com|machau\.in)$/, `${name}: company hosts only`)
  }
  assert.equal(maskSecrets(raw).count, 0, 'no secret-looking text in the file')
  assert.ok(!/userConfig|\$\{/.test(raw), 'nothing to expand: no secret placeholders either')
})

test('the checklist addresses are exactly the addresses in the bundle', () => {
  const inBundle = Object.fromEntries(Object.entries(servers).map(([k, v]) => [k, v.url]))
  for (const c of COMPANY_CONNECTORS.filter(c => c.bundled)) assert.equal(inBundle[c.name], c.address, c.name)
  for (const c of COMPANY_CONNECTORS.filter(c => !c.bundled)) assert.equal(inBundle[c.name], undefined, `${c.name} is not bundled`)
  assert.equal(Object.keys(inBundle).length, COMPANY_CONNECTORS.filter(c => c.bundled).length)
})

test('a connector the plugin carries is the same connector as one added by hand', () => {
  assert.deepEqual(splitMcp('mcp__plugin_machau-mod_machau-chat__list_tasks'), ['machau-chat', 'list_tasks'])
  assert.deepEqual(splitMcp('mcp__machau-chat__list_tasks'), ['machau-chat', 'list_tasks'])
  assert.deepEqual(splitMcp('mcp__machau-chats__list_tasks'), ['machau-chat', 'list_tasks']) // the name in Paramjeet's app
})

test('only company connector names leave the laptop, and only the fixed names', () => {
  const seen = connectorsSeen(['mcp__machau-chat__list_tasks', 'mcp__plugin_machau-mod_bamboostan-app__x', 'mcp__my-private-thing__read', 'mcp__machau-chat-sid__send_message', 'Bash'])
  assert.deepEqual(seen.sort(), ['bamboostan-app', 'machau-chat'])
  const b = JSON.parse(heartbeatBody({ member: 'sid', version: '1.7.0', os: 'mac', pieces: [], lastActive: 'x', connectors: seen }))
  assert.deepEqual(b.connectors.sort(), ['bamboostan-app', 'machau-chat'])
  assert.ok(!JSON.stringify(b).includes('my-private-thing'))
})

test('the needs-you skill carries the page exactly, so no first run has to look for a file', () => {
  const skill = readFileSync(fileURLToPath(new URL('../skills/needs-you/SKILL.md', import.meta.url)), 'utf8')
  const page = readFileSync(fileURLToPath(new URL('../skills/needs-you/page.html', import.meta.url)), 'utf8').trim()
  assert.ok(skill.includes(page), 'SKILL.md must contain page.html unchanged')
})

test('the report-problem skill has the six fixed parts, the first line, and the no-secrets rule', () => {
  const s = readFileSync(fileURLToPath(new URL('../skills/report-problem/SKILL.md', import.meta.url)), 'utf8')
  for (const part of ['Trying to do', 'Happened instead', 'Example', 'How often and cost', 'Already tried', 'Fix, in their words']) assert.ok(s.includes(part), part)
  assert.ok(s.includes('[problem] <one-line title>'))
  assert.ok(/Amazon buyer detail/.test(s) && /send this to Sid\?/.test(s))
})
