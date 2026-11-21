import type { Register } from 'claude-code'
import {
  CAPACITY, KEEP_ON_SHRINK, brainNudge, brainSection, brainTools, isBrainCapture, sharesWork, type BrainTools, ON_DEMAND_INDEX, PLAN_NONE, ROUTED_TYPES, ROUTE_LABELS, SIZE_NUDGE, VERSION, WRAP_TOOL, asksOverride, asksShrink, briefFor,
  capacityDeny, chromeDeny, decide, hasLine, hasLiveVerdict, holdReason, isClaudeInChrome, isDeployish, isPlaywright, lastNumberFor, liveClaim,
  maskSecrets, osDefaults, parseMacReading, parseWindowsReading, plainPrompt, planTick, playwrightDeny, routeFor, routeId, serversIn, shouldDefer,
  sizeMark, smartShrink, startKind, trimInstructions, trimSkills, trimToolList, worthShrinking,
} from './lib.ts'
import { appendHome, detect, readHome, readMachine, within, type Os, type Run } from './host.ts'

// Machau's Claude mod: one small piece per recurring problem, each with a switch.
// Add a piece: write its logic in lib.ts with a test, hook it here, add a switch and a README line.
// These are the team defaults. A person changes them in ~/.config/machau-mod/profile.json, for example
// { "switches": { "liveGuard": true, "noClaudeInChrome": true } }; the file is read once per session.
const DEFAULTS = {
  liveGuard: false, // "it is live" after a merge/push/deploy needs a ship check that said LIVE (needs ~/os/bin/ship-check.py)
  noClaudeInChrome: false, // refuse Claude in Chrome; chrome.sh or the built-in browser instead
  noBlankChrome: true, // never a new logged-out Chrome window (Playwright); the person's own Chrome or the built-in browser
  secretMask: true, // keys and passwords in command output are masked before Claude and the transcript see them
  contextTrim: true, // heavy tools load on demand; tool names, connector instructions and skills lists are shortened
  modelRouting: true, // a helper started without a model gets Opus, Sonnet or Haiku by what its work needs
  planTick: true, // a task-list step that has shown as running for 8 tool calls gets a reminder to tick it
  sessionSize: true, // past 300k tokens, between tasks: save the working state; "shrink this session" shortens the history in place
  smartShrink: true, // a shrink keeps every word between the person and Claude and drops only old tool work
  autoShrink: true, // between tasks, past 300k tokens, shrink without asking when it removes 40% and 100k tokens
  capacityGate: true, // a session or helper start is held when the computer has no room left; fails open
  brainCapture: true, // with the Company Brain connected: ask it before changing shared work, save one note per finished task
}
type Switches = typeof DEFAULTS

// The mod keeps three small things under the person's home folder (on Windows: under %USERPROFILE%), through host.ts:
// their own switches (.config/machau-mod/profile.json), the scoreboard (.local/state/machau-mod/events.jsonl: one line
// each time a piece acts, never a secret and no reply text beyond the flagged sentence), and two marker files for the
// shrink. Mac or Windows is found once per session.
const STATE = '.local/state/machau-mod'
let osFound: Promise<Os> | undefined
const os = ($: Run): Promise<Os> => (osFound ??= detect($))
const record = ($: Run, piece: string, detail: unknown) =>
  os($)
    .then(o => appendHome($, o, `${STATE}/events.jsonl`, JSON.stringify({ at: new Date().toISOString(), piece, detail })))
    .catch(() => {}) // a guard never fails a turn over its own log
let switches: Promise<Switches> | undefined
/** The switches for this person: the defaults (a few differ on Windows), changed by their profile file if they have one. */
const sw = ($: Run): Promise<Switches> =>
  (switches ??= os($)
    .then(async o => {
      const out = await readHome($, o, '.config/machau-mod/profile.json')
      let own: Partial<Switches> | undefined
      try { own = out.trim() ? (JSON.parse(out.replace(/^\uFEFF/, '')) as { switches?: Partial<Switches> }).switches : undefined } catch { own = undefined }
      void record($, 'loaded', { version: VERSION, os: o, ownSwitches: own ? Object.keys(own) : [] })
      return { ...DEFAULTS, ...osDefaults(o), ...own }
    })
    .catch(() => DEFAULTS))

// Capacity check: when this session last started another, and until when the person's own word sets the check aside.
const cap = { lastStart: 0, overrideUntil: 0 }
/** Why this start is held, or undefined. Any failure, or no reading in time, allows the start and is logged. */
async function capacityHold($: Run, tool: string, e: unknown, isSession: boolean): Promise<string | undefined> {
  try {
    if (Date.now() < cap.overrideUntil) return undefined
    const o = await os($)
    if (o !== 'mac' && o !== 'windows') return undefined
    const out = await readMachine($, o, CAPACITY.timeout_ms[o])
    const reading = o === 'mac' ? parseMacReading(out) : parseWindowsReading(out)
    if (!reading) { void record($, 'capacityGate', { failOpen: 'no reading in time, or one that cannot be read', tool, os: o }); return undefined }
    const d = decide(reading)
    const kind = startKind(tool, e)
    const why = holdReason(d, kind, isSession, Date.now() - cap.lastStart)
    // Windows readings are all logged: its rules are not measured yet, and these lines are how they will be.
    if (why || o === 'windows') void record($, 'capacityGate', { ...(why ? { held: why } : { allowed: d.verdict }), kind, tool, os: o, free_pct: reading.free_pct, ram_gb: reading.ram_gb })
    if (why) return capacityDeny(why, kind)
    if (isSession) cap.lastStart = Date.now()
    return undefined
  } catch (err) {
    void record($, 'capacityGate', { failOpen: String(err).slice(0, 200), tool })
    return undefined
  }
}

const LIVE_NUDGE = (sentence: string) =>
  `Ship check guard (machau-mod): your reply said "${sentence}" but since the last merge, push or deploy command in this ` +
  'session no `~/os/bin/ship-check.py` run has returned VERDICT: LIVE. Run the ship check now, then say plainly ' +
  'whether it is live. If that sentence was about something that was already live before this session (from a record, ' +
  'not from this deploy), say so in one line and stop.'

export const register: Register = on => {
  // Live guard: the order of a deploy-like command, a LIVE verdict, and the deploy we already nudged about.
  let tick = 0
  let deployAt = 0
  let liveAt = 0
  let nudgedFor = 0
  let shipCheckStarted = false
  // Session size and shrink.
  let tokensNow = 0
  let lastMark = 0
  let markLoaded = false
  let shrinkAsked = false
  let shrunkHere = false
  let reopenChecked = false
  let wrappedThisTurn = false
  // Company Brain: its tools in this session (none: not connected), work shared since the last note, and whether the brain refused this person.
  let brain: BrainTools | undefined
  let sharedSinceNote = 0
  let brainRefused = false
  // Plan tick: the task list as last sent, and tool calls since it moved.
  let plan = PLAN_NONE
  // Context trim: connector instructions held back, and which loop already got which one.
  const held: Record<string, string> = {}
  const handedOver = new Set<string>()
  const savedOnce = new Set<string>()

  on('tool.check', async ($, e, next) => {
    if ((await sw($)).noClaudeInChrome && isClaudeInChrome(e.tool)) return { decision: 'deny', reason: chromeDeny((await os($)) === 'mac') }
    if ((await sw($)).noBlankChrome && isPlaywright(String(e.tool))) return { decision: 'deny', reason: playwrightDeny((await os($)) === 'mac') }
    return next(e)
  })

  // What the person typed, on its way in: "shrink this session" and "start it anyway" are heard here.
  on('prompt.submit', async ($, e, next) => {
    // A prompt typed by the person has no origin, or human/user/sdk where the app or `claude -p` passes it in.
    // A plugin's own nudge and another session's message are left alone.
    const from = (e as { origin?: { kind?: string } }).origin?.kind
    const meta = e as { command?: unknown; isMeta?: unknown; text?: unknown }
    if (meta.command || meta.isMeta || (from !== undefined && !['human', 'user', 'sdk'].includes(from))) return next(e)
    const said = plainPrompt(String(meta.text ?? ''))
    wrappedThisTurn = false
    if ((await sw($)).sessionSize && asksShrink(said)) shrinkAsked = true
    if ((await sw($)).capacityGate && asksOverride(said)) {
      cap.overrideUntil = Date.now() + CAPACITY.override_ms
      void record($, 'capacityGate', { override: 'the person said so', minutes: CAPACITY.override_ms / 60_000 })
    }
    return next(e)
  })

  // Smart shrink: whoever starts a compaction (the person's "shrink this session", /compact, or the engine at its
  // limit), the conversation is first reduced to what was said plus receipts for old tool work. If that alone makes it
  // small enough, it stands as it is and nothing is summarised; if it is still large, the engine summarises the lean version.
  const SHRUNK_ENOUGH = 600_000 // characters, roughly 150k tokens
  on('session.compact', async ($, e, next) => {
    if (!(await sw($)).smartShrink || e.agentId !== undefined) return next(e)
    if (e.trigger === 'precompute') return { skip: 'machau-mod shrinks the session itself when the time comes' }
    const lean = smartShrink(e.messages as never)
    if (!lean) return next(e)
    void record($, 'smartShrink', { trigger: e.trigger, before: lean.before, after: lean.after, toolCallsRemoved: lean.removed })
    // A shrink a hook hands back may not be written into the saved session, so a reopened session can come back whole.
    // Remember the session, and shrink it again after its first turn when it is reopened.
    const id = await $.session.id().catch(() => '')
    if (id && !shrunkHere) void os($).then(o => appendHome($, o, `${STATE}/shrunk`, id)).catch(() => {})
    shrunkHere = true
    tokensNow = 0 // the old size is stale now; the next reply reports the new one
    if (lean.after <= SHRUNK_ENOUGH) return { messages: lean.messages as never }
    return next({ ...e, messages: lean.messages as never })
  })

  on('session.measure', async ($, e, next) => {
    if (e.context.tokens) tokensNow = e.context.tokens
    if (!reopenChecked && tokensNow > 0 && (await sw($)).smartShrink) {
      reopenChecked = true
      const id = await $.session.id().catch(() => '')
      const was = id ? hasLine(await readHome($, await os($), `${STATE}/shrunk`), id) : false
      if (was && !shrunkHere && tokensNow > 200_000) shrinkAsked = true
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    if ((await sw($)).noClaudeInChrome && isClaudeInChrome(tool)) {
      void record($, 'noClaudeInChrome', tool)
      return { deny: chromeDeny((await os($)) === 'mac') }
    }
    if ((await sw($)).noBlankChrome && isPlaywright(tool)) {
      void record($, 'noBlankChrome', tool)
      return { deny: playwrightDeny((await os($)) === 'mac') }
    }

    // Capacity check: a new session (never one the person started from a card), or a helper.
    if ((await sw($)).capacityGate && e.agentId === undefined) {
      const isSession = tool === 'mcp__ccd_session__start_session' && !(e as { proposal_id?: string }).proposal_id
      if (isSession || tool === 'Agent') {
        const held = await capacityHold($, tool, e, isSession)
        if (held) return { deny: held }
      }
    }

    // Model routing for a separate session started without a model.
    let call = e
    const args = e as unknown as { model?: string; prompt?: string; title?: string; context?: string; proposal_id?: string }
    if ((await sw($)).modelRouting && tool === 'mcp__ccd_session__start_session' && !args.model && args.prompt && !args.proposal_id && args.context !== 'fork') {
      const label = await $.model.classify(briefFor(args.title ?? '', args.prompt), ROUTE_LABELS).catch(() => undefined)
      const route = routeFor(label)
      void record($, 'modelRouting', { kind: 'session', title: args.title, route })
      call = { ...e, model: routeId(route) } as typeof e
    }

    let r = await next(call)
    if (r.deny !== undefined) return r
    if (tool === WRAP_TOOL && e.agentId === undefined) wrappedThisTurn = true
    if (isBrainCapture(tool)) {
      // A saved note clears the count. A refusal that names the person's identity (an owner using the member tool is sent to
      // the other one, so only a missing department counts) stops the reminders for this session.
      if (!r.isError) sharedSinceNote = 0
      else if (/department|member_access_off|not permitted/i.test(String(r.text ?? '')) && !/requires_member_identity/.test(String(r.text ?? ''))) {
        brainRefused = true
        void record($, 'brainCapture', { refused: String(r.text ?? '').slice(0, 120) })
      }
    } else if (brain && tool === 'Bash' && !r.isError && sharesWork(String((e as { command?: unknown }).command ?? ''))) sharedSinceNote++

    if ((await sw($)).planTick && e.agentId === undefined) {
      const t = planTick(plan, tool, e)
      plan = t.state
      if (t.note) {
        void record($, 'planTick', { step: plan.current + 1, of: plan.steps.length, after: plan.since })
        r = { ...r, context: [...(r.context ?? []), t.note] }
      }
    }

    if ((await sw($)).liveGuard) {
      tick++
      const command = tool === 'Bash' ? String((e as { command?: unknown }).command ?? '') : ''
      // A LIVE verdict counts only from the ship check itself (or from reading its output after it was started),
      // never from some other tool's text that happens to hold the words.
      const isShipCheck = /\bship-check\b/.test(command)
      if (isShipCheck) shipCheckStarted = true
      // A Bash result keeps its output in result.stdout, not in text (missed until 13 Nov: a passed ship check was not seen).
      const out = r.result as { stdout?: unknown; stderr?: unknown } | undefined
      const seen = `${r.text ?? ''}\n${typeof out?.stdout === 'string' ? out.stdout : ''}\n${typeof out?.stderr === 'string' ? out.stderr : ''}`
      if (hasLiveVerdict(seen) && (isShipCheck || (shipCheckStarted && !command))) liveAt = tick
      // The ship check itself is never a deploy: one that has not said LIVE yet must not reset the guard.
      else if (!isShipCheck && (isDeployish(command) || tool === 'mcp__ccd_pr__set_auto_merge')) deployAt = tick
    }

    // Context trim: hand over a connector's held-back instructions when its tools are first looked up.
    if ((await sw($)).contextTrim && tool === 'ToolSearch' && !r.isError) {
      const loop = e.agentId ?? 'main'
      // The result is a list of tool references, not text: read the names from the record itself.
      const pages = serversIn(`${r.text ?? ''} ${JSON.stringify(r.result ?? '')}`)
        .filter(server => held[server] && !handedOver.has(`${loop}|${server}`))
        .map(server => (handedOver.add(`${loop}|${server}`), held[server]))
      if (pages.length > 0) {
        void record($, 'contextTrim', { handedOver: pages.length })
        r = { ...r, context: [...(r.context ?? []), `Instructions for the connector(s) you just looked up (held back until now by machau-mod):\n\n${pages.join('\n\n')}`] }
      }
    }

    if ((await sw($)).secretMask && tool === 'Bash') {
      if (r.isError) {
        const shown = maskSecrets(r.text ?? (typeof r.result === 'string' ? r.result : ''))
        if (shown.count === 0) return r
        void record($, 'secretMask', `${shown.count} in failed command output`)
        // A failed command's result has no editable shape, so the masked text goes back as the error itself.
        return { deny: shown.text }
      }
      const res = r.result as { stdout?: unknown; stderr?: unknown }
      const out = maskSecrets(typeof res?.stdout === 'string' ? res.stdout : '')
      const err = maskSecrets(typeof res?.stderr === 'string' ? res.stderr : '')
      const count = out.count + err.count
      if (count === 0) return r
      void record($, 'secretMask', `${count} in command output`)
      return {
        result: { ...(r.result as object), stdout: out.text, stderr: err.text } as typeof r.result,
        context: [
          ...(r.context ?? []),
          `machau-mod masked ${count} secret value(s) in this output. Never print secrets: pass them straight to a script, the Keychain or the clipboard.`,
        ],
        ...(r.isReadOnly ? { isReadOnly: true as const } : {}),
      }
    }
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId !== undefined || e.reason !== 'answer') return r
    const set = await sw($)
    // One nudge per turn end at most. Not awaited: a plugin's prompt runs once the session is idle, after this hook returns.
    const nudge = (piece: string, detail: unknown, text: string) => {
      void record($, piece, detail)
      void $.prompt.submit({ text }).catch(() => {})
      return r
    }
    // Shrinks the session in place. A terminal session compacts on the call; the app and `claude -p` run on the SDK,
    // where compaction only runs as a command. Either way the session.compact hook above does the shrinking.
    const shrinkNow = async (why: string) => {
      const done = (await $.session.compact({ instructions: KEEP_ON_SHRINK }).catch(err => ({ skip: String(err) }))) as { skip?: unknown } | undefined
      let how = 'compacted'
      if (done && done.skip) {
        how = 'ran the compact command'
        void ($ as unknown as { command: { run: (i: { command: string; args?: string }) => Promise<unknown> } }).command
          .run({ command: 'compact', args: KEEP_ON_SHRINK })
          .catch(err => record($, 'sessionSize', { shrinkFailed: String(err).slice(0, 300) }))
      }
      void record($, 'sessionSize', { shrink: how, why, at: tokensNow })
    }
    if (shrinkAsked) {
      shrinkAsked = false
      await shrinkNow('asked')
      return r
    }
    // Automatic: only between tasks (this turn wrapped up), only when big, and only when a dry run shows it is worth it.
    if (set.autoShrink && set.smartShrink && wrappedThisTurn && tokensNow >= 300_000) {
      const rows = await ($ as unknown as { session: { messages: () => Promise<unknown> } }).session.messages().catch(() => undefined)
      const lean = Array.isArray(rows) ? smartShrink(rows as never) : undefined
      if (lean && worthShrinking(lean.before, lean.after)) {
        await shrinkNow(`automatic: ${Math.round((1 - lean.after / lean.before) * 100)}% smaller`)
        return r
      }
    }
    if (set.liveGuard && deployAt > liveAt && nudgedFor !== deployAt) {
      const sentence = liveClaim(e.answer)
      if (sentence) {
        nudgedFor = deployAt
        return nudge('liveGuard', sentence, LIVE_NUDGE(sentence))
      }
    }
    if (set.brainCapture && brain && !brainRefused && sharedSinceNote > 0) {
      const shared = sharedSinceNote
      sharedSinceNote = 0 // one reminder per piece of shared work, whatever Claude answers
      return nudge('brainCapture', { reminded: true, shared }, brainNudge(brain))
    }
    if (set.sessionSize) {
      const id = await $.session.id().catch(() => '')
      if (!markLoaded) {
        markLoaded = true
        const saved = id ? lastNumberFor(await readHome($, await os($), `${STATE}/size-marks`), id) : 0
        if (saved > lastMark) lastMark = saved
      }
      const mark = sizeMark(tokensNow, lastMark)
      if (mark !== undefined) {
        lastMark = mark
        if (id) void os($).then(o => appendHome($, o, `${STATE}/size-marks`, `${id} ${mark}`)).catch(() => {})
        return nudge('sessionSize', { tokens: tokensNow }, SIZE_NUDGE(tokensNow))
      }
    }
    return r
  })

  // ---------- context trim ----------
  on('tool.describe', async ($, e, next) => {
    const r = await next(e)
    return (await sw($)).contextTrim && shouldDefer(String(e.tool)) ? { ...r, isDeferred: true } : r
  })

  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    const set = await sw($)
    let sections = r.sections
    if (set.brainCapture) {
      brain = brainTools(e.tools)
      if (brain) sections = [...sections, { id: 'machau-mod:company-brain', text: brainSection(brain), scope: 'session' as const }]
    }
    if (set.contextTrim) {
      const offered = ON_DEMAND_INDEX.filter(([key]) => e.tools.some(t => (key.endsWith('__') ? t.startsWith(key) : t === key)))
      if (offered.length > 0) {
        const text = [
          'Tools available on demand (not preloaded; load with ToolSearch, e.g. "select:Artifact", before first use):',
          ...offered.map(([, line]) => `- ${line}`),
        ].join('\n')
        sections = [...sections, { id: 'machau-mod:on-demand', text, scope: 'session' as const }]
      }
    }
    return sections === r.sections ? r : { sections }
  })

  on('prompt.attachment', async ($, e, next) => {
    const r = await next(e)
    if (!(await sw($)).contextTrim || r.text === null) return r
    const type = String((e as { type?: unknown }).type)
    let text = r.text
    if (type === 'deferred_tools_delta') text = trimToolList(r.text)
    else if (type === 'skill_listing') text = trimSkills(r.text)
    else if (type === 'mcp_instructions_delta') {
      const trimmed = trimInstructions(r.text, undefined, (await sw($)).noClaudeInChrome)
      Object.assign(held, trimmed.held)
      text = trimmed.text
    } else return r
    if (text.length >= r.text.length) return r
    if (!savedOnce.has(type)) {
      savedOnce.add(type)
      void record($, 'contextTrim', { list: type, from: r.text.length, to: text.length })
    }
    return { text }
  })

  // ---------- model routing ----------
  on('agent.spawn', async ($, e, next) => {
    if (!(await sw($)).modelRouting || e.fork || e.resume) return next(e)
    if (e.model) {
      void record($, 'modelRouting', { kind: 'agent', type: e.subagentType, chosenByClaude: e.model })
      return next(e)
    }
    if (!ROUTED_TYPES.has(e.subagentType)) return next(e)
    const label = await $.model.classify(briefFor(e.description, e.prompt), ROUTE_LABELS).catch(() => undefined)
    const route = routeFor(label)
    void record($, 'modelRouting', { kind: 'agent', type: e.subagentType, task: e.description, route, parent: e.parentModel })
    return next({ ...e, model: route })
  })
}
