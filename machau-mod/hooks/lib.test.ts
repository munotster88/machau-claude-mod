// Run: node --test hooks/lib.test.ts   (Node 22.6+ reads TypeScript directly)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hasLiveVerdict, isClaudeInChrome, isPlaywright, isDeployish, liveClaim, maskSecrets } from './lib.ts'

const HEX32 = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6'

test('masks known secret shapes', () => {
  const samples = [
    `token shpat_${HEX32} here`,
    'AKIAIOSFODNN7EXAMPLE',
    'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    'sk-ant-api03-abcdefghijklmnopqrstuvwxyz',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N',
    '-----BEGIN RSA PRIVATE KEY-----\nMIIEow\nabc\n-----END RSA PRIVATE KEY-----',
    'SHOPIFY_API_SECRET=9f8e7d6c5b4a39281706f5e4d3c2b1a0',
    '"access_token": "Zx81kq02LmnP55tyUUa9034bbQ"',
  ]
  for (const s of samples) {
    const r = maskSecrets(s)
    assert.equal(r.count, 1, s)
    assert.match(r.text, /masked by machau-mod/)
  }
})

test('masks only the password in a connection string', () => {
  const r = maskSecrets('postgres://app_user:Sup3rSecretPw@db.example.com:5432/app')
  assert.equal(r.text, 'postgres://app_user:…[password masked by machau-mod]@db.example.com:5432/app')
})

test('leaves ordinary output alone', () => {
  const plain = [
    'const apiKey = process.env.SHOPIFY_API_KEY',
    'token: mcp__claude-in-chrome__navigate',
    'commit a63cde1f0b2c4d5e6f708192a3b4c5d6e7f80910 auto-sync',
    'password = "short"',
    'https://bamboostan.com/products/x?width=100',
    'secret_name: shopify-admin-token',
    'git@github.com:munotster88/operating-system.git',
  ]
  for (const s of plain) assert.deepEqual(maskSecrets(s), { text: s, count: 0 }, s)
})

test('spots a live claim', () => {
  for (const s of [
    'Merged, and the fix is live.',
    'Both changes are now live on the storefront.',
    'PR 428 went live at 14:02.',
    'It is deployed.',
    'The build was deployed to production.',
  ]) assert.ok(liveClaim(s), s)
})

test('does not flag talk about live that is not a claim', () => {
  for (const s of [
    'It is not live yet: the deploy is still running.',
    'I will tell you once it is live.',
    'Is it live?',
    'The ship check says `VERDICT: LIVE` only when the site answers.',
    "It isn't deployed yet.",
    'We met at the live event.',
    '```\nit is live\n```',
  ]) assert.equal(liveClaim(s), undefined, s)
})

test('deploy commands, verdict, chrome tools', () => {
  assert.ok(isDeployish('gh pr merge 428 --squash'))
  assert.ok(isDeployish('git push origin main'))
  assert.ok(isDeployish('~/os/bin/ship-check.py storefront 428'))
  assert.ok(!isDeployish('git status'))
  assert.ok(hasLiveVerdict('checks ok\nVERDICT: LIVE\n'))
  assert.ok(!hasLiveVerdict('VERDICT: NOT LIVE'))
  assert.ok(isClaudeInChrome('mcp__claude-in-chrome__navigate'))
  assert.ok(!isClaudeInChrome('mcp__Claude_Browser__navigate'))
  assert.ok(isPlaywright('mcp__plugin_playwright_playwright__browser_navigate'))
  assert.ok(isPlaywright('mcp__playwright__browser_click'))
  assert.ok(!isPlaywright('mcp__Claude_Browser__navigate'))
})

import { routeFor, serverKey, serversIn, shouldDefer, splitMcp, trimInstructions, trimSkills, trimToolList, ROUTE_LABELS } from './lib.ts'

test('folds big connectors to one line and keeps everything else', () => {
  const big = Array.from({ length: 12 }, (_, i) => `mcp__engage__tool_${i}`)
  const twinA = Array.from({ length: 6 }, (_, i) => `mcp__company-brain-cloud__brain_${i}`)
  const twinB = Array.from({ length: 6 }, (_, i) => `mcp__claude_ai_Company_Brain__brain_${i}`)
  const text = [
    'The following tools just became available and are ready to use:',
    ...Array.from({ length: 10 }, (_, i) => `mcp__loaded__t${i}`),
    '',
    'The following deferred tools are now available via ToolSearch. Their schemas are NOT loaded.',
    'CronCreate', ...big, 'mcp__small__a', 'mcp__small__b', ...twinA, ...twinB, 'WebSearch',
    '',
    'If the user asks, search.',
  ].join('\n')
  const out = trimToolList(text)
  assert.ok(out.includes('mcp__loaded__t9'), 'loaded tools keep their names')
  assert.ok(out.includes('mcp__engage__*: 12 tools, e.g. tool_0'))
  assert.ok(!out.includes('mcp__engage__tool_7'))
  assert.ok(out.includes('mcp__small__a') && out.includes('CronCreate') && out.includes('WebSearch'))
  assert.ok(out.includes('mcp__claude_ai_Company_Brain__*: the same 6 tools as mcp__company-brain-cloud__*'))
  assert.ok(out.includes('mcp__company-brain-cloud__brain_0'), 'the kept twin is small, so it keeps its names')
  assert.ok(out.includes('If the user asks, search.'))
  assert.equal(trimToolList('nothing to fold\nRead\n'), 'nothing to fold\nRead\n')
})

test('cuts long skill descriptions, keeps short and protected ones', () => {
  const long = 'x'.repeat(30) + ' ' + 'word '.repeat(80)
  const text = `The following skills are available:\n\n- aws-iam\n- docx: ${long}\nsecond line of docx\n- impeccable: ${long}\n- anthropic-skills:delegate-with-judgment: ${long}\n- short: fine`
  const out = trimSkills(text)
  assert.ok(out.includes('- aws-iam\n'))
  assert.ok(out.split('\n').find(l => l.startsWith('- docx'))!.length < 230)
  assert.ok(!out.includes('second line of docx'))
  assert.ok(out.includes(`- impeccable: ${long.trim()}`))
  assert.ok(out.includes(`- anthropic-skills:delegate-with-judgment: ${long.trim()}`))
  assert.ok(out.endsWith('- short: fine'))
  // a plugin-prefixed name holds a colon; its long description is still cut (missed until 12 Nov: the app list stayed at 20k)
  const pre = trimSkills(`Skills:\n- anthropic-skills:xlsx: ${'word '.repeat(150)}\n- short: fine`)
  assert.ok(pre.split('\n')[1].startsWith('- anthropic-skills:xlsx: word') && pre.split('\n')[1].length < 240)
})

test('holds long connector instructions and can hand them back', () => {
  const long = 'Always call init first. ' + 'detail '.repeat(300)
  const text = `# MCP Server Instructions\n\nIntro line.\n\n## engage\nShort rules.\n\n## claude.ai Meta MCP\n${long}\n\n## claude-in-chrome\n${long}\n\n## docs\nClaude Docs: ${long}\n`
  const r = trimInstructions(text, undefined, true)
  assert.ok(r.text.includes('## engage\nShort rules.'))
  assert.deepEqual(Object.keys(r.held), ['claude_ai_meta_mcp'])
  assert.ok(r.held.claude_ai_meta_mcp.includes(long.trim()))
  assert.ok(r.text.includes('Always call init first.') && r.text.includes('first time you ToolSearch'))
  assert.ok(r.text.includes('Not used here (house rule)'))
  assert.ok(r.text.includes(`Claude Docs: ${long}`), 'docs stays whole')
  assert.ok(r.text.length < text.length / 2)
  assert.deepEqual(serversIn('found mcp__claude_ai_Meta_MCP__ads_get and mcp__engage__whoami'), ['claude_ai_meta_mcp', 'engage'])
  assert.equal(serverKey('claude.ai Meta MCP'), 'claude_ai_meta_mcp')
})

test('deferral, name splitting, routing', () => {
  assert.ok(shouldDefer('Artifact') && shouldDefer('mcp__Claude_Browser__navigate'))
  assert.ok(shouldDefer('mcp__claude_ai_Adobe_for_creativity__adobe_mandatory_init'))
  assert.ok(!shouldDefer('Bash') && !shouldDefer('mcp__ccd_turn__update_plan'))
  assert.deepEqual(splitMcp('mcp__machau-chat-sid__send_message'), ['machau-chat-sid', 'send_message'])
  assert.equal(splitMcp('Bash'), undefined)
  assert.equal(routeFor(ROUTE_LABELS[0]), 'opus')
  assert.equal(routeFor(ROUTE_LABELS[1]), 'sonnet')
  assert.equal(routeFor(ROUTE_LABELS[2]), 'haiku')
  assert.equal(routeFor(undefined), 'sonnet')
})
