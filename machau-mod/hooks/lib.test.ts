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
  assert.deepEqual(splitMcp('mcp__machau-chat-other__send_message'), ['machau-chat-other', 'send_message'])
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

const IDLE: Reading = { os: 'mac', ram_gb: 16, cores: 10, free_pct: 70, swap_gb: 0, pressure: 1, load1: 1.5, heavy_procs: 0 }

test('capacity: the verdict for a Mac follows free memory, pressure, load and running builds, not swap sitting in use', () => {
  const ok = decide(IDLE)
  assert.equal(ok.verdict, 'ok'); assert.ok(ok.heavy_fit >= 1)
  assert.equal(decide({ ...IDLE, free_pct: 8 }).verdict, 'full')
  assert.equal(decide({ ...IDLE, free_pct: 17 }).verdict, 'wait')
  assert.match(decide({ ...IDLE, free_pct: 20 }).reason, /not enough free memory for a session that builds code/) // room for light work only, said plainly
  assert.equal(decide({ ...IDLE, free_pct: 30 }).verdict, 'ok')
  // 1.2.1: swap that merely sits in use holds nothing (7.4 GB sat there with half the memory free and every start was held)
  assert.equal(decide({ ...IDLE, free_pct: 50, swap_gb: 7.4 }).verdict, 'ok')
  assert.equal(decide({ ...IDLE, pressure: 2 }).verdict, 'ok') // the warning level alone does not hold
  assert.equal(decide({ ...IDLE, pressure: 4 }).verdict, 'full')
  assert.equal(decide({ ...IDLE, load1: 10 }).verdict, 'ok') // a load equal to the cores is a computer in use, not in trouble
  assert.equal(decide({ ...IDLE, load1: 16 }).verdict, 'wait')
  assert.equal(decide({ ...IDLE, load1: 26 }).verdict, 'full')
  assert.ok(decide({ ...IDLE, free_pct: 30 }).heavy_fit >= 1) // a 16 GB Mac with 30% free still takes a code session
  assert.ok(decide({ ...IDLE, ram_gb: 64, cores: 16 }).heavy_fit > ok.heavy_fit) // relative to the computer's size
  assert.ok(decide({ ...IDLE, heavy_procs: 3 }).heavy_fit >= 1)
  assert.equal(decide({ ...IDLE, heavy_procs: 4 }).heavy_fit, 0) // 10 cores carry four builds at once
  assert.equal(decide({ ...IDLE, free_pct: null }).verdict, 'ok') // no memory figure: half is taken as free, the other signs still count
})

test('capacity: Windows is held only when under a tenth of memory is free', () => {
  const w: Reading = { os: 'windows', ram_gb: 8, cores: 8, free_pct: 30, swap_gb: 0, pressure: 1, load1: 0, heavy_procs: 0 }
  assert.equal(decide(w).verdict, 'ok')
  assert.equal(decide({ ...w, free_pct: 10 }).verdict, 'ok')
  assert.equal(decide({ ...w, free_pct: 9 }).verdict, 'full')
})

test('capacity: which starts are held', () => {
  const ok = decide(IDLE)
  const wait = decide({ ...IDLE, free_pct: 17 })
  const full = decide({ ...IDLE, free_pct: 8 })
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
    'swap total = 5120.00M  used = 4235.00M  free = 885.00M  (encrypted)', 'level 2', 'load { 2.25 2.36 2.07 }', '@@ps',
    '/Applications/Claude.app/Contents/MacOS/Claude', // the app itself is never a build
    '/bin/zsh -c npm run build', // the wrapper around a build is not counted
    'node /Users/a/app/node_modules/.bin/next build', // the build is
    'node /Users/a/app/node_modules/next/dist/compiled/jest-worker/processChild.js', // nor its workers
    '/Users/a/Library/Caches/ms-playwright/chromium-1/chrome-mac/Chromium.app/Contents/MacOS/Chromium --headless', // a test browser is
    'node /Users/a/tools/server.js', // a plain node program is not a build
  ].join('\n')
  assert.deepEqual(parseMacReading(mac), { os: 'mac', ram_gb: 16, cores: 10, free_pct: 50, swap_gb: 4.14, pressure: 2, load1: 2.25, heavy_procs: 2 })
  assert.equal(parseMacReading('nothing useful'), undefined)
  assert.equal(parseMacReading('ram 17179869184\ncores 10\nfree \nswap \nload \n@@ps\n')!.free_pct, null)
  const win = 'ram_kb 16482556\r\nfree_kb 6593022\r\ncores 12\r\n'
  assert.deepEqual(parseWindowsReading(win), { os: 'windows', ram_gb: 15.7, cores: 12, free_pct: 40, swap_gb: 0, pressure: 1, load1: 0, heavy_procs: 0 })
  assert.equal(parseWindowsReading(''), undefined)
})

// ---------- 1.2.0: Company Brain ----------
import { brainNudge, brainSection, brainTools, isBrainCapture, sharesWork } from './lib.ts'

test('Company Brain: found only when the person has connected it, by its readable name', () => {
  assert.equal(brainTools(['Bash', 'mcp__engage__list_segments']), undefined)
  const both = brainTools(['mcp__da69a900-dce5-40d9-931b-659f381ff594__brain_ask', 'mcp__company-brain-cloud__brain_ask',
    'mcp__da69a900-dce5-40d9-931b-659f381ff594__brain_department_capture', 'mcp__company-brain-cloud__brain_department_capture',
    'mcp__company-brain-cloud__brain_capture_context'])!
  assert.deepEqual(both, { capture: 'mcp__company-brain-cloud__brain_department_capture', ownerCapture: 'mcp__company-brain-cloud__brain_capture_context', ask: 'mcp__company-brain-cloud__brain_ask' })
  assert.deepEqual(brainTools(['mcp__11111111-aaaa-bbbb-cccc-222222222222__brain_department_capture']), { capture: 'mcp__11111111-aaaa-bbbb-cccc-222222222222__brain_department_capture' })
  assert.ok(isBrainCapture('mcp__company-brain-cloud__brain_department_capture') && isBrainCapture('mcp__x__brain_capture_context'))
  assert.ok(!isBrainCapture('mcp__x__brain_capture_status') && !isBrainCapture('mcp__x__brain_ask'))
  const section = brainSection(both)
  for (const t of Object.values(both)) assert.ok(section.includes(t))
  assert.match(section, /Never a key or password/)
  assert.match(brainNudge(both), /still in flight/)
  assert.doesNotMatch(brainSection({ capture: 'mcp__x__brain_department_capture' }), /Before you change/) // no ask tool, no ask line
})

test('Company Brain: work that reaches colleagues is a push, a pull request or a deploy, not a mention of one', () => {
  for (const c of ['git push', 'cd app && git push origin main', 'git -C ~/code/app push -q', 'gh pr create --fill', 'gh pr merge 12 --squash', './deploy.sh prod', 'npm run deploy', 'wrangler deploy'])
    assert.ok(sharesWork(c), c)
  for (const c of ['git status', 'git commit -m "push the fix later"', 'grep -n deploy README.md', 'echo "git push"', "cat <<'EOF'\ngit push\nEOF", 'gh pr view 12', 'gh pr list'])
    assert.ok(!sharesWork(c), c)
})


test('secret mask: a Supabase service-role key, by its shape and by its name', () => {
  const made = ['sb', 'secret', 'Ab3dEf6hIj9kLmN2pQr5tUvWx8zA1cD'].join('_') // put together here: a made-up value, never a real key
  const a = maskSecrets('SUPABASE_SERVICE_ROLE_KEY=' + made)
  assert.equal(a.count, 1); assert.ok(!a.text.includes(made.slice(14)))
  const b = maskSecrets('SERVICE_ROLE_KEY: "Zx9Yw8Vu7Ts6Rq5Po4Nm3Lk2Ji1Hg0Fe"')
  assert.equal(b.count, 1); assert.ok(!b.text.includes('Vu7Ts6Rq5Po4'))
  assert.deepEqual(maskSecrets('the service role key is kept on the server'), { text: 'the service role key is kept on the server', count: 0 })
})

// ---------- 1.3.0: task inbox, role kit check, shared company rules ----------
import {
  INBOX_EVERY_MS, INBOX_SECTION, KIT_MARK, ROLE_KITS, ROLES, dayOf, founderEmailOf, inboxDue, isMachauChatTool, kitCheck, kitSection, kitStateFor,
  kitToldIn, readProfile, roleFrom, roleOf, techDeskOf,
} from './lib.ts'
import { RULES_LINES, rulesSection } from './rules.ts'

test('a person picks a role with "my role is ..." and only a known role counts', () => {
  assert.equal(roleFrom('my role is marketing'), 'marketing')
  assert.equal(roleFrom('My role is Customer Care.'), 'customer care')
  assert.equal(roleFrom('my role is astronaut'), undefined)
  assert.equal(roleFrom('the marketing role is mine'), undefined)
  assert.equal(roleOf('tech\nmarketing\n'), 'marketing')
  assert.equal(roleOf(''), undefined)
})

test('every role has a kit, and every kit has Machau Chat for the inbox', () => {
  for (const r of ROLES) {
    assert.ok(ROLE_KITS[r].includes('machau-chat'), r)
    assert.ok(ROLE_KITS[r].length >= 2, r)
  }
})

test('the kit check reads one day of stamps: missing, due and already reported', () => {
  const day = '2026-11-26'
  const file = [`ok ${day} machau-chat`, `ok 2026-11-25 engage`, `told ${day} engage`, 'garbage line'].join('\n')
  const st = kitStateFor(file, day)
  assert.deepEqual([...st.ok], ['machau-chat'], 'yesterday does not count')
  assert.deepEqual([...st.told], ['engage'])
  const c = kitCheck('marketing', ['mcp__machau-chat__list_tasks', 'mcp__company-brain-cloud__brain_ask'], st)
  assert.deepEqual(c.missing, ['engage'])
  assert.deepEqual(c.due, ['company-brain-cloud'])
  assert.deepEqual(c.told, ['engage'])
})

test('a kit whose connectors all answered today has no section; a failing one gets the desk and the one line', () => {
  const day = '2026-11-26'
  const all = ROLE_KITS.accounts.map(s => `ok ${day} ${s}`).join('\n')
  const tools = ROLE_KITS.accounts.map(s => `mcp__${s}__ping`)
  assert.equal(kitSection('accounts', kitCheck('accounts', tools, kitStateFor(all, day)), 'x'), undefined)
  const none = kitSection('tech', kitCheck('tech', ['mcp__machau-chat__list_tasks'], kitStateFor('', day)), 'the founder')
  assert.ok(none?.includes('Not connected in this session: company-brain-cloud, aws-mcp, plugin_cloudflare_cloudflare.'))
  assert.ok(none?.includes(KIT_MARK + ' connector not working: <connector>.'))
  assert.ok(none?.includes('connector not working: <connector> connector') === false)
  assert.ok(none?.includes('Tech & Access has been told'))
  assert.ok(none?.includes('the founder'))
})

test('the desk hears about a connector once: the kit-check message is recognised', () => {
  assert.equal(kitToldIn(`{"text":"${KIT_MARK} connector not working: engage. The list call timed out"}`), 'engage')
  assert.equal(kitToldIn('an ordinary message about engage'), undefined)
  assert.equal(kitToldIn(`${KIT_MARK} connector not working: plugin_cloudflare_cloudflare. denied`), 'plugin_cloudflare_cloudflare')
})

test('the inbox is checked at most every 30 minutes, and only where its task tools are', () => {
  const t0 = 1_000_000
  assert.equal(inboxDue(t0, t0 + INBOX_EVERY_MS - 1), false)
  assert.equal(inboxDue(t0, t0 + INBOX_EVERY_MS), true)
  assert.equal(isMachauChatTool('mcp__machau-chat__list_tasks', 'list_tasks'), true)
  assert.equal(isMachauChatTool('mcp__machau-chat-sid__list_tasks', 'list_tasks'), false)
  assert.ok(INBOX_SECTION.includes('list_tasks') && INBOX_SECTION.includes('update_task') && INBOX_SECTION.includes('proof'))
})

test('the founder address and the desk come from the profile, never from the code', () => {
  const p = readProfile('﻿{"founderEmail":"  f@example.com ","desks":{"techAccess":"chat-42"}}')
  assert.equal(founderEmailOf(p), 'f@example.com')
  assert.equal(techDeskOf(p), 'the Machau Chat chat chat-42')
  assert.equal(founderEmailOf(readProfile('{"founderEmail":"not an address"}')), undefined)
  assert.equal(techDeskOf(readProfile('nonsense')), "the founder's one-to-one chat in Machau Chat")
  assert.equal(dayOf(new Date(2026, 10, 6)), '2026-11-06')
})

test('the company rules are short, and name the founder address only when one is set', () => {
  assert.ok(RULES_LINES.length >= 7 && RULES_LINES.length <= 14)
  const set = rulesSection('f@example.com')
  assert.ok(set.includes('f@example.com'))
  assert.ok(!set.includes('{FOUNDER}'))
  assert.ok(rulesSection(undefined).includes('ask before you send one'))
  assert.ok(set.includes('Read the last 3 days of a chat'))
  assert.ok(set.length < 2200, 'short enough for every session')
})

// ---------- heartbeat (1.4.0) ----------
import { heartbeatBody as hbBody, heartbeatDue as hbDue, istDayOf as hbDay } from './lib.ts'
test('heartbeat is sent at most once a day, and only with a member id', () => {
  assert.equal(hbDue(undefined, '2026-11-27', 'member-a'), true)
  assert.equal(hbDue('2026-11-27', '2026-11-27', 'member-a'), false)
  assert.equal(hbDue('2026-11-26', '2026-11-27', 'member-a'), true)
  assert.equal(hbDue(undefined, '2026-11-27', undefined), false)
  assert.equal(hbDue(undefined, '2026-11-27', 'Not A Valid Id!'), false)
})
test('heartbeat body carries only the agreed fields', () => {
  const body = JSON.parse(hbBody({ member: 'member-a', version: '1.4.0', os: 'mac', pieces: ['secretMask'], lastActive: '2026-11-26T19:00:00+05:30' }))
  assert.deepEqual(Object.keys(body).sort(), ['last_active', 'member', 'os', 'pieces', 'plugin_version'])
  assert.deepEqual(body.pieces, ['secretMask'])
})
test('the India calendar day is used for the heartbeat', () => {
  assert.equal(hbDay(new Date('2026-11-26T19:30:00Z')), '2026-11-27')
  assert.equal(hbDay(new Date('2026-11-26T10:00:00Z')), '2026-11-26')
})

// ---------- work record (1.4.1) ----------
import { looksLikeCorrection as lc, scrubText as scrub, recordBody as rb } from './lib.ts'
test('a correction is recognised from the start of a short prompt only', () => {
  assert.equal(lc('no, that is the wrong file'), true)
  assert.equal(lc('undo that'), true)
  assert.equal(lc('please add a chart to the report'), false)
  assert.equal(lc('no'.repeat(120)), false)
})
test('scrubbing removes contact details and key-like strings', () => {
  const out = scrub('mail test@example.com phone 9876543210 key sk_test_abcdefghijklmnop order 123456789012')
  assert.equal(out.includes('@'), false)
  assert.equal(out.includes('9876543210'), false)
  assert.equal(out.includes('sk_test'), false)
  assert.equal(out.includes('123456789012'), false)
})

// ---------- 1.4.2: the same scrub examples as the collector, and enrolment ----------
import { areaFromFolder as areaOf, enrolCodeIn as codeIn, readCollector as readCol } from './lib.ts'
test('scrub removes pasted secrets, phone numbers and customer identifiers (same examples as the collector)', () => {
  const must: Array<[string, string[]]> = [
    ['call 9876543210 now', ['9876543210']], ['call +91 98765 43210 now', ['98765', '43210']], ['call 987-654-3210', ['987-654-3210']],
    ['UK +44 7911 123456', ['7911 123456']],
    ['key sk-abcdefghijklmnop1234567890', ['sk-abcdefghijklmnop1234567890']], ['AWS AKIAIOSFODNN7EXAMPLE', ['AKIAIOSFODNN7EXAMPLE']],
    ['password is hunter2secret', ['hunter2secret']], ['PASSWORD=Tr0ub4dor&3', ['Tr0ub4dor']],
    ['Authorization: Bearer abcdefghijklmnop12345', ['abcdefghijklmnop12345']], ['postgres://admin:s3cr3tpw@db.example.com/x', ['s3cr3tpw']],
    ['mail ravi.kumar@example.com please', ['ravi.kumar']], ['PAN ABCDE1234F', ['ABCDE1234F']], ['GST 27ABCDE1234F1Z5', ['27ABCDE1234F1Z5']],
    ['Aadhaar 1234 5678 9012', ['1234 5678 9012']], ['card 4111 1111 1111 1111', ['4111 1111 1111 1111']], ['account 123456789012', ['123456789012']],
  ]
  for (const [input, secrets] of must) { const out = scrub(input); for (const x of secrets) assert.ok(!out.includes(x), `"${x}" survived in: ${out}`) }
  const plain = 'Fixed the cart shelf on the PDP, 3 corrections, order BS1042 still open for Monday.'
  assert.equal(scrub(plain), plain)
})
test('enrolment code is heard only when typed as the whole message', () => {
  assert.equal(codeIn('machau enrol abcdefghijklmnop'.replace('abcdefghijklmnop', 'ABCDEFGHIJKLMNOP')), 'ABCDEFGHIJKLMNOP')
  assert.equal(codeIn('  Machau Enrol abcdefghijklmnop '), 'ABCDEFGHIJKLMNOP')
  assert.equal(codeIn('please machau enrol ABCDEFGHIJKLMNOP now'), undefined)
  assert.equal(codeIn('machau enrol short'), undefined)
})
test('collector file: the last good line wins, bad lines are ignored', () => {
  const tok = 'a'.repeat(43)
  assert.deepEqual(readCol(`{"member":"old-one","token":"${tok}"}\nnot json\n{"member":"sid","token":"${tok}"}\n`), { member: 'sid', token: tok })
  assert.equal(readCol('{"member":"Bad Name","token":"x"}'), undefined)
  assert.equal(readCol(''), undefined)
})
test('area from the folder keeps only the last folder name', () => {
  assert.equal(areaOf('/Users/ravi/MBP/projects/marketing-ads-crm'), 'marketing-ads-crm')
  assert.equal(areaOf('C:\\Users\\Saloni\\Work\\bamboostan-app'), 'bamboostan-app')
})


// ---------- 1.5.0: the written record ----------
import { parseRecordReply as parseRec, recordDue as due, newStats as fresh, normaliseTopic as topicOf, recordBody as recBody, RECORD_ASK as ASK } from './lib.ts'
test('the written record is read from the reply, scrubbed, with a normalised topic', () => {
  const w = parseRec('RECORD {"task":"Fix courier booking for the order of ravi@example.com, phone 98765 43210","done":"Booking works; password is hunter2xyz was removed","left":"Cancel flow","area":"Sutra","topic":"Sutra courier booking fix","status":"finished"}')
  assert.ok(w && !('skip' in w))
  const r = w as Exclude<typeof w, { skip: true } | undefined>
  assert.ok(!/ravi|98765|hunter2/.test(JSON.stringify(r)), JSON.stringify(r))
  assert.equal(r.topic, 'sutra courier booking')
  assert.equal(r.status, 'finished')
})
test('skip, junk and empty replies make no record', () => {
  assert.deepEqual(parseRec('RECORD {"skip":true}'), { skip: true })
  assert.equal(parseRec('Sure! here you go'), undefined)
  assert.equal(parseRec('RECORD {"task":"","done":""}'), undefined)
  assert.equal(parseRec('RECORD {broken'), undefined)
})
test('a record is asked for after real work only, 3 per session, 15 minutes apart', () => {
  const st = fresh(); const t0 = 1_000_000_000_000
  assert.equal(due(st, t0), false)
  st.turns = 2; st.toolCalls = 2
  assert.equal(due(st, t0), true)
  st.lastAskAt = t0; st.toolCallsAtLast = 2
  assert.equal(due({ ...st, toolCalls: 20 }, t0 + 60_000), false)
  assert.equal(due({ ...st, toolCalls: 20 }, t0 + 16 * 60_000), true)
  assert.equal(due({ ...st, toolCalls: 20, records: 3 }, t0 + 99 * 60_000), false)
  assert.ok(ASK.includes('no customer names'))
})
test('the body has the written lines and counts, and no raw prompt or summary field', () => {
  const b = JSON.parse(recBody({ id: 'a1b2c3d4-0', member: 'sid', stats: { ...fresh(), startedAt: 0, turns: 3, toolCalls: 9 }, now: 120_000, written: { task: 't', done: 'd', left: 'l', area: 'x', topic: 'x y', status: 'open' } }))
  assert.deepEqual(Object.keys(b).sort(), ['area', 'corrections', 'done', 'id', 'kind', 'left', 'member', 'minutes', 'status', 'task', 'tool_calls', 'topic', 'turns'])
  assert.equal(b.minutes, 2)
})
test('topics drop filler words and keep six at most', () => assert.equal(topicOf('Fix the Sutra courier booking page for Delhivery and Bluedart extra words here'), 'sutra courier booking delhivery bluedart extra'))

// ---------- 1.8.0: report a problem ----------
import { isProblemReport as isProb, problemReportIssue as probIssue } from './lib.ts'
test('a [problem] report may hold order numbers and codes, never contact details or secrets', () => {
  assert.ok(isProb('[problem] Courier label wrong'))
  assert.ok(!isProb('hello [problem]'))
  const ok = '[problem] Wrong label\nTrying to do: print a label\nExample: order BS1042 and Amazon order 171-1234567-1234567\nCost: 3 orders a day'
  assert.equal(probIssue(ok), undefined)
  for (const bad of ['call the buyer on 98765 43210', 'mail ravi@example.com', 'key sk-abcdefghijklmnop1234567890', 'password is hunter2xyz']) assert.match(String(probIssue('[problem] x ' + bad)), /Remove it/)
})

// ---------- Company Brain short form and folder mark (Paramjeet, 28 Nov) ----------
import { folderMark as fMark, folderLine as fLine } from './lib.ts'
test('the folder tells which company a note belongs to, and whether it is private', () => {
  assert.deepEqual(fMark('/Users/sid/MBP'), { company: 'mbp', confidential: false })
  assert.deepEqual(fMark('/Users/sid/MBP/projects/tech-desk'), { company: 'mbp', confidential: false })
  assert.deepEqual(fMark('/Users/sid/MBP/private/projects/books'), { company: 'mbp', confidential: true })
  assert.deepEqual(fMark('C:\\Users\\Ravi\\MBP\\private'), { company: 'mbp', confidential: true })
  assert.deepEqual(fMark('/Users/sid/BIL/x'), { company: 'bil', confidential: false })
  assert.deepEqual(fMark('/Users/sid/Personal'), { company: 'personal', confidential: false })
  assert.deepEqual(fMark('/Users/ravi/Documents/work'), { confidential: false })
  assert.match(fLine(fMark('/Users/sid/BIL')), /never goes to this Company Brain/)
  assert.match(fLine(fMark('/Users/sid/Personal')), /Save no note/)
  assert.match(fLine(fMark('/Users/sid/MBP/private')), /company "mbp" and confidential true/)
})
test('the note form is the short one with task, kind, status and a company line', () => {
  const b = { capture: 'mcp__x__brain_department_capture' }
  const t = brainSection(b, fMark('/Users/sid/MBP'))
  for (const w of ['Next time:', 'task (the task in one line)', 'kind', 'status (done, open or waiting)', '1,500 characters', 'pass company "mbp"']) assert.ok(t.includes(w), w)
  assert.ok(!t.includes('3,000'))
})
