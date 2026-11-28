import type { Register } from 'claude-code'
import {
  CAPACITY, KEEP_ON_SHRINK, brainNudge, brainSection, brainTools, isBrainCapture, sharesWork, type BrainTools, ON_DEMAND_INDEX, PLAN_NONE, ROUTED_TYPES, ROUTE_LABELS, SIZE_NUDGE, VERSION, WRAP_TOOL, asksOverride, asksShrink, briefFor,
  capacityDeny, chromeDeny, decide, hasLine, hasLiveVerdict, holdReason, isClaudeInChrome, isDeployish, isPlaywright, lastNumberFor, liveClaim,
  maskSecrets, osDefaults, parseMacReading, parseWindowsReading, plainPrompt, planTick, playwrightDeny, routeFor, routeId, serversIn, shouldDefer,
  sizeMark, smartShrink, startKind, trimInstructions, trimSkills, trimToolList, worthShrinking,
  INBOX_NUDGE, INBOX_SECTION, ROLE_ASK, ROLE_KITS, dayOf, founderEmailOf, inboxDue, isMachauChatTool, kitCheck, kitSection, kitStateFor, kitToldIn,
  CONNECTORS_ASK, asksConnectors, connectorsSeen,
  isProblemReport, problemReportIssue,
  READ_FIRST, POLL_REFUSED, chatIdOfCall, isChatRead, isChatSend, tooShortWakeup,
  COLLECTOR_URL, RECORD_URL, ENROL_URL, enrolCodeIn, readCollector, heartbeatBody, heartbeatDue, istDayOf, looksLikeCorrection, recordBody, newStats, parseRecordReply, recordDue, RECORD_ASK, type RecordStats,
  KIT_SERVERS, readProfile, roleFrom, roleOf, splitMcp, techDeskOf, type KitState, type Profile, type Role,
} from './lib.ts'
import { rulesSection } from './rules.ts'
import { appendHome, detect, powershell, readHome, readMachine, text, within, type Os, type Run } from './host.ts'

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
  taskInbox: true, // Machau Chat tasks HQ gave this person: picked up at session start, and checked again after 30 idle minutes
  roleKitCheck: true, // the connectors of the person's role are checked once a day; a failing one is reported to Tech & Access
  companyRules: true, // the short company rules (hooks/rules.ts) are added to every session
  readThread: true, // a message to a chat you have not read in this session is held once, with a pointer to read it first
  pollGuard: true, // a timed wake-up under 20 minutes (polling) is refused; wait with a reply watch instead
  workRecord: true, // one short record per session (counts and a scrubbed note) to the team collector; no transcript
  heartbeat: true, // once a day: who has the plugin, its version, Mac or Windows, last use. No content (see COLLECTOR_URL)
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
// The person's profile (switches, founder address for payment emails, desks), read once per session.
let profileP: Promise<Profile> | undefined
const profile = ($: Run): Promise<Profile> =>
  (profileP ??= os($)
    .then(async o => readProfile(await readHome($, o, '.config/machau-mod/profile.json')))
    .catch(() => ({})))
let switches: Promise<Switches> | undefined
/** The switches for this person: the defaults (a few differ on Windows), changed by their profile file if they have one. */
const sw = ($: Run): Promise<Switches> =>
  (switches ??= Promise.all([os($), profile($)])
    .then(([o, p]) => {
      const own = p.switches as Partial<Switches> | undefined
      void record($, 'loaded', { version: VERSION, os: o, ownSwitches: own ? Object.keys(own) : [] })
      return { ...DEFAULTS, ...osDefaults(o), ...own }
    })
    .catch(() => DEFAULTS))

// Team pieces: the person's role (their own file, read once), this session's kit-check stamps (one state file, shared by
// the session and every later one on this computer), and the inbox.
const ROLE_FILE = '.config/machau-mod/role'
const KIT_FILE = `${STATE}/kit`
let roleP: Promise<Role | undefined> | undefined
const roleNow = ($: Run): Promise<Role | undefined> =>
  (roleP ??= os($).then(o => readHome($, o, ROLE_FILE)).then(f => roleOf(f)).catch(() => undefined))
let kitP: Promise<KitState> | undefined
const kitNow = ($: Run): Promise<KitState> =>
  (kitP ??= os($)
    .then(o => readHome($, o, KIT_FILE))
    .then(f => kitStateFor(f, dayOf(new Date())))
    .catch(() => ({ ok: new Set<string>(), told: new Set<string>() })))
const kitStamp = ($: Run, kind: 'ok' | 'told', server: string) =>
  os($).then(o => appendHome($, o, KIT_FILE, `${kind} ${dayOf(new Date())} ${server}`)).catch(() => {})

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

// Work record (1.4.1): per session, counts plus the scrubbed note saved to the Company Brain. Sent every 5 turns and when the
// note is saved. The token and member id are the heartbeat's: from the keychain (Mac) or MACHAU_COLLECTOR_TOKEN (Windows).
const COLLECTOR_FILE = '.config/machau-mod/collector.json'
/** Who this computer reports as: the file written by "machau enrol", else the profile's member id with a keychain (Mac) or environment (Windows) token. */
async function collectorAuth($: Run): Promise<{ member: string; token: string } | undefined> {
  const o = await os($)
  const enrolled = readCollector(await readHome($, o, COLLECTOR_FILE))
  if (enrolled) return enrolled
  const p = await profile($)
  if (!p.member || !/^[a-z0-9][a-z0-9-]{1,40}$/.test(p.member)) return undefined
  const token = o === 'mac'
    ? (await within($.process.run(['/bin/sh', '-c', 'security find-generic-password -s team-collector-token -w 2>/dev/null']).then(text), 8000, '')).trim()
    : (await within($.process.run(powershell('[Console]::Out.Write($env:MACHAU_COLLECTOR_TOKEN)')).then(text), 8000, '')).trim()
  return token ? { member: p.member, token } : undefined
}
/** One POST to the collector, with the token kept out of the process list (a file for curl, an environment variable for PowerShell). */
async function postCollector($: Run, url: string, token: string | undefined, body: string): Promise<string> {
  const o = await os($)
  if (o === 'mac') return String(await within($.process.run(['/bin/sh', '-c', 'if [ -n "$2" ]; then printf "authorization: Bearer %s" "$2" | /usr/bin/curl -s -m 10 -X POST "$1" -H @- -H "content-type: application/json" --data "$3"; else /usr/bin/curl -s -m 10 -X POST "$1" -H "content-type: application/json" --data "$3"; fi', 'machau-mod', url, token ?? '', body]).then(text), 12000, ''))
  const hdr = token ? `-Headers @{Authorization="Bearer $env:TOKEN"} ` : ''
  return String(await within($.process.run(powershell(`$env:TOKEN='${token ?? ''}'; Invoke-RestMethod -Method Post -Uri '${url}' ${hdr}-ContentType 'application/json' -Body '${body.replace(/'/g, "''")}' | ConvertTo-Json -Compress`)).then(text), 12000, ''))
}

let seenConnectors: string[] = [] // company connector names this session has, from the session's tool list
const chatsRead = new Set<string>() // chats whose messages this session has read
const recStats = new Map<string, RecordStats>()
let lastSession = ''
const RECORDS_LOG = '.local/state/machau-mod/records.jsonl'
async function sendRecord($: Run, sid: string, st: RecordStats, written: Parameters<typeof recordBody>[0]['written']) {
  const auth = await collectorAuth($)
  if (!auth) { void record($, 'workRecord', { sent: false, why: 'not enrolled' }); return }
  const p = await profile($)
  const o = await os($)
  const body = recordBody({ id: `${sid.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 70) || 'session'}-${st.records}`, member: auth.member, written: p.area ? { ...written, area: p.area } : written, stats: st, now: Date.now() })
  // What was sent in the person's name is kept on their own computer, and "machau records" prints the last few.
  await appendHome($, o, RECORDS_LOG, JSON.stringify({ at: new Date().toISOString(), ...JSON.parse(body) }))
  const sent = await postCollector($, RECORD_URL, auth.token, body)
  void record($, 'workRecord', { sent: /"ok":\s*true/.test(sent), n: st.records })
}
function statsFor(sid: string): RecordStats {
  let s = recStats.get(sid)
  if (!s) { s = newStats(); recStats.set(sid, s) }
  return s
}

// Heartbeat (1.4.0): at most once a day per computer, and only when the person has set a member id in their profile and a
// collector token is on this computer. Sends the fields in heartbeatBody and nothing else. The day is kept in a local file.
const HEART = '.local/state/machau-mod/heartbeat.txt'
async function heartbeat($: Run, set: Switches) {
  const o = await os($)
  const today = istDayOf(new Date())
  const last = (await readHome($, o, HEART)).trim().split('\n').pop()?.trim() || undefined
  const auth = await collectorAuth($)
  if (!auth || !heartbeatDue(last, today, auth.member)) return
  const body = heartbeatBody({ member: auth.member, version: VERSION, os: o, pieces: Object.keys(set).filter(k => (set as Record<string, unknown>)[k] === true), lastActive: new Date().toISOString(), connectors: seenConnectors })
  const sent = await postCollector($, COLLECTOR_URL, auth.token, body)
  if (/"ok":\s*true/.test(sent)) await appendHome($, o, HEART, today)
  void record($, 'heartbeat', { sent: /"ok":\s*true/.test(sent), os: o })
}

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
  // Team pieces: whether this session has shown the kit check and the role question, when the inbox was last checked,
  // and whether this session has Machau Chat's task tools at all.
  let kitShown = false
  let roleAsked = false
  let lastInbox = 0
  let inboxHere = false

  on('tool.check', async ($, e, next) => {
    if ((await sw($)).noClaudeInChrome && isClaudeInChrome(e.tool)) return { decision: 'deny', reason: chromeDeny((await os($)) === 'mac') }
    if ((await sw($)).noBlankChrome && isPlaywright(String(e.tool))) return { decision: 'deny', reason: playwrightDeny((await os($)) === 'mac') }
    return next(e)
  })

  // What the person typed, on its way in: "shrink this session" and "start it anyway" are heard here.
  on('prompt.submit', async ($, e, next) => {
    if (((e as { origin?: { kind?: string } }).origin?.kind ?? 'human') !== 'plugin' && typeof (e as { text?: unknown }).text === 'string' && looksLikeCorrection(String((e as { text?: unknown }).text)) && lastSession) statsFor(lastSession).corrections++
    // A prompt typed by the person has no origin, or human/user/sdk where the app or `claude -p` passes it in.
    // A plugin's own nudge and another session's message are left alone.
    const from = (e as { origin?: { kind?: string } }).origin?.kind
    const meta = e as { command?: unknown; isMeta?: unknown; text?: unknown }
    if (meta.command || meta.isMeta || (from !== undefined && !['human', 'user', 'sdk'].includes(from))) return next(e)
    const code = enrolCodeIn(String(meta.text ?? ''))
    if (code) {
      const o = await os($)
      const got = await postCollector($, ENROL_URL, undefined, JSON.stringify({ code })).catch(() => '')
      let ok: { ok?: boolean; member?: string; token?: string } = {}
      try { ok = JSON.parse(got) } catch { /* not json: the collector said no */ }
      if (ok.ok && ok.member && ok.token) {
        await appendHome($, o, COLLECTOR_FILE, JSON.stringify({ member: ok.member, token: ok.token }))
        if (o !== 'windows') void within($.process.run(['/bin/sh', '-c', 'chmod 600 "$HOME/$1"', 'machau-mod', COLLECTOR_FILE]).then(text), 5000, '')
        void record($, 'enrol', { ok: true, os: o })
        return next({ ...e, text: 'The machau-mod plugin has enrolled this computer for the team work record. Tell the person in one short line that it worked, and that from now on the plugin sends once a day: their name, plugin version, Mac or Windows and when Claude was last used; and one short record per finished piece of work: what area, a short scrubbed summary, and counts (turns, corrections, minutes). Never the conversation; passwords, keys, phone numbers, emails and customer details are removed first.' } as typeof e)
      }
      void record($, 'enrol', { ok: false })
      return next({ ...e, text: 'The machau-mod plugin could not enrol this computer: the code was not accepted (wrong, used or older than 7 days). Tell the person in one line and that HQ can give a new code.' } as typeof e)
    }
    if (/^\s*machau records\s*$/i.test(String(meta.text ?? ''))) {
      const o = await os($)
      const lines = (await readHome($, o, RECORDS_LOG)).trim().split('\n').filter(Boolean).slice(-5)
      return next({ ...e, text: lines.length ? `The person asked what the machau-mod plugin sent in their name. Show these records, newest last, each as task / done / left / area / status, and say they are all that was sent besides the daily heartbeat (name, version, computer, last use):\n${lines.join('\n')}` : 'The person asked what the machau-mod plugin sent in their name. Nothing has been sent from this computer yet.' } as typeof e)
    }
    if (asksConnectors(String(meta.text ?? ''))) return next({ ...e, text: CONNECTORS_ASK } as typeof e)
    const said = plainPrompt(String(meta.text ?? ''))
    if (lastSession === '') lastSession = (await $.session.id().catch(() => '')) || `p${Date.now().toString(36)}`
    wrappedThisTurn = false
    if ((await sw($)).sessionSize && asksShrink(said)) shrinkAsked = true
    if ((await sw($)).capacityGate && asksOverride(said)) {
      cap.overrideUntil = Date.now() + CAPACITY.override_ms
      void record($, 'capacityGate', { override: 'the person said so', minutes: CAPACITY.override_ms / 60_000 })
    }
    // "my role is marketing": kept in the person's own role file, one line, and used from now on.
    const picked = roleFrom(said)
    if (picked && (await sw($)).roleKitCheck) {
      roleP = Promise.resolve(picked)
      kitShown = false
      void os($).then(o => appendHome($, o, ROLE_FILE, picked)).catch(() => {})
      void record($, 'roleKitCheck', { picked })
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
    if ((await sw($)).workRecord) { lastSession = (await $.session.id().catch(() => '')) || lastSession || `p${Date.now().toString(36)}`; if (lastSession) statsFor(lastSession).toolCalls++ }
    if (tooShortWakeup(tool, e as Record<string, unknown>) && (await sw($)).pollGuard) {
      void record($, 'pollGuard', { refused: true })
      return { deny: POLL_REFUSED }
    }
    if (isChatSend(tool)) {
      const text = String((e as Record<string, unknown>).text ?? (e as { input?: { text?: unknown } }).input?.text ?? '')
      if (isProblemReport(text)) { const why = problemReportIssue(text); if (why) { void record($, 'reportProblem', { held: true }); return { deny: why } } }
    }
    if (isChatRead(tool)) { const c = chatIdOfCall(e as Record<string, unknown>); if (c) chatsRead.add(c) }
    else if (isChatSend(tool) && (await sw($)).readThread) {
      const c = chatIdOfCall(e as Record<string, unknown>)
      if (c && !chatsRead.has(c)) { chatsRead.add(c); void record($, 'readThread', { held: true }); return { deny: READ_FIRST } }
    }
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

    // Role kit check: a connector of the person's kit that answers is done for today; a kit-check message to the desk is
    // remembered, so the desk hears about one connector once a day.
    // Only calls to a kit's connectors, or the kit-check message, look at the role file (on Windows every look is a
    // slow PowerShell start, and ordinary calls must not wait for one).
    const kitServer = splitMcp(tool)?.[0]
    const told0 = isMachauChatTool(tool, 'send_message') ? kitToldIn(JSON.stringify(e)) : undefined
    if (e.agentId === undefined && (kitServer !== undefined && KIT_SERVERS.has(kitServer) || told0) && (await sw($)).roleKitCheck && !r.isError) {
      const server = kitServer
      const role = await roleNow($)
      if (server && role && ROLE_KITS[role].includes(server)) {
        const st = await kitNow($)
        if (!st.ok.has(server)) {
          st.ok.add(server)
          void kitStamp($, 'ok', server)
          void record($, 'roleKitCheck', { answered: server })
        }
      }
      const told = told0
      if (told) {
        const st = await kitNow($)
        if (!st.told.has(told)) {
          st.told.add(told)
          void kitStamp($, 'told', told)
          void record($, 'roleKitCheck', { told: told })
        }
      }
    }
    if (isBrainCapture(tool)) {
      // A saved note clears the count. A refusal that names the person's identity (an owner using the member tool is sent to
      // the other one, so only a missing department counts) stops the reminders for this session.
      if (!r.isError) { sharedSinceNote = 0;  }
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
    void record($, 'turn', { reason: e.reason, agent: e.agentId !== undefined, tools: lastSession ? statsFor(lastSession).toolCalls : 0 })
    if (e.agentId !== undefined || e.reason !== 'answer') return r
    const set = await sw($)
    if (set.heartbeat) void heartbeat($, set).catch(() => {})
    if (set.workRecord && lastSession) {
      const st = statsFor(lastSession)
      st.turns++
      if (st.awaiting) {
        // This reply is the written record the plugin asked Claude for: send it (scrubbed), once.
        st.awaiting = false
        const w = parseRecordReply(String(e.answer ?? ''))
        if (w && !('skip' in w)) { st.records++; st.toolCallsAtLast = st.toolCalls; void sendRecord($, lastSession, st, w).catch(err => record($, 'workRecord', { sent: false, error: String(err).slice(0, 160) })) }
        return r
      }
      if (recordDue(st, Date.now()) && (await collectorAuth($))) { // only for people who enrolled
        st.awaiting = true
        st.lastAskAt = Date.now()
        void record($, 'workRecord', { asked: true, turns: st.turns, toolCalls: st.toolCalls })
        void $.prompt.submit({ text: RECORD_ASK }).catch(() => { st.awaiting = false })
        return r
      }
    }
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
    // Task inbox: the mod cannot wake an idle session, so the check rides on the end of a turn, at most every 30 minutes.
    if (set.taskInbox && inboxHere && inboxDue(lastInbox, Date.now())) {
      lastInbox = Date.now()
      return nudge('taskInbox', { checked: true }, INBOX_NUDGE)
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
    // Company rules, the task inbox, and the role kit (the kit once per session, and once a day per connector).
    if (set.companyRules) sections = [...sections, { id: 'machau-mod:company-rules', text: rulesSection(founderEmailOf(await profile($))), scope: 'session' as const }]
    seenConnectors = connectorsSeen(e.tools)
    inboxHere = set.taskInbox && e.tools.some(t => isMachauChatTool(t, 'list_tasks'))
    if (inboxHere) {
      if (lastInbox === 0) lastInbox = Date.now()
      sections = [...sections, { id: 'machau-mod:task-inbox', text: INBOX_SECTION, scope: 'session' as const }]
    }
    if (set.roleKitCheck && !kitShown) {
      const role: Role | undefined = await roleNow($)
      if (!role) {
        if (!roleAsked) {
          roleAsked = true
          sections = [...sections, { id: 'machau-mod:role-ask', text: ROLE_ASK, scope: 'session' as const }]
        }
      } else {
        const text = kitSection(role, kitCheck(role, e.tools, await kitNow($)), techDeskOf(await profile($)))
        if (text) {
          kitShown = true
          sections = [...sections, { id: 'machau-mod:role-kit', text, scope: 'session' as const }]
        }
      }
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
