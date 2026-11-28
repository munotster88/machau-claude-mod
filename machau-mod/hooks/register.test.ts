// Run: node --test hooks/register.test.ts   (Node 22.6+ reads TypeScript directly)
// Drives the mod's hooks the way the engine does, with a stand-in for `$` that runs the real commands on this
// computer (home folder pointed at a scratch folder) and a canned reading of memory where a test needs one.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const WIN = process.platform === 'win32'
const MAC = process.platform === 'darwin'
type Handler = (dollar: unknown, e: Record<string, unknown>, next: (e: Record<string, unknown>) => Promise<Record<string, unknown>>) => Promise<Record<string, unknown>>

/** A fresh copy of the mod with its own scratch home folder. `reading` replaces the computer's real memory reading. */
async function load(reading?: () => string) {
  const home = mkdtempSync(join(tmpdir(), 'machau-mod-reg-'))
  const env = { ...process.env, HOME: home, USERPROFILE: home }
  const sent: string[] = []
  const commands: unknown[] = []
  let compacts = 0
  const isReading = (argv: readonly string[]) =>
    argv.some(a => a.includes('hw.memsize')) || (argv[0] === 'powershell.exe' && Buffer.from(argv[argv.length - 1], 'base64').toString('utf16le').includes('Win32_OperatingSystem'))
  const $ = {
    process: {
      run: (argv: readonly string[]) =>
        reading && isReading(argv)
          ? Promise.resolve({ stdout: reading() })
          : new Promise((res, rej) => execFile(argv[0], argv.slice(1), { env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => (err ? rej(err) : res({ stdout })))),
    },
    session: { id: async () => 'sess-1', messages: async () => [], compact: async () => (compacts++, { skip: 'runs as a command here' }) },
    command: { run: async (i: unknown) => void commands.push(i) },
    prompt: { submit: async (i: { text: string }) => void sent.push(i.text) },
    model: { classify: async () => undefined },
  }
  const hooks: Record<string, Handler> = {}
  const mod = await import(`./register.ts?fresh=${Math.random()}`)
  mod.register(((name: string, fn: Handler) => void (hooks[name] = fn)) as never)
  const call = (name: string, e: Record<string, unknown>, result: Record<string, unknown> = {}) => hooks[name]($, e, async () => result)
  const log = () => {
    const f = join(home, '.local', 'state', 'machau-mod', 'events.jsonl')
    return existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as { piece: string; detail: Record<string, unknown> }) : []
  }
  /** The log is written without waiting (one short command per line), so a test waits for the lines it expects. */
  type Line = { piece: string; detail: Record<string, unknown> }
  const logged = async (piece: string, enough: (lines: Line[]) => boolean = lines => lines.length > 0) => {
    let hit: Line[] = []
    for (let i = 0; i < 200; i++) {
      hit = log().filter(l => l.piece === piece)
      if (enough(hit)) return hit
      await new Promise(r => setTimeout(r, 100))
    }
    return hit
  }
  return { hooks, call, sent, commands, compacts: () => compacts, home, log, logged }
}
const FULL = WIN ? 'ram_kb 16000000\r\nfree_kb 800000\r\ncores 8\r\n' : 'ram 17179869184\ncores 10\nfree System-wide memory free percentage: 9%\nswap total = 0M  used = 0.00M  free = 0M\nload { 1.0 1.0 1.0 }\n@@ps\n'
const ROOMY = WIN ? 'ram_kb 16000000\r\nfree_kb 9000000\r\ncores 8\r\n' : 'ram 17179869184\ncores 10\nfree System-wide memory free percentage: 70%\nswap total = 0M  used = 0.00M  free = 0M\nload { 1.0 1.0 1.0 }\n@@ps\n'
const bash = { result: { stdout: 'hello', stderr: '' } }

test('every hook the engine calls is registered, and the first one logs which computer this is', async () => {
  const m = await load()
  for (const h of ['tool.check', 'prompt.submit', 'session.compact', 'session.measure', 'tool.call', 'turn.complete', 'tool.describe', 'prompt.compose', 'prompt.attachment', 'agent.spawn'])
    assert.equal(typeof m.hooks[h], 'function', h)
  await m.call('tool.describe', { tool: 'Bash' }, {})
  const [first] = await m.logged('loaded')
  assert.ok(first, 'the loaded line is written')
  assert.equal(first.detail.os, WIN ? 'windows' : MAC ? 'mac' : 'linux')
  assert.equal(first.detail.version, JSON.parse(readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8')).version)
})

test('a task-list step that runs long gets one reminder, and secrets are still masked', async () => {
  const m = await load()
  const items = [{ content: 'Read the code', status: 'in_progress' }, { content: 'Build', status: 'pending' }, { content: 'Test', status: 'pending' }]
  await m.call('tool.call', { tool: 'mcp__ccd_turn__update_plan', items }, {})
  let last: Record<string, unknown> = {}
  for (let i = 0; i < 8; i++) {
    last = await m.call('tool.call', { tool: 'Bash', command: 'echo hello' }, bash)
    if (i < 7) assert.equal(last.context, undefined, `no reminder at call ${i + 1}`)
  }
  assert.match(String((last.context as string[])[0]), /Task list \(machau-mod\).*step 1 of 3/)
  assert.equal((await m.logged('planTick')).length, 1)
  // a helper's own tool calls never count
  for (let i = 0; i < 30; i++) assert.equal((await m.call('tool.call', { tool: 'Bash', command: 'x', agentId: 'a1' }, bash)).context, undefined)
  const secret = `shpat_${'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6'}`
  const masked = await m.call('tool.call', { tool: 'Bash', command: 'cat .env' }, { result: { stdout: `TOKEN=${secret}`, stderr: '' } })
  assert.ok(!JSON.stringify(masked).includes(secret))
})

test('a full computer holds a new session and a helper; the person saying "start it anyway" lets them go', { skip: !WIN && !MAC }, async () => {
  const m = await load(() => FULL)
  const start = { tool: 'mcp__ccd_session__start_session', prompt: 'Read the log and report', title: 'Log check' }
  const held = await m.call('tool.call', start, { ok: true })
  assert.match(String(held.deny), /Capacity check \(machau-mod\).*full: only \d+% of memory is free/)
  assert.match(String((await m.call('tool.call', { tool: 'Agent', subagent_type: 'Explore', prompt: 'find x' }, { ok: true })).deny), /Capacity check/)
  // a card the person clicked is theirs to start
  assert.equal((await m.call('tool.call', { ...start, proposal_id: 'p1' }, { ok: true })).deny, undefined)
  // Claude typing the words is not the person: a plugin's or another session's prompt is left alone
  await m.call('prompt.submit', { text: 'start it anyway', origin: { kind: 'plugin' } }, {})
  assert.match(String((await m.call('tool.call', start, { ok: true })).deny), /Capacity check/)
  await m.call('prompt.submit', { text: 'ok, start it anyway', origin: { kind: 'human' } }, {})
  assert.equal((await m.call('tool.call', start, { ok: true })).deny, undefined)
  const both = (lines: { detail: Record<string, unknown> }[]) => lines.some(l => typeof l.detail.held === 'string') && lines.some(l => Boolean(l.detail.override))
  assert.ok(both(await m.logged('capacityGate', both)))
})

test('with room, the first session starts and a second one inside 90 seconds waits', { skip: !WIN && !MAC }, async () => {
  const m = await load(() => ROOMY)
  const start = { tool: 'mcp__ccd_session__start_session', prompt: 'Read the log and report', title: 'Log check' }
  assert.equal((await m.call('tool.call', start, { ok: true })).deny, undefined)
  assert.match(String((await m.call('tool.call', start, { ok: true })).deny), /stagger: another session started less than 90s ago/)
  assert.equal((await m.call('tool.call', { tool: 'Agent', subagent_type: 'Explore', prompt: 'find x' }, { ok: true })).deny, undefined) // helpers are not staggered
})

test('a reading that cannot be read never blocks a start', { skip: !WIN && !MAC }, async () => {
  const m = await load(() => 'garbage')
  assert.equal((await m.call('tool.call', { tool: 'mcp__ccd_session__start_session', prompt: 'Fix the bug', title: 'Fix' }, { ok: true })).deny, undefined)
  const failedOpen = (lines: { detail: Record<string, unknown> }[]) => lines.some(l => Boolean(l.detail.failOpen))
  assert.ok(failedOpen(await m.logged('capacityGate', failedOpen)))
})

test('a big session is asked once to save its state, and "shrink this session" shrinks it', async () => {
  const m = await load()
  await m.call('session.measure', { context: { tokens: 310_000 } }, {})
  await m.call('turn.complete', { reason: 'answer', answer: 'Done.' }, {})
  assert.equal(m.sent.length, 1)
  assert.match(m.sent[0], /Session size \(machau-mod\).*310k tokens/)
  await m.logged('sessionSize')
  await m.call('turn.complete', { reason: 'answer', answer: 'Done again.' }, {})
  assert.equal(m.sent.length, 1) // told once per mark
  for (let i = 0; i < 100 && !existsSync(join(m.home, '.local', 'state', 'machau-mod', 'size-marks')); i++) await new Promise(r => setTimeout(r, 100))
  assert.match(readFileSync(join(m.home, '.local', 'state', 'machau-mod', 'size-marks'), 'utf8'), /^sess-1 300000\r?\n$/)
  await m.call('prompt.submit', { text: 'shrink this session', origin: { kind: 'human' } }, {})
  await m.call('turn.complete', { reason: 'answer', answer: 'Shrinking.' }, {})
  assert.equal(m.compacts(), 1)
  assert.deepEqual(m.commands.map(c => (c as { command: string }).command), ['compact']) // the app runs compaction as a command
})

test('a compaction keeps the conversation and drops old tool output', async () => {
  const m = await load()
  const big = 'x'.repeat(5000)
  const turn = (n: number) => [
    { role: 'user', text: `Question ${n}`, toolUses: [], handle: `u${n}` },
    { role: 'assistant', text: '', toolUses: [{ name: 'Bash', input: { command: 'ls', description: `List ${n}` } }], handle: `a${n}` },
    { role: 'user', text: '', toolUses: [], toolResults: [{ text: big }], handle: `r${n}` },
    { role: 'assistant', text: `Answer ${n}`, toolUses: [], handle: `c${n}` },
  ]
  const messages = [1, 2, 3, 4, 5].flatMap(turn)
  const out = await m.call('session.compact', { trigger: 'manual', messages }, { passedOn: true })
  const kept = (out.messages as { text: string }[]).map(x => x.text).join('\n')
  for (const n of [1, 2, 3, 4, 5]) assert.ok(kept.includes(`Question ${n}`) && kept.includes(`Answer ${n}`))
  assert.ok(kept.includes('machau-mod shrink') && kept.includes('Bash: List 1'))
  assert.ok(JSON.stringify(out.messages).length < JSON.stringify(messages).length * 0.75)
  assert.deepEqual(await m.call('session.compact', { trigger: 'precompute', messages }, {}), { skip: 'machau-mod shrinks the session itself when the time comes' })
  assert.deepEqual(await m.call('session.compact', { trigger: 'manual', messages, agentId: 'a1' }, { passedOn: true }), { passedOn: true }) // a helper's is left alone
  for (let i = 0; i < 100 && !existsSync(join(m.home, '.local', 'state', 'machau-mod', 'shrunk')); i++) await new Promise(r => setTimeout(r, 100))
  assert.equal(readFileSync(join(m.home, '.local', 'state', 'machau-mod', 'shrunk'), 'utf8').trim(), 'sess-1')
})

test('with the Company Brain connected: Claude is told about it, and reminded once after work is pushed', async () => {
  const m = await load()
  const none = await m.call('prompt.compose', { tools: ['Bash', 'Read'] }, { sections: [] })
  assert.equal((none.sections as { id: string }[]).filter(x => x.id === 'machau-mod:company-brain').length, 0) // not connected: nothing is said
  await m.call('tool.call', { tool: 'Bash', command: 'git push' }, bash)
  await m.call('turn.complete', { reason: 'answer', answer: 'Pushed.' }, {})
  assert.equal(m.sent.length, 0) // and nothing is asked
  const tools = ['Bash', 'mcp__company-brain-cloud__brain_ask', 'mcp__company-brain-cloud__brain_department_capture', 'mcp__company-brain-cloud__brain_capture_context']
  const composed = await m.call('prompt.compose', { tools }, { sections: [] })
  const section = (composed.sections as { id: string; text: string }[]).find(x => x.id === 'machau-mod:company-brain')!
  assert.match(section.text, /mcp__company-brain-cloud__brain_department_capture/)
  // an edit alone is not shared work
  await m.call('tool.call', { tool: 'Edit', file_path: '/x/a.ts' }, {})
  await m.call('turn.complete', { reason: 'answer', answer: 'Edited.' }, {})
  assert.equal(m.sent.length, 0)
  // pushed, no note: one reminder
  await m.call('tool.call', { tool: 'Bash', command: 'git commit -m fix && git push' }, bash)
  await m.call('turn.complete', { reason: 'answer', answer: 'Pushed.' }, {})
  assert.equal(m.sent.length, 1)
  assert.match(m.sent[0], /Company Brain \(machau-mod\).*still in flight/)
  await m.call('turn.complete', { reason: 'answer', answer: 'still in flight' }, {})
  assert.equal(m.sent.length, 1) // not asked again for the same push
  // pushed and noted in the same turn: no reminder
  await m.call('tool.call', { tool: 'Bash', command: 'gh pr merge 4 --squash' }, bash)
  await m.call('tool.call', { tool: 'mcp__company-brain-cloud__brain_department_capture', content: 'x' }, { result: { capture_id: 'c1' } })
  await m.call('turn.complete', { reason: 'answer', answer: 'Merged and noted.' }, {})
  assert.equal(m.sent.length, 1)
  // an owner sent to the other tool is not a refusal; a person with no department is, and reminders stop
  await m.call('tool.call', { tool: 'mcp__company-brain-cloud__brain_department_capture', content: 'x' }, { isError: true, text: 'department_capture_requires_member_identity' })
  await m.call('tool.call', { tool: 'Bash', command: 'git push' }, bash)
  await m.call('turn.complete', { reason: 'answer', answer: 'Pushed.' }, {})
  assert.equal(m.sent.length, 2)
  await m.call('tool.call', { tool: 'mcp__company-brain-cloud__brain_department_capture', content: 'x' }, { isError: true, text: 'A principal or requested department is not permitted' })
  await m.call('tool.call', { tool: 'Bash', command: 'git push' }, bash)
  await m.call('turn.complete', { reason: 'answer', answer: 'Pushed.' }, {})
  assert.equal(m.sent.length, 2)
})


// ---------- 1.3.0: company rules, task inbox, role kit check ----------
import { mkdirSync, writeFileSync } from 'node:fs'

test('every session gets the company rules; a person can switch them off in their profile', async () => {
  const on = await load()
  const r = await on.call('prompt.compose', { tools: ['Bash'] }, { sections: [] })
  assert.ok(r.sections.some((s: { id: string }) => s.id === 'machau-mod:company-rules'))
  const off = await load()
  mkdirSync(join(off.home, '.config', 'machau-mod'), { recursive: true })
  writeFileSync(join(off.home, '.config', 'machau-mod', 'profile.json'), JSON.stringify({ switches: { companyRules: false } }))
  const r2 = await off.call('prompt.compose', { tools: ['Bash'] }, { sections: [] })
  assert.ok(!r2.sections.some((s: { id: string }) => s.id === 'machau-mod:company-rules'))
})

test('a session with Machau Chat gets the inbox; without it, none', async () => {
  const m = await load()
  const without = await m.call('prompt.compose', { tools: ['Bash'] }, { sections: [] })
  assert.ok(!without.sections.some((s: { id: string }) => s.id === 'machau-mod:task-inbox'))
  const withChat = await m.call('prompt.compose', { tools: ['mcp__machau-chat__list_tasks', 'mcp__machau-chat__update_task'] }, { sections: [] })
  const inbox = withChat.sections.find((s: { id: string }) => s.id === 'machau-mod:task-inbox')
  assert.ok(inbox && String(inbox.text).includes('take my tasks'))
})

test('a person picks a role once; the kit is checked, and an answering connector is stamped for the day', async () => {
  const m = await load()
  await m.call('prompt.submit', { origin: { kind: 'human' }, text: 'my role is marketing' }, {})
  const picked = (await m.logged('roleKitCheck', lines => lines.some(l => l.detail.picked))).find(l => l.detail.picked)
  assert.equal(picked?.detail.picked, 'marketing')
  const tools = ['mcp__machau-chat__list_tasks', 'mcp__company-brain-cloud__brain_ask']
  const r = await m.call('prompt.compose', { tools }, { sections: [] })
  const kit = r.sections.find((s: { id: string }) => s.id === 'machau-mod:role-kit')
  assert.ok(kit, 'the kit check is shown to Claude')
  assert.ok(String(kit.text).includes('Not connected in this session: engage.'))
  await m.call('tool.call', { tool: 'mcp__machau-chat__list_tasks' }, { result: { stdout: '[]' } })
  const ok = (await m.logged('roleKitCheck', lines => lines.some(l => l.detail.answered))).find(l => l.detail.answered)
  assert.equal(ok?.detail.answered, 'machau-chat')
})

test('a kit-check message to the desk is remembered, so the desk hears about a connector once', async () => {
  const m = await load()
  await m.call('tool.call', { tool: 'mcp__machau-chat__send_message', text: '[machau-mod kit check] connector not working: engage. timed out' }, {})
  const told = (await m.logged('roleKitCheck', lines => lines.some(l => l.detail.told))).find(l => l.detail.told)
  assert.equal(told?.detail.told, 'engage')
})

test('team kit: a first message to a chat that was not read is held once; reading first, or a second try, lets it through', async () => {
  const m = await load()
  const first = await m.call('tool.call', { tool: 'mcp__machau-chat__send_message', chat_id: 'chat-1', text: 'hello' }, {})
  assert.match(String(first.deny), /read this chat/)
  assert.equal((await m.call('tool.call', { tool: 'mcp__machau-chat__send_message', chat_id: 'chat-1', text: 'hello' }, {})).deny, undefined) // said once
  await m.call('tool.call', { tool: 'mcp__machau-chat-sid__get_messages', chat_id: 'chat-2' }, {})
  assert.equal((await m.call('tool.call', { tool: 'mcp__machau-chat-sid__send_message', chat_id: 'chat-2', text: 'hi' }, {})).deny, undefined) // read first
})

test('team kit: a wake-up under 5 minutes, or under 20 about a chat, is refused; waits on a build or deploy and 20 minutes or more are allowed', async () => {
  const m = await load()
  assert.match(String((await m.call('tool.call', { tool: 'ScheduleWakeup', delaySeconds: 120, prompt: 'check the build' }, {})).deny), /polling/)
  assert.match(String((await m.call('tool.call', { tool: 'ScheduleWakeup', delaySeconds: 600, prompt: 'check if Sid has replied in the chat' }, {})).deny), /polling/)
  assert.equal((await m.call('tool.call', { tool: 'ScheduleWakeup', delaySeconds: 600, prompt: 'check the deploy finished' }, {})).deny, undefined) // a build or deploy is not a person
  assert.equal((await m.call('tool.call', { tool: 'ScheduleWakeup', delaySeconds: 1500, prompt: 'check the chat' }, {})).deny, undefined)
})
