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
    "I'll check it's live, then tell Nirupam.",
    "I'll message Nirupam the steps as soon as the ship check says it's live.",
    'Neither change is live yet.',
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
  assert.ok(out.includes('aws-iam'))
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

test('bare-name skill families fold to one line; described families stay', () => {
  const out = trimSkills(['Skills:', '- aws-cdk', '- graphify', '- cloudflare:wrangler: Run Wrangler CLI commands.', '- aws-iam', '- higgsfield-generate'].join('\n'))
  assert.ok(out.includes('- AWS skills, 2 (invoke one by its exact name): aws-cdk, aws-iam'))
  assert.ok(out.includes('- cloudflare:wrangler: Run Wrangler CLI commands.') && out.includes('- graphify') && out.includes('higgsfield-generate'))
})

test('rarely used loaded tools are deferred, daily ones are not', () => {
  assert.ok(shouldDefer('AskUserQuestion') && shouldDefer('ReadNotifications'))
  assert.ok(shouldDefer('mcp__1a59c906-04da-521d-bda7-7f71b9f9e01c__batch'))
  assert.ok(!shouldDefer('mcp__ccd_turn__wrap_up') && !shouldDefer('Agent') && !shouldDefer('Skill'))
})

// ---------- 1.1.0: plan tick, session size and shrink, capacity check, Mac and Windows ----------
import { readFileSync } from 'node:fs'
import {
  CAPACITY, VERSION, asksOverride, asksShrink, capacityDeny, chromeDeny, decide, hasLine, holdReason, lastNumberFor, osDefaults,
  parseMacReading, parseWindowsReading, plainPrompt, playwrightDeny, sizeMark, smartShrink, startKind, worthShrinking, type Msg, type Reading,
} from './lib.ts'

test('the version in the code is the version of the plugin', () => {
  const plugin = JSON.parse(readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8'))
  assert.equal(VERSION, plugin.version)
})

test('wording and defaults follow the computer', () => {
  assert.match(playwrightDeny(true), /chrome\.sh/)
  assert.doesNotMatch(playwrightDeny(false), /chrome\.sh/)
  assert.match(playwrightDeny(false), /built-in browser/)
  assert.doesNotMatch(chromeDeny(false), /chrome\.sh/)
  assert.deepEqual(osDefaults('windows'), { noBlankChrome: false })
  assert.deepEqual(osDefaults('mac'), {})
})

test('what the person typed, without what the app adds', () => {
  assert.equal(plainPrompt('<system-reminder>\nLinked sessions now\n</system-reminder>\nFix the sticker printing'), 'Fix the sticker printing')
  assert.equal(plainPrompt('<system-reminder>only this</system-reminder>'), '')
})

test('session size marks, and the words that ask for a shrink', () => {
  assert.equal(sizeMark(250_000, 0), undefined)
  assert.equal(sizeMark(310_000, 0), 300_000)
  assert.equal(sizeMark(450_000, 300_000), undefined)
  assert.equal(sizeMark(520_000, 300_000), 500_000)
  assert.ok(asksShrink('shrink this session'))
  assert.ok(asksShrink('Yes, compact the session please'))
  assert.ok(!asksShrink('should I shrink this session?'))
  assert.ok(hasLine('abc\r\ndef\n', 'def') && !hasLine('abcdef\n', 'def'))
  assert.equal(lastNumberFor('s1 300000\r\ns2 500000\ns1 500000\n', 's1'), 500_000)
  assert.equal(lastNumberFor('', 's1'), 0)
})

test('smart shrink keeps the conversation, drops old tool work, keeps the last turns whole', () => {
  const big = 'x'.repeat(5000)
  const turn = (n: number): Msg[] => [
    { role: 'user', text: `Asha asks ${n}`, toolUses: [], handle: `u${n}` },
    { role: 'assistant', text: `I will look at ${n}.`, toolUses: [{ name: 'Bash', input: { command: 'ls', description: `List files ${n}` } }], handle: `a${n}` },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 't', text: big }], handle: `r${n}` },
    { role: 'assistant', text: '', toolUses: [{ name: 'Read', input: { file_path: `/x/${n}.ts` }, isError: n === 1 }], handle: `b${n}` },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 't2', text: big }], handle: `s${n}` },
    { role: 'assistant', text: `Answer ${n} for Asha.`, toolUses: [], handle: `c${n}` },
  ]
  const messages = [1, 2, 3, 4, 5].flatMap(turn)
  const r = smartShrink(messages, 3)!
  assert.ok(r)
  const text = r.messages.map(m => m.text).join('\n')
  for (const n of [1, 2, 3, 4, 5]) {
    assert.ok(text.includes(`Asha asks ${n}`), `prompt ${n} kept`)
    assert.ok(text.includes(`Answer ${n} for Asha.`), `reply ${n} kept`)
  }
  assert.ok(text.includes('I will look at 1.')) // what Claude said beside a tool call is kept
  assert.ok(text.includes('Bash: List files 1') && text.includes('Read: /x/1.ts') && text.includes('(1 failed)'))
  assert.equal(r.removed, 4) // two turns x two tool calls
  // the last three turns are untouched, handles and all
  assert.deepEqual(r.messages.slice(-18), messages.slice(-18))
  // roles alternate through the shortened part
  const head = r.messages.slice(0, -18)
  for (let i = 1; i < head.length; i++) assert.notEqual(head[i].role, head[i - 1].role)
  assert.equal(head[0].role, 'user')
  assert.notEqual(head[head.length - 1].role, 'user')
  assert.ok(r.after < r.before / 1.5)
  // old tool output is gone
  assert.ok(!JSON.stringify(head).includes('xxxxxxxxxx'))
})

test('smart shrink leaves a short or tool-free session alone', () => {
  const m: Msg[] = [{ role: 'user', text: 'hi', toolUses: [] }, { role: 'assistant', text: 'hello', toolUses: [] }]
  assert.equal(smartShrink(m, 3), undefined)
  assert.equal(smartShrink([...m, ...m, ...m, ...m, ...m], 3), undefined)
})


test('automatic shrink only when the saving is large', () => {
  assert.ok(worthShrinking(1_563_027, 366_784)) // a real session
  assert.ok(!worthShrinking(500_000, 300_000)) // saves too little
  assert.ok(!worthShrinking(3_000_000, 2_400_000)) // big, but mostly conversation: under 40% removed
})

test('plan tick: reminds once a step has run long, and stops when the list moves', async () => {
  const { planTick, PLAN_NONE, PLAN_STALE, PLAN_AGAIN } = await import('./lib.ts')
  const items = [{ content: 'Read the code', status: 'in_progress' }, { content: 'Build', status: 'pending' }, { content: 'Test', status: 'pending' }]
  let s = planTick(PLAN_NONE, 'mcp__ccd_turn__update_plan', { items }).state
  assert.equal(s.current, 0)
  let notes = 0
  for (let i = 1; i < PLAN_STALE; i++) { const r = planTick(s, 'Bash', {}); s = r.state; assert.equal(r.note, undefined) }
  let r = planTick(s, 'Bash', {}); s = r.state
  assert.ok(r.note?.includes('step 1 of 3 ("Read the code")')); assert.ok(r.note?.includes('"advance": true'))
  for (let i = 1; i < PLAN_AGAIN; i++) { r = planTick(s, 'Read', {}); s = r.state; assert.equal(r.note, undefined) }
  r = planTick(s, 'Read', {}); s = r.state; assert.ok(r.note) // reminded again, not on every call
  s = planTick(s, 'mcp__ccd_turn__update_plan', { advance: true }).state
  assert.deepEqual([s.current, s.since, s.noted], [1, 0, 0])
  s = planTick(s, 'mcp__ccd_turn__update_plan', { done: [2], start: 3 }).state
  assert.equal(s.current, 2)
  for (let i = 0; i < 40; i++) { r = planTick(s, 'Bash', {}); s = r.state; if (r.note) notes++ }
  assert.equal(notes, 0) // the last step is ticked by the wrap-up
  assert.equal(planTick(s, 'mcp__ccd_turn__wrap_up', {}).state.steps.length, 0)
  for (let i = 0; i < 40; i++) assert.equal(planTick(PLAN_NONE, 'Bash', {}).note, undefined) // no list, no reminder
})

const IDLE: Reading = { os: 'mac', ram_gb: 16, cores: 10, free_pct: 70, swap_gb: 0, load1: 1.5, heavy_procs: 0 }

test('capacity: the verdict for a Mac follows memory, swap, load and running builds', () => {
  const ok = decide(IDLE)
  assert.equal(ok.verdict, 'ok'); assert.ok(ok.heavy_fit >= 1)
  assert.equal(decide({ ...IDLE, free_pct: 12 }).verdict, 'full')
  assert.equal(decide({ ...IDLE, swap_gb: 6 }).verdict, 'full')
  assert.equal(decide({ ...IDLE, load1: 9 }).verdict, 'wait')
  assert.equal(decide({ ...IDLE, load1: 13 }).verdict, 'full')
  assert.equal(decide({ ...IDLE, free_pct: 30 }).verdict, 'wait')
  assert.ok(decide({ ...IDLE, ram_gb: 64, cores: 16 }).heavy_fit > ok.heavy_fit) // relative to the computer's size
  assert.equal(decide({ ...IDLE, heavy_procs: 3 }).heavy_fit, 0) // 10 cores carry three builds at once
  assert.equal(decide({ ...IDLE, free_pct: null }).verdict, 'ok') // no memory figure: half is taken as free, the other signs still count
})

test('capacity: Windows is held only when under a tenth of memory is free', () => {
  const w: Reading = { os: 'windows', ram_gb: 8, cores: 8, free_pct: 30, swap_gb: 0, load1: 0, heavy_procs: 0 }
  assert.equal(decide(w).verdict, 'ok')
  assert.equal(decide({ ...w, free_pct: 10 }).verdict, 'ok')
  assert.equal(decide({ ...w, free_pct: 9 }).verdict, 'full')
})

test('capacity: which starts are held', () => {
  const ok = decide(IDLE)
  const wait = decide({ ...IDLE, free_pct: 30 })
  const full = decide({ ...IDLE, free_pct: 10 })
  const long = 10 * 60_000
  assert.equal(holdReason(ok, 'heavy', true, long), undefined)
  assert.equal(holdReason(wait, 'light', true, long), undefined) // tight: light sessions only
  assert.match(holdReason(wait, 'heavy', true, long)!, /^wait/)
  assert.match(holdReason(full, 'light', true, long)!, /^full/)
  assert.match(holdReason(full, 'light', false, long)!, /^full/) // a helper is held only when full
  assert.equal(holdReason(wait, 'heavy', false, long), undefined)
  assert.match(holdReason(ok, 'light', true, 10_000)!, /^stagger: .* wait 80s/) // two sessions 10 s apart
  assert.equal(holdReason(ok, 'light', false, 10_000), undefined) // helpers are not staggered
  assert.equal(holdReason(ok, 'light', true, CAPACITY.stagger_ms), undefined)
  assert.equal(startKind('mcp__ccd_session__start_session', { prompt: 'Read the log and tell me what failed' }), 'light')
  assert.equal(startKind('mcp__ccd_session__start_session', { prompt: 'Fix the bug and open a PR' }), 'heavy')
  assert.equal(startKind('Agent', { subagent_type: 'Explore' }), 'light')
  assert.equal(startKind('Agent', { subagent_type: 'general-purpose' }), 'heavy')
  assert.match(capacityDeny('full: x', 'heavy'), /start it anyway/)
  assert.ok(asksOverride('ok start it anyway') && asksOverride('Start anyway') && asksOverride('override the capacity check'))
  assert.ok(!asksOverride('start the build when there is room'))
})

test('capacity: reads a real Mac reading and a real Windows reading', () => {
  const mac = [
    'ram 17179869184', 'cores 10', 'free System-wide memory free percentage: 50%',
    'swap total = 5120.00M  used = 4235.00M  free = 885.00M  (encrypted)', 'load { 2.25 2.36 2.07 }', '@@ps',
    '/Applications/Claude.app/Contents/MacOS/Claude', // the app itself is never a build
    '/bin/zsh -c npm run build', // the wrapper around a build is not counted
    'node /Users/a/app/node_modules/.bin/next build', // the build is
    'node /Users/a/app/node_modules/next/dist/compiled/jest-worker/processChild.js', // nor its workers
    '/Users/a/Library/Caches/ms-playwright/chromium-1/chrome-mac/Chromium.app/Contents/MacOS/Chromium --headless', // a test browser is
    'node /Users/a/tools/server.js', // a plain node program is not a build
  ].join('\n')
  assert.deepEqual(parseMacReading(mac), { os: 'mac', ram_gb: 16, cores: 10, free_pct: 50, swap_gb: 4.14, load1: 2.25, heavy_procs: 2 })
  assert.equal(parseMacReading('nothing useful'), undefined)
  assert.equal(parseMacReading('ram 17179869184\ncores 10\nfree \nswap \nload \n@@ps\n')!.free_pct, null)
  const win = 'ram_kb 16482556\r\nfree_kb 6593022\r\ncores 12\r\n'
  assert.deepEqual(parseWindowsReading(win), { os: 'windows', ram_gb: 15.7, cores: 12, free_pct: 40, swap_gb: 0, load1: 0, heavy_procs: 0 })
  assert.equal(parseWindowsReading(''), undefined)
})
