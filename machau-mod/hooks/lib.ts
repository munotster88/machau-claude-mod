// Pure logic for machau-mod, kept apart from the hooks so `node --test hooks/lib.test.ts` can check it.

// ---------- secret mask ----------
// High-precision shapes only: a wrong mask hides something Claude needs to read.
const SECRET_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g],
  ['shopify', /\bshp(?:at|ca|pa|ss)_[A-Fa-f0-9]{32}\b/g],
  ['aws-key-id', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ['github', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/g],
  ['anthropic', /\bsk-ant-[A-Za-z0-9_-]{20,}/g],
  ['openai', /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/g],
  ['slack', /\bxox[abprs]-[A-Za-z0-9-]{10,}/g],
  ['live-key', /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/g],
  ['google', /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ['supabase', /\bsb_secret_[A-Za-z0-9_-]{20,}/g], // a service-role key printed from a server's settings got through (24 Nov 2026)
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
]
// user:password@host in a connection string: mask the password only.
const URL_PASSWORD = /\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)([^\s@/]{6,})(@)/gi
// name = value, where the name says secret and the value looks random (letters and digits, 20+, no dots or brackets).
const NAMED_SECRET =
  /\b((?:[A-Za-z0-9_]*(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|service[_-]?role[_-]?key)[A-Za-z0-9_]*)["']?\s*[=:]\s*["']?)((?=[A-Za-z0-9+\/_-]*[0-9])(?=[A-Za-z0-9+\/_-]*[A-Za-z])[A-Za-z0-9+\/_-]{20,}={0,2})(?![A-Za-z0-9.(\[])/gi

const stub = (value: string, kind: string) => `${value.slice(0, 4)}…[${kind} masked by machau-mod]`

export function maskSecrets(text: string): { text: string; count: number } {
  let count = 0
  let out = text
  for (const [kind, re] of SECRET_PATTERNS) {
    out = out.replace(re, m => (count++, stub(m, kind)))
  }
  out = out.replace(URL_PASSWORD, (_m, a: string, _pw: string, c: string) => (count++, `${a}…[password masked by machau-mod]${c}`))
  out = out.replace(NAMED_SECRET, (m, name: string, value: string) =>
    value.includes('masked by machau-mod') ? m : (count++, `${name}${stub(value, 'secret')}`))
  return { text: out, count }
}

// ---------- live-claim guard ----------
// A command that merges, pushes or deploys: after one, "it is live" needs a ship check.
const DEPLOYISH = /\bgh\s+pr\s+merge\b|\bgit\s+push\b|\bship-check\b|\b(?:deploy|update-service|create-deployment|create-invalidation)\b/i
export const isDeployish = (command: string) => DEPLOYISH.test(command)

export const hasLiveVerdict = (text: string) => /\bVERDICT:\s*LIVE\b/.test(text)

const CLAIM =
  /\b(?:is|are|now|went|gone|goes|it'?s|that'?s|both|all)\s+(?:now\s+|fully\s+|already\s+)?(?:live|deployed|in production)\b|\b(?:deployed|shipped|released)\s+to\s+(?:prod|production)\b/i
// Sentences that talk about live without claiming it: negations, conditions, questions.
// (12 Nov: three of the first five nudges were wrong: "I'll check it's live", "as soon as ... says it's live", "Neither change is live yet".)
const NOT_A_CLAIM = /\b(?:not|never|no|neither|nor|yet|once|when|until|if|whether|will|would|should|won'?t|soon|after|before|check|confirm|verify|see|make sure|going to)\b|n't\b|'ll\b|\?/i

/** The first sentence of a reply that states something is live or deployed, or undefined. */
export function liveClaim(answer: string): string | undefined {
  const prose = answer
    .replace(/```[\s\S]*?```/g, ' ') // code blocks
    .replace(/`[^`\n]*`/g, ' ') // inline code
    .replace(/^\s*>.*$/gm, ' ') // quoted lines
  for (const raw of prose.split(/(?<=[.!?])\s+|\n+/)) {
    const s = raw.trim()
    if (s && CLAIM.test(s) && !NOT_A_CLAIM.test(s)) return s.slice(0, 200)
  }
  return undefined
}

// ---------- no Claude in Chrome ----------
export const isClaudeInChrome = (tool: string) => tool.startsWith('mcp__claude-in-chrome__')

// Playwright's browser tools start their own blank Chrome with none of the person's sign-ins (any server named playwright).
export const isPlaywright = (tool: string) => /^mcp__(plugin_)?playwright(_playwright)?__/.test(tool)

// ---------- context trim ----------
// Tools moved behind ToolSearch: still callable, their schemas load on first use (carried over from the old ctxdiet mod).
const DEFER_NAMES = new Set([
  'Artifact', 'Workflow', 'ScheduleWakeup', 'ReportFindings', 'ListAgents', 'SendUserFile',
  // Loaded in every session but rarely called: they load on first use instead.
  'AskUserQuestion', 'ReadNotifications',
])
// The three Claude Docs tools the app keeps loaded. The connector's instructions stay in view.
const DEFER_DOCS = /^mcp__[0-9a-f-]{36}__(?:batch|guide|update)$/
const DEFER_PREFIXES = [
  'mcp__Claude_Browser__',
  'mcp__Claude_Code_iOS_Simulator__',
  'mcp__terminal__',
  'mcp__ccd_session__',
  'mcp__visualize__',
]
// Adobe keeps three tools loaded in every session; nothing here needs them up front.
const DEFER_SUFFIX = /__(?:adobe_mandatory_init|export_html_to_express|create_visual_design_express_skill)$/
export const shouldDefer = (tool: string) =>
  DEFER_NAMES.has(tool) || DEFER_PREFIXES.some(p => tool.startsWith(p)) || DEFER_SUFFIX.test(tool) || DEFER_DOCS.test(tool)

// One line per group above, shown only when that group is offered: hook-deferred tools are listed nowhere else.
export const ON_DEMAND_INDEX: ReadonlyArray<readonly [string, string]> = [
  ['Artifact', 'Artifact: publish an HTML page as a private claude.ai link'],
  ['Workflow', 'Workflow: multi-agent orchestration (ultracode, "use a workflow")'],
  ['ScheduleWakeup', 'ScheduleWakeup: self-paced /loop wakeups'],
  ['ReportFindings', 'ReportFindings: report code-review findings'],
  ['ListAgents', 'ListAgents: other running Claude sessions to message'],
  ['SendUserFile', 'SendUserFile: send a file to the user'],
  ['AskUserQuestion', 'AskUserQuestion: a multiple-choice question dialog for the user'],
  ['ReadNotifications', 'ReadNotifications: read queued notifications (load it the moment a notice says some are pending)'],
  ['mcp__Claude_Browser__', 'mcp__Claude_Browser__*: in-app browser pane and dev-server preview (ToolSearch "+Claude_Browser", max_results 25)'],
  ['mcp__Claude_Code_iOS_Simulator__', 'mcp__Claude_Code_iOS_Simulator__control: iOS Simulator'],
  ['mcp__terminal__', 'mcp__terminal__read_terminal: read the Terminal panel'],
  ['mcp__ccd_session__', 'mcp__ccd_session__*: chapters, spawn_task chips, widget context'],
  ['mcp__visualize__', 'mcp__visualize__*: inline SVG/HTML widgets'],
]

/** `mcp__<server>__<tool>` -> [server, tool]; undefined for a built-in tool. */
export function splitMcp(name: string): [string, string] | undefined {
  if (!name.startsWith('mcp__')) return undefined
  const rest = name.slice(5)
  const i = rest.indexOf('__')
  // A connector this plugin carries shows up as plugin_machau-mod_<name>; it is the same connector as one added by hand.
  return i > 0 ? [rest.slice(0, i).replace(/^plugin_machau-mod_/, ''), rest.slice(i + 2)] : undefined
}

/** The same server under its two spellings: "claude.ai Meta MCP" (a heading) and "claude_ai_Meta_MCP" (a tool name). */
export const serverKey = (name: string) => name.trim().replace(/[^A-Za-z0-9]+/g, '_').toLowerCase()

const TOOL_LINE = /^(?:mcp__[^\s]+__[^\s]+|[A-Za-z][A-Za-z0-9_]*)$/
const COLLAPSE_ABOVE = 8 // a connector with more tools than this shows as one line
const looksGenerated = (server: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(server) || server.startsWith('claude_ai_')

/**
 * The deferred-tools list with each big connector folded to one line. Nothing is removed from the session:
 * every tool is still found and loaded with ToolSearch, which a deferred tool needs before its first call anyway.
 */
export function trimToolList(text: string): string {
  const lines = text.split('\n')
  const out: string[] = []
  let deferredPart = false
  let folded = false
  for (let i = 0; i < lines.length; ) {
    const line = lines[i]
    if (/^The following deferred tools/.test(line)) deferredPart = true
    else if (/^The following tools just became available/.test(line)) deferredPart = false
    if (!deferredPart || !TOOL_LINE.test(line)) {
      out.push(line)
      i++
      continue
    }
    // a run of tool names
    const run: string[] = []
    while (i < lines.length && TOOL_LINE.test(lines[i])) run.push(lines[i++])
    const groups = new Map<string, string[]>()
    for (const name of run) {
      const m = splitMcp(name)
      if (m) groups.set(m[0], [...(groups.get(m[0]) ?? []), m[1]])
    }
    // two connectors that offer exactly the same tools: show the one with a plain name
    const twinOf = new Map<string, string>()
    const bySet = new Map<string, string[]>()
    for (const [server, tools] of groups) {
      if (tools.length <= 5) continue
      const sig = [...tools].sort().join(',')
      bySet.set(sig, [...(bySet.get(sig) ?? []), server])
    }
    for (const servers of bySet.values()) {
      if (servers.length < 2) continue
      const keep = servers.find(s => !looksGenerated(s)) ?? servers[0]
      for (const s of servers) if (s !== keep) twinOf.set(s, keep)
    }
    const done = new Set<string>()
    for (const name of run) {
      const m = splitMcp(name)
      const tools = m && groups.get(m[0])
      if (!m || !tools) {
        out.push(name)
        continue
      }
      const server = m[0]
      if (twinOf.has(server)) {
        if (!done.has(server)) out.push(`mcp__${server}__*: the same ${tools.length} tools as mcp__${twinOf.get(server)}__*; use that one`)
        done.add(server)
        folded = true
      } else if (tools.length > COLLAPSE_ABOVE) {
        if (!done.has(server))
          out.push(`mcp__${server}__*: ${tools.length} tools, e.g. ${tools.slice(0, 5).join(', ')} (ToolSearch "+${server} <what you need>")`)
        done.add(server)
        folded = true
      } else out.push(name)
    }
  }
  if (!folded) return text
  const at = out.findIndex(l => /^The following deferred tools/.test(l))
  out.splice(at + 1, 0,
    'A connector with many tools is shown below as one line (name, count, a few examples). Its tools are all available: ' +
    'find the exact name with a ToolSearch keyword query such as "+engage segment", then call it.')
  return out.join('\n')
}

const SKILL_FULL = new Set(['delegate-with-judgment', 'impeccable', 'docs', 'google-workspace'])
const SKILL_CAP = 200
// Families that list many skills by bare name: one line each, every name kept so any can still be invoked.
// (Families with descriptions, such as Cloudflare, are left alone here: a developer on the team may rely on them.)
const SKILL_FAMILIES: ReadonlyArray<readonly [string, RegExp]> = [
  ['AWS', /^(?:aws-|amazon-bedrock$|launch-with-aws$|setting-up-cloudwatch-observability$|signing-in-to-aws$)/],
  ['Higgsfield', /^higgsfield-/],
]

/** The skills list with long descriptions cut to their opening; a skill's full text still loads when it is invoked. */
export function trimSkills(text: string): string {
  const parts = text.split(/\n(?=- )/)
  const folded = new Map<string, string[]>()
  const out: (string | { family: string })[] = []
  parts.forEach((entry, i) => {
    if (i === 0) return void out.push(entry)
    // The name may itself hold colons (anthropic-skills:docx), so it ends at the first colon followed by a space.
    const m = /^- (\S+?)(?:: ([\s\S]*))?$/.exec(entry.trimEnd())
    // A bare name is one line; anything else without a description is not a skill entry and passes through.
    if (!m || (m[2] === undefined && /\s/.test(m[1]))) return void out.push(entry)
    const family = SKILL_FAMILIES.find(([, test]) => test.test(m[1]))?.[0]
    if (family) {
      if (!folded.has(family)) (folded.set(family, []), out.push({ family }))
      return void folded.get(family)!.push(m[1])
    }
    if (m[2] === undefined) return void out.push(entry)
    const short = m[1].split(':').pop()!.trim()
    const desc = m[2].replace(/\s+/g, ' ').trim()
    if (SKILL_FULL.has(short) || desc.length <= SKILL_CAP) return void out.push(entry.trimEnd())
    out.push(`- ${m[1]}: ${desc.slice(0, SKILL_CAP).replace(/\s+\S*$/, '')}…`)
  })
  return out
    .map(x => (typeof x === 'string' ? x : `- ${x.family} skills, ${folded.get(x.family)!.length} (invoke one by its exact name): ${folded.get(x.family)!.join(', ')}`))
    .join('\n')
}

const INSTRUCTIONS_KEEP_UNDER = 900
const HELD_NOTE = '(More instructions for this connector exist. machau-mod gives them to you the first time you ToolSearch its tools; read them before calling one.)'
const CHROME_NOTE = 'Not used here (house rule): use `chrome.sh` for your signed-in Chrome, or the built-in browser.'

/**
 * The connector-instructions block with long pages held back. `held` maps a connector (serverKey) to its full page,
 * which the mod hands over when that connector's tools are first looked up. `keepWhole` names connectors left alone.
 */
export function trimInstructions(text: string, keepWhole: (server: string) => boolean = () => false, noClaudeInChrome = false): { text: string; held: Record<string, string> } {
  const held: Record<string, string> = {}
  const parts = text.split(/^(?=## )/m)
  const out = parts.map((part, i) => {
    if (i === 0 || !part.startsWith('## ')) return part
    const nl = part.indexOf('\n')
    const server = part.slice(3, nl < 0 ? undefined : nl).trim()
    const body = nl < 0 ? '' : part.slice(nl + 1).trim()
    if (noClaudeInChrome && /claude[-_ ]in[-_ ]chrome/i.test(server)) return `## ${server}\n${CHROME_NOTE}\n\n`
    if (body.length <= INSTRUCTIONS_KEEP_UNDER || keepWhole(server) || /^Claude Docs:/.test(body)) return part
    held[serverKey(server)] = `## ${server}\n${body}`
    const opening = body.slice(0, 220).replace(/\s+\S*$/, '')
    return `## ${server}\n${opening}…\n${HELD_NOTE}\n\n`
  })
  return { text: out.join(''), held }
}

/** The connectors whose tools a ToolSearch result names, as serverKeys. */
export function serversIn(text: string): string[] {
  const found = new Set<string>()
  for (const m of text.matchAll(/mcp__([A-Za-z0-9_.-]+?)__[A-Za-z0-9_.-]+/g)) found.add(serverKey(m[1]))
  return [...found]
}

// ---------- model routing ----------
// The delegation rule (the delegate-with-judgment skill): match the model to what the work needs most.
export const ROUTE_LABELS = [
  'judgment: diagnose, design, plan, decide what matters, review work',
  'execution: build, write or fix something to a clear brief',
  'volume: search, read, extract, summarise, classify or format, little judgment',
] as const
const ROUTE_MODEL = ['opus', 'sonnet', 'haiku'] as const
const ROUTE_ID = { opus: 'claude-opus-5-5', sonnet: 'claude-sonnet-5-5', haiku: 'claude-haiku-5-5' } as const
export type Route = (typeof ROUTE_MODEL)[number]
/** The model for a classifier's answer; Sonnet when it named none. */
export const routeFor = (label: string | undefined): Route => ROUTE_MODEL[ROUTE_LABELS.indexOf(label as (typeof ROUTE_LABELS)[number])] ?? 'sonnet'
export const routeId = (route: Route) => ROUTE_ID[route]
// Helper types the mod picks a model for. Every other type (Explore, a plugin's specialist) keeps its own.
export const ROUTED_TYPES = new Set(['general-purpose', 'claude'])
export const briefFor = (description: string, prompt: string) =>
  `A task being handed to a helper agent.\nTitle: ${description}\nBrief: ${prompt.slice(0, 2000)}`

// ---------- version ----------
export const VERSION = '1.7.0' // the same number as .claude-plugin/plugin.json (a test checks it)

// ---------- which computer ----------
// chrome.sh (a background tab in the person's own signed-in Chrome) exists on a Mac only, so the wording that points
// to it, and the default of the piece that refuses Playwright, depend on the computer.
export const chromeDeny = (mac: boolean) =>
  'House rule: Claude in Chrome is not used here (it is unreliable). ' +
  (mac ? 'For the signed-in Chrome use `chrome.sh`; for anything else use the built-in browser (mcp__Claude_Browser__*).' : 'Use the built-in browser (mcp__Claude_Browser__*).')
export const playwrightDeny = (mac: boolean) =>
  'House rule: Playwright is not used here. It opens a new, blank Chrome window with none of the sign-ins. ' +
  (mac ? 'For a site that needs a sign-in use `chrome.sh open URL` (a background tab in the real Chrome; then `text`, `js`, `click`). ' : '') +
  'For local previews, public pages, screenshots and resizing use the built-in browser (mcp__Claude_Browser__*, ToolSearch "+Claude_Browser")' +
  (mac ? '.' : '; for a site that needs a sign-in, open its sign-in page there and ask the person to sign in.')
/** Defaults that differ on Windows: with no chrome.sh there, Playwright is left alone unless the person switches the piece on. */
export const osDefaults = (os: string): { noBlankChrome?: boolean } => (os === 'windows' ? { noBlankChrome: false } : {})

// ---------- what the person typed ----------
/** What the person actually typed, without the blocks the app adds around it; '' when nothing is left. */
export const plainPrompt = (text: string) =>
  text
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, ' ')
    .replace(/<([a-z-]+)>[\s\S]*?<\/\1>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// ---------- session size ----------
// Long sessions are slower, dearer and forget more. Past 300k tokens, between tasks, the session is asked to save its
// state; the person's "shrink this session" then shortens the history in place.
export const SIZE_FIRST = 300_000
export const SIZE_STEP = 200_000
/** The size mark a session has just passed and was not told about yet, or undefined. */
export function sizeMark(tokens: number, lastMark: number): number | undefined {
  if (tokens < SIZE_FIRST) return undefined
  const mark = SIZE_FIRST + Math.floor((tokens - SIZE_FIRST) / SIZE_STEP) * SIZE_STEP
  return mark > lastMark ? mark : undefined
}
export const asksShrink = (text: string) => /^\s*(?:yes[, ]+)?(?:shrink|compact)(?: this| the)? session\b/i.test(text)
export const SIZE_NUDGE = (tokens: number) =>
  `Session size (machau-mod): this session now carries about ${Math.round(tokens / 1000)}k tokens. Big sessions are slower, ` +
  "cost more and forget more. If a task is in flight, ignore this and carry on. Otherwise: write this session's working " +
  'state (open tasks, decisions, names, what is next) into the project\'s state file (CURRENT.md if it has one, otherwise a ' +
  'short notes file you name in your reply), then tell the person in one line that the state is saved and that replying ' +
  '"shrink this session" shortens its history in place. Do not move them to a new session for this.'
export const KEEP_ON_SHRINK =
  "Keep: every open or waiting task and its next step, the person's decisions in their own words, names of people and " +
  'sessions, what was deployed and what is not live yet, and where the working state is written.'
/** A marker file's lines: is this exact line there, and the last number saved against a key ("<key> <number>" lines). */
export const hasLine = (file: string, line: string) => file.split(/\r?\n/).some(l => l.trim() === line)
export const lastNumberFor = (file: string, key: string) =>
  file.split(/\r?\n/).reduce((n, l) => { const [k, v] = l.trim().split(' '); return k === key && Number(v) > 0 ? Number(v) : n }, 0)

// ---------- smart shrink ----------
// About 90% of a long session is tool calls and their output; what the person and Claude said to each other is about 10%
// (measured on real sessions). So a shrink keeps every word between them, keeps the last few turns whole, and turns each
// older batch of tool work into a one-line receipt. Nothing of the conversation is summarised away.
export type Msg = {
  role: 'user' | 'assistant'
  text: string
  toolUses: readonly { name?: string; input?: unknown; isError?: boolean }[]
  toolResults?: readonly unknown[]
  handle?: string
}
export const SHRINK_KEEP_TURNS = 3
const isPrompt = (m: Msg) => m.role === 'user' && m.text.trim() !== '' && !(m.toolResults && m.toolResults.length > 0)
const size = (m: Msg) => m.text.length + JSON.stringify(m.toolUses ?? []).length + JSON.stringify(m.toolResults ?? []).length

function what(u: { name?: string; input?: unknown }): string {
  const i = (u.input ?? {}) as { description?: unknown; file_path?: unknown; query?: unknown; url?: unknown; skill?: unknown }
  const hint = [i.description, i.file_path, i.query, i.url, i.skill].find(x => typeof x === 'string' && x !== '') as string | undefined
  const name = String(u.name ?? 'tool').replace(/^mcp__/, '').replace(/^[0-9a-f-]{20,}__/, '')
  return hint ? `${name}: ${hint.replace(/\s+/g, ' ').slice(0, 70)}` : name
}

function receipt(uses: readonly { name?: string; input?: unknown; isError?: boolean }[]): string {
  const failed = uses.filter(u => u.isError).length
  const seen: string[] = []
  for (const u of uses) {
    const w = what(u)
    if (!seen.includes(w)) seen.push(w)
  }
  const shown = seen.slice(0, 12).join('; ')
  return `[machau-mod shrink: ${uses.length} tool call${uses.length === 1 ? '' : 's'} and the output were removed here${failed ? ` (${failed} failed)` : ''}. They were: ${shown}${seen.length > 12 ? `; and ${seen.length - 12} more` : ''}. Read the file or run the command again if the output is needed.]`
}

/**
 * The conversation after a smart shrink, or undefined when there is nothing worth removing.
 * Messages kept as they were keep their `handle` (the engine's own, whole); rewritten ones are built from text only.
 */
export function smartShrink(messages: readonly Msg[], keepTurns = SHRINK_KEEP_TURNS): { messages: Msg[]; before: number; after: number; removed: number } | undefined {
  const prompts = messages.map((m, i) => (isPrompt(m) ? i : -1)).filter(i => i >= 0)
  if (prompts.length <= keepTurns) return undefined
  const cut = prompts[prompts.length - keepTurns] // the last few turns, from this prompt on, stay whole
  const out: Msg[] = []
  let pending: { name?: string; input?: unknown; isError?: boolean }[] = []
  let removed = 0
  const push = (m: Msg) => {
    const last = out[out.length - 1]
    // Two messages from the same side in a row are joined, so the roles keep alternating.
    if (last && last.role === m.role && !last.handle && !m.handle) out[out.length - 1] = { ...last, text: `${last.text}\n\n${m.text}` }
    else if (last && last.role === m.role) out[out.length - 1] = { role: m.role, text: `${last.text}\n\n${m.text}`, toolUses: [] }
    else out.push(m)
  }
  const flush = () => {
    if (pending.length === 0) return
    push({ role: 'assistant', text: receipt(pending), toolUses: [] })
    removed += pending.length
    pending = []
  }
  for (const m of messages.slice(0, cut)) {
    if (m.role === 'assistant') {
      if (m.toolUses.length === 0) {
        flush()
        push(m) // a plain reply: kept whole, as the engine has it
      } else {
        if (m.text.trim()) { flush(); push({ role: 'assistant', text: m.text, toolUses: [] }) }
        pending.push(...m.toolUses)
      }
    } else if (isPrompt(m)) {
      flush()
      push(m) // what the person said: kept whole
    } else if (m.text.trim()) {
      flush()
      push({ role: 'user', text: m.text, toolUses: [] }) // text that rode along with tool results
    }
  }
  flush()
  if (removed === 0) return undefined
  const note = `[machau-mod shrink: this session's history was shortened in place. Everything the person and Claude said to each other is kept word for word, and the last ${keepTurns} turns are whole. Older tool calls and their output were replaced by one-line receipts.]`
  if (out[0]?.role === 'user') out[0] = { role: 'user', text: `${note}\n\n${out[0].text}`, toolUses: [] }
  else out.unshift({ role: 'user', text: note, toolUses: [] })
  const tail = messages.slice(cut)
  // The tail starts with the person's prompt; if the shortened part also ends on their side, a one-word bridge keeps the order legal.
  if (out[out.length - 1].role === 'user') out.push({ role: 'assistant', text: '(continuing)', toolUses: [] })
  const all = [...out, ...tail]
  return { messages: all, before: messages.reduce((n, m) => n + size(m), 0), after: all.reduce((n, m) => n + size(m), 0), removed }
}

// ---------- automatic shrink ----------
// A shrink makes sense when it removes a lot and the session is between tasks. It costs one fresh write of the smaller
// history; after that every reply carries less, so it pays back within a few replies. Sizes are characters (about 4 per token).
export const AUTO_MIN_SAVED = 400_000 // about 100k tokens
export const AUTO_MAX_KEPT = 0.6 // the shrink must remove at least 40%
export const worthShrinking = (before: number, after: number) => before - after >= AUTO_MIN_SAVED && after <= before * AUTO_MAX_KEPT

// ---------- plan tick ----------
// The app shows a task list under Claude's message, and Claude must tick each step itself (update_plan advance).
// Measured over 5 days of real sessions, plans of 3+ steps that ran 10+ tool calls: Sonnet never ticked until the end
// in 40 of 44, Opus in 43 of 96. A list that ticks all at once at the end tells the person nothing while the work runs.
// So the mod counts tool calls since the list last moved and says so once it is stale.
export type PlanState = { steps: string[]; current: number; since: number; noted: number }
export const PLAN_NONE: PlanState = { steps: [], current: -1, since: 0, noted: 0 }
export const PLAN_STALE = 8 // tool calls on one step before the first reminder
export const PLAN_AGAIN = 12 // and between reminders after that
const PLAN_TOOL = 'mcp__ccd_turn__update_plan'
export const WRAP_TOOL = 'mcp__ccd_turn__wrap_up'

/** One tool call by the session itself: the new state, and a reminder when a step has shown as running for too long. */
export function planTick(s: PlanState, tool: string, args: unknown): { state: PlanState; note?: string } {
  if (tool === WRAP_TOOL) return { state: PLAN_NONE }
  if (tool === PLAN_TOOL) {
    const a = (args ?? {}) as { items?: unknown; advance?: unknown; done?: unknown; start?: unknown }
    if (Array.isArray(a.items)) {
      const items = a.items as { content?: unknown; status?: unknown }[]
      return { state: { steps: items.map(i => String(i?.content ?? '')), current: items.findIndex(i => i?.status === 'in_progress'), since: 0, noted: 0 } }
    }
    let current = s.current
    if (typeof a.start === 'number') current = a.start - 1
    else if (a.advance === true) current = s.current + 1 < s.steps.length ? s.current + 1 : -1
    return { state: { ...s, current, since: 0, noted: 0 } }
  }
  const since = s.since + 1
  // The last step has nothing after it to move to (the wrap-up ticks it), so only earlier steps are reminded.
  const stale = s.current >= 0 && s.current < s.steps.length - 1 && since >= PLAN_STALE && (s.noted === 0 || since - s.noted >= PLAN_AGAIN)
  if (!stale) return { state: { ...s, since } }
  const note =
    `Task list (machau-mod): the person follows your progress on the list under your message, and step ${s.current + 1} of ${s.steps.length} ` +
    `("${s.steps[s.current].slice(0, 80)}") has shown as running for ${since} tool calls. If it is finished, tick it now: send ` +
    `${PLAN_TOOL} {"advance": true} together with your next tool call, or {"done": [...], "start": n} if you are several steps on. ` +
    'A list that is ticked all at once at the end tells them nothing while the work runs. ' +
    'If the step really is still running, carry on; if the plan itself has changed, send the new list.'
  return { state: { ...s, since, noted: since }, note }
}

// ---------- capacity check ----------
// Five code sessions started at once hung a 16 GB MacBook. Before a session or helper starts, the mod reads the
// computer's real state (host.ts readMachine) and holds a start it cannot carry. It fails open: no reading in time,
// or one it cannot parse, allows the start.
export const CAPACITY = {
  // Sizes measured again on a 16 GB MacBook (1.2.1): a session engine with its connectors is about 0.6 GB, a code
  // session with its build about 1.5 GB. The first numbers (0.7 and 3 GB, a quarter of RAM kept back) left room for
  // one code session on a 16 GB Mac that in practice carries three or four.
  light_gb: 0.6, heavy_gb: 1.5,
  // Headroom for the person's own apps to grow (what they use now is already outside the free figure): an eighth of
  // RAM, never under 2 GB.
  reserve_frac: 0.125, reserve_min_gb: 2.0,
  // A running build is usually still growing: this much extra headroom for each one already running.
  ramp_gb: 1.0,
  // Backstops on the free percentage; the budget above does the real work.
  full_free_pct: 10, wait_free_pct: 18,
  // Swap sitting in use is NOT a reason to hold (1.2.1). Idle memory parked in swap costs nothing: a Mac that has been
  // on for days holds several GB there while half its memory is free, and the old rule (swap over a quarter of RAM =
  // full) held every start all day. What counts is macOS's own pressure level: 1 normal, 2 warning, 4 critical. The
  // warning level alone does not hold a start (it is on much of a working day); critical does.
  critical_pressure: 4,
  // A load equal to the cores is a computer using what it has, not one in trouble, and starting a session costs
  // almost no processor (its build comes minutes later).
  full_load: 2.5, wait_load: 1.5,
  cores_per_heavy: 2.5,
  stagger_ms: 90_000, // two session starts closer than this are refused: started together, their builds pile up
  override_ms: 600_000,
  // Windows: the Mac numbers above were never measured there (its page file and its "free" figure behave differently),
  // so only the plain case is held: under a tenth of memory free. Every reading is logged, so finer rules can follow.
  windows_full_free_pct: 10,
  timeout_ms: { mac: 2500, windows: 8000 } as Record<string, number>,
}
export type Reading = { os: 'mac' | 'windows'; ram_gb: number; cores: number; free_pct: number | null; swap_gb: number; pressure: number; load1: number; heavy_procs: number }
export type Verdict = { verdict: 'ok' | 'wait' | 'full'; reason: string; light_fit: number; heavy_fit: number }

const HEAVY_PROC =
  /(next[ -]|next\/dist|vite\b|webpack|rollup|esbuild|tsc\b|turbo\b|npm (?:run )?(?:build|dev|start)|pnpm (?:run )?(?:build|dev)|yarn (?:build|dev)|nuxt|astro (?:dev|build)|ms-playwright|--headless|--remote-debugging-port|chrome-headless|Chromium)/i
const WORKER_PROC = /jest-worker|processChild|--type=(?:renderer|gpu-process|utility)|Helper/i
/** The real node or browser binary, counted once: not the shell or npm wrappers around it, nor its worker children. */
const isBinary = (row: string) => {
  const exe = (row.split(' ', 1)[0].split('/').pop() ?? '').toLowerCase()
  return ['node', 'chromium', 'chrome-headless-shell'].includes(exe) || (exe === 'google' && row.includes('--remote-debugging-port'))
}

/** A Mac's reading from host.ts MAC_READ, or undefined when it cannot be read. */
export function parseMacReading(out: string): Reading | undefined {
  const [head, ps = ''] = out.split('@@ps')
  const num = (re: RegExp) => { const m = re.exec(head); return m ? Number(m[1]) : NaN }
  const ram = num(/^ram (\d+)/m) / 2 ** 30
  const cores = num(/^cores (\d+)/m)
  if (!(ram > 0) || !(cores > 0)) return undefined
  const free = num(/free percentage:\s*(\d+)%/i)
  const swap = num(/^swap .*used = ([\d.]+)M/m)
  const load = num(/^load \{?\s*([\d.]+)/m)
  const level = num(/^level (\d+)/m)
  let heavy = 0
  for (const row of ps.split('\n')) {
    if (!row.trim() || row.includes('Claude.app') || (row.includes('/claude-code/') && /\/claude(\s|$)/.test(row))) continue
    if (HEAVY_PROC.test(row) && isBinary(row.trim()) && !WORKER_PROC.test(row)) heavy++
  }
  return { os: 'mac', ram_gb: Math.round(ram * 10) / 10, cores, free_pct: Number.isNaN(free) ? null : free, swap_gb: Number.isNaN(swap) ? 0 : Math.round((swap / 1024) * 100) / 100, pressure: Number.isNaN(level) ? 1 : level, load1: Number.isNaN(load) ? 0 : load, heavy_procs: heavy }
}

/** A Windows reading from host.ts WIN_READ, or undefined when it cannot be read. */
export function parseWindowsReading(out: string): Reading | undefined {
  const num = (re: RegExp) => { const m = re.exec(out); return m ? Number(m[1]) : NaN }
  const ramKb = num(/^ram_kb (\d+)/m)
  const freeKb = num(/^free_kb (\d+)/m)
  const cores = num(/^cores (\d+)/m)
  if (!(ramKb > 0) || Number.isNaN(freeKb)) return undefined
  return { os: 'windows', ram_gb: Math.round((ramKb / 2 ** 20) * 10) / 10, cores: cores > 0 ? cores : 1, free_pct: Math.round((freeKb / ramKb) * 100), swap_gb: 0, pressure: 1, load1: 0, heavy_procs: 0 }
}

/** Pure: a reading in, a verdict out. */
export function decide(m: Reading, c = CAPACITY): Verdict {
  if (m.os === 'windows') {
    const free = m.free_pct ?? 50
    return free < c.windows_full_free_pct
      ? { verdict: 'full', reason: `only ${free}% of memory is free`, light_fit: 0, heavy_fit: 0 }
      : { verdict: 'ok', reason: `${free}% of memory is free`, light_fit: 1, heavy_fit: 1 }
  }
  const { ram_gb: ram, cores, free_pct: free } = m
  const full: string[] = []
  const wait: string[] = []
  if (free !== null) {
    if (free < c.full_free_pct) full.push(`only ${free}% of memory is free`)
    else if (free < c.wait_free_pct) wait.push(`memory is getting tight (${free}% free)`)
  }
  if (m.pressure >= c.critical_pressure) full.push('macOS reports critical memory pressure')
  if (m.load1 > c.full_load * cores) full.push(`the processor is saturated (load ${m.load1} on ${cores} cores)`)
  else if (m.load1 > c.wait_load * cores) wait.push(`the processor is busy (load ${m.load1} on ${cores} cores)`)
  const avail = (ram * (free ?? 50)) / 100
  const spare = avail - Math.max(c.reserve_min_gb, c.reserve_frac * ram) - c.ramp_gb * m.heavy_procs
  let light = Math.max(0, Math.floor(spare / c.light_gb))
  const heavyCap = Math.max(1, Math.floor(cores / c.cores_per_heavy))
  let heavy = Math.max(0, Math.min(Math.floor(spare / c.heavy_gb), heavyCap - m.heavy_procs))
  let verdict: Verdict['verdict']
  let reasons: string[]
  if (full.length > 0 || light === 0) {
    verdict = 'full'
    reasons = full.length > 0 ? full : ['no memory is left beyond what your own apps need']
  } else if (wait.length > 0 || heavy === 0) {
    verdict = 'wait'
    reasons = wait.length > 0 ? wait
      : spare < c.heavy_gb ? [`not enough free memory for a session that builds code (${Math.max(spare, 0).toFixed(1)} GB spare, it needs about ${c.heavy_gb})`]
      : [`${m.heavy_procs} builds or browsers are already running (this computer takes ${heavyCap} at once)`]
  } else {
    verdict = 'ok'
    reasons = ['plenty of room']
  }
  if (verdict !== 'ok') heavy = 0
  if (verdict === 'full') light = 0
  return { verdict, reason: reasons.join('; '), light_fit: light, heavy_fit: heavy }
}

const HEAVY_WORK = /\b(build|builds|implement|fix|refactor|edit|commit|pull request|\bPR\b|npm|pnpm|yarn|dev server|test|tests|deploy|migrate|code|feature|bug|ui|frontend)\b/i
/** A start is heavy (builds code) unless it is plainly read-only: a brief with no building words, or a known read-only helper. */
export const startKind = (tool: string, input: unknown): 'light' | 'heavy' => {
  const i = (input ?? {}) as { prompt?: unknown; subagent_type?: unknown }
  if (!tool.includes('start_session')) return /^(Explore|Plan|claude-code-guide|web-fetch|statusline-setup)$/.test(String(i.subagent_type ?? '')) ? 'light' : 'heavy'
  return HEAVY_WORK.test(String(i.prompt ?? '')) ? 'heavy' : 'light'
}
/**
 * Why this start is held, or undefined to let it go. A new session is held when the computer is full, when it would
 * build code and there is room only for light work, or when another session started under 90 seconds ago. A helper
 * shares the session's process (cheap), so only a full computer holds it.
 */
export function holdReason(d: Verdict, kind: 'light' | 'heavy', isSession: boolean, msSinceLastStart: number, c = CAPACITY): string | undefined {
  if (d.verdict === 'full') return `full: ${d.reason}`
  if (!isSession) return undefined
  if (kind === 'heavy' && d.verdict === 'wait') return `wait (light sessions only): ${d.reason}`
  if (kind === 'heavy' && d.heavy_fit < 1) return `no room for heavy work: ${d.reason}`
  if (msSinceLastStart < c.stagger_ms) return `stagger: another session started less than ${c.stagger_ms / 1000}s ago; wait ${Math.ceil((c.stagger_ms - msSinceLastStart) / 1000)}s so its load shows`
  return undefined
}
export const capacityDeny = (why: string, kind: string) =>
  `Capacity check (machau-mod): this computer cannot take a new ${kind} start now. ${why}. ` +
  'Do not retry in a loop and do not start it another way: note the task (it stays on your list), carry on with other work, ' +
  'and try the start again in a few minutes. ' +
  'Only the person\'s own direct word overrides this: when they type "start it anyway", the check steps aside for 10 minutes. Never type that for them.'
/** The person's own words that set the check aside for 10 minutes. */
export const asksOverride = (text: string) => /\b(?:start (?:it|them|that|this)? ?anyway|override (?:the )?capacity)\b/i.test(text)

// ---------- Company Brain ----------
// The company keeps one shared memory (the Company Brain) of what people and their Claude sessions did, so that two
// people working on the same thing do not undo or build over each other. A person who has connected it to Claude has
// its tools in the session; the mod then tells Claude to ask it before changing shared work and to save one note
// when a task is finished. The note goes in under the person's own sign-in, as a tool call they can see, and the
// brain redacts and reviews it before anyone else can find it. The mod itself sends nothing.
export type BrainTools = { capture: string; ownerCapture?: string; ask?: string }
const pick = (tools: readonly string[], suffix: string) => {
  const hits = tools.filter(t => t.startsWith('mcp__') && t.endsWith(`__${suffix}`))
  // The same connector can be listed twice (by name and by id); the readable name is the one to quote.
  return hits.find(t => !/^mcp__[0-9a-f]{8}-/.test(t)) ?? hits[0]
}
/** The Company Brain's tools in this session, or undefined when the person has not connected it. */
export function brainTools(tools: readonly string[]): BrainTools | undefined {
  const capture = pick(tools, 'brain_department_capture')
  const ownerCapture = pick(tools, 'brain_capture_context')
  if (!capture && !ownerCapture) return undefined
  const ask = pick(tools, 'brain_ask')
  return { capture: capture ?? ownerCapture!, ...(capture && ownerCapture ? { ownerCapture } : {}), ...(ask ? { ask } : {}) }
}
export const isBrainCapture = (tool: string) => /__brain_(?:department_capture|capture_context)$/.test(tool)
const NOTE_RULES =
  "the request in the person's own words, what was decided, what you changed and where (repository, files, pull request, system), " +
  "and what is left. Under 3,000 characters. Never a key or password, a customer's personal details, or raw command output"
const which = (b: BrainTools) =>
  '`' + b.capture + '`' +
  (b.ownerCapture
    ? ' (if it answers that it needs a member identity, the person is an owner: use `' + b.ownerCapture + '` with the scope of the company this folder belongs to, ' +
      'and save nothing when you cannot tell which company that is; if it answers that the person has no department, say so in one line and carry on: that is set on the Company Brain side)'
    : '')
export const brainSection = (b: BrainTools) =>
  'Company Brain (machau-mod): the company keeps one shared memory of what people and their Claude sessions did, so that two people ' +
  'working on the same thing do not undo or build over each other.\n' +
  (b.ask
    ? '- Before you change something a colleague may also be working on (shared code, a listing, a campaign, a setting), ask it what was recently done or decided there: `' + b.ask + "`. What it returns is a dated record, not today's state.\n"
    : '') +
  `- When a task is finished, save one note with ${which(b)}: ${NOTE_RULES}. One note per finished task, not one per reply.\n` +
  '- If a tool named here is not loaded yet, load it with ToolSearch first.'
export const brainNudge = (b: BrainTools) =>
  'Company Brain (machau-mod): this turn pushed, merged or deployed work that others may build on, and no note has been saved to the ' +
  `Company Brain since. If the task is finished, save one now with ${which(b)}: ${NOTE_RULES}. Then reply in one line. ` +
  'If the task is still in flight, reply "still in flight" in one line and save nothing yet.'
/** A command that puts work where colleagues will meet it: a push, a pull request made or merged, a deploy. Words inside quotes or a heredoc do not count. */
export const sharesWork = (command: string) => {
  const bare = command.replace(/<<-?\s*['"]?(\w+)['"]?[\s\S]*?\n\1\b/g, ' ').replace(/'[^']*'|"[^"]*"/g, ' ')
  return /\bgit\s+(?:-C\s+\S+\s+)?push\b/.test(bare) || /\bgh\s+pr\s+(?:create|merge)\b/.test(bare) || /(?:^|[;&|]\s*|\bnpm run |\bpnpm (?:run )?|\byarn |\bwrangler |\.\/)deploy\b/.test(bare)
}


// ---------- team pieces (1.3.0): task inbox, role kit check, shared company rules ----------
// Work that HQ hands out as Machau Chat tasks, a daily check that each connector a role needs answers, and one set of
// company rules. A plugin cannot wake an idle session by itself, so the inbox is looked at when a session starts, when
// the person says "take my tasks", and at the end of a turn once INBOX_EVERY_MS has passed (see register.ts).
export const INBOX_EVERY_MS = 30 * 60_000
export const TECH_DESK_LABEL = 'Tech & Access'
export const ROLES = ['tech', 'website', 'marketing', 'marketplaces', 'customer care', 'accounts', 'operations'] as const
export type Role = (typeof ROLES)[number]
// The connectors a role needs, by the server name Claude sees (mcp__<server>__<tool>). Every role needs Machau Chat and the
// Company Brain. Edit a kit here and the next mod update reaches everyone.
const COMMON_CONNECTORS = ['machau-chat', 'company-brain-cloud'] as const
export const ROLE_KITS: Readonly<Record<Role, readonly string[]>> = {
  tech: [...COMMON_CONNECTORS, 'aws-mcp', 'plugin_cloudflare_cloudflare'],
  website: [...COMMON_CONNECTORS, 'bamboostan-app'],
  marketing: [...COMMON_CONNECTORS, 'engage'],
  marketplaces: [...COMMON_CONNECTORS, 'bamboostan-app'],
  'customer care': [...COMMON_CONNECTORS, 'engage'],
  accounts: [...COMMON_CONNECTORS, 'composio'],
  operations: [...COMMON_CONNECTORS, 'bamboostan-app'],
}

/** "my role is marketing" -> 'marketing'; anything else is not a role. */
export function roleFrom(text: string): Role | undefined {
  const m = /^\s*my role is\s+(.+?)[.\s]*$/i.exec(text)
  const r = m?.[1].trim().toLowerCase() ?? ''
  return (ROLES as readonly string[]).includes(r) ? (r as Role) : undefined
}
/** The role the person picked last: the last line of their role file. */
export function roleOf(file: string): Role | undefined {
  const last = file.split(/\r?\n/).map(l => l.trim()).filter(Boolean).pop() ?? ''
  return (ROLES as readonly string[]).includes(last) ? (last as Role) : undefined
}

/** The day as YYYY-MM-DD in this computer's own time zone. */
export const dayOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Stamps in the state file, one per line: "ok <day> <connector>" (it answered that day) and "told <day> <connector>"
// (the desk has been messaged about it that day).
export type KitState = { ok: Set<string>; told: Set<string> }
export function kitStateFor(file: string, day: string): KitState {
  const st: KitState = { ok: new Set(), told: new Set() }
  for (const line of file.split(/\r?\n/)) {
    const [kind, d, server] = line.trim().split(' ')
    if (d !== day || !server) continue
    if (kind === 'ok') st.ok.add(server)
    else if (kind === 'told') st.told.add(server)
  }
  return st
}

export const KIT_MARK = '[machau-mod kit check]'
const KIT_TOLD = /\[machau-mod kit check\] connector not working: ([A-Za-z0-9_-]+)/
/** The connector a message to the desk reports, when it is the kit check's own message. */
export const kitToldIn = (text: string): string | undefined => KIT_TOLD.exec(text)?.[1]

/** What the kit check has to do now: connectors missing from this session, ones not yet answering today, and the ones already reported today. */
export function kitCheck(role: Role, tools: readonly string[], st: KitState) {
  const have = new Set(tools.map(t => splitMcp(t)?.[0]).filter((s): s is string => s !== undefined))
  const kit = ROLE_KITS[role]
  return {
    missing: kit.filter(c => !have.has(c)),
    due: kit.filter(c => have.has(c) && !st.ok.has(c)),
    told: kit.filter(c => st.told.has(c)),
  }
}

/** The instructions for this session's check, or undefined when every connector of the kit has answered today. */
export function kitSection(role: Role, c: { missing: string[]; due: string[]; told: string[] }, desk: string): string | undefined {
  if (c.missing.length === 0 && c.due.length === 0) return undefined
  const lines = [`Role kit check (machau-mod), role "${role}".`]
  if (c.due.length > 0)
    lines.push(`Check these today, one cheap read call each (a list or a search that changes nothing): ${c.due.join(', ')}. A connector that answers is done for today.`)
  if (c.missing.length > 0) lines.push(`Not connected in this session: ${c.missing.join(', ')}.`)
  lines.push(
    `For each connector that fails or is missing, show one line: "<connector> connector not working: ${TECH_DESK_LABEL} has been told". ` +
      `Then send ONE Machau Chat message to ${desk} whose text starts with exactly "${KIT_MARK} connector not working: <connector>. " and says what failed, ` +
      `unless that connector was already reported today (${c.told.join(', ') || 'none'}). Never message for a connector that is only slow.`,
  )
  return lines.join('\n')
}

export const inboxDue = (lastAt: number, now: number) => now - lastAt >= INBOX_EVERY_MS

export const INBOX_SECTION = [
  'Task inbox (machau-mod): HQ gives out work as Machau Chat tasks assigned to this person.',
  'At the start of the session, and whenever the person says "take my tasks", call list_tasks (mine, open).',
  'With none open, say "No new tasks from HQ." and stop.',
  "For each open task, in order: read the task and its thread (get_messages); write a plan of three lines at most; do what you can with this person's connectors; ask the person only for their judgement; reply in the task's thread (send_message) with what was done and the proof; mark it done (update_task) only with proof.",
  "Never act outside the company, and never do anything irreversible (money, a message to someone outside, anything a customer sees, a deletion) without this person's yes.",
  'If tasks are open and not started, say one line: "N new tasks from HQ: say \'take my tasks\'".',
].join('\n')
export const INBOX_NUDGE =
  'Task inbox check (machau-mod): take my tasks. Call list_tasks (mine, open) now and follow the task inbox rules. ' +
  'If none are open, reply only "No new tasks from HQ."'
export const ROLE_ASK =
  `Role (machau-mod): this person has not picked a role yet. Ask once, in one line, which role they have: ${ROLES.join(', ')}. ` +
  'When they answer "my role is <role>", reply that it is saved.'

export const isMachauChatTool = (tool: string, name?: string) => {
  const p = splitMcp(tool)
  return p !== undefined && p[0] === 'machau-chat' && (name === undefined || p[1] === name)
}

/** The profile file, read tolerantly: a bad file means no settings, never an error. */
export type Profile = { switches?: Record<string, boolean>; founderEmail?: string; desks?: { techAccess?: string }; member?: string; area?: string }
export function readProfile(raw: string): Profile {
  try {
    const p = JSON.parse(raw.replace(/^﻿/, '')) as Profile
    return p && typeof p === 'object' ? p : {}
  } catch {
    return {}
  }
}
/** The founder's address for payment emails, when the profile holds a plausible one. */
export const founderEmailOf = (p: Profile) =>
  typeof p.founderEmail === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.founderEmail.trim()) ? p.founderEmail.trim() : undefined
/** Where the Tech & Access messages go: the profile's desk, or the founder's own chat in Machau Chat. */
export const techDeskOf = (p: Profile) =>
  typeof p.desks?.techAccess === 'string' && p.desks.techAccess.trim() ? `the Machau Chat chat ${p.desks.techAccess.trim()}` : "the founder's one-to-one chat in Machau Chat"

/** The connectors any role's kit names: only calls to these (and the kit-check message) cost a look at the role file. */
export const KIT_SERVERS: ReadonlySet<string> = new Set(Object.values(ROLE_KITS).flat())


// ---------- heartbeat (1.4.0): once a day, who has the plugin, which version, which computer, last use. No content. ----------
// The team collector is a Cloudflare Worker that takes only these fields. The token is per person and is read from this
// person's own keychain (Mac) or the MACHAU_COLLECTOR_TOKEN environment variable (Windows). It is never in this repo.
export const COLLECTOR_URL = 'https://team-collector.siddharth-90e.workers.dev/heartbeat'
/** The calendar day in India, as YYYY-MM-DD. */
export const istDayOf = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10)
/** Send at most once a day, and only for a member id the person has set. */
export const heartbeatDue = (lastDay: string | undefined, today: string, member: string | undefined) =>
  !!member && /^[a-z0-9][a-z0-9-]{1,40}$/.test(member) && lastDay !== today
/** The only fields sent. No conversation, no file names, no folders, no prompts. */
export const heartbeatBody = (a: { member: string; version: string; os: string; pieces: readonly string[]; lastActive: string; connectors?: readonly string[] }) =>
  JSON.stringify({ member: a.member, plugin_version: a.version, os: a.os, pieces: a.pieces.slice(0, 40), last_active: a.lastActive, ...(a.connectors ? { connectors: a.connectors.slice(0, 10) } : {}) })


// ---------- work record (1.4.1): one short record per session, counts plus a scrubbed note. No transcript. ----------
export const RECORD_URL = 'https://team-collector.siddharth-90e.workers.dev/record'
/** A short prompt that looks like a correction ("no", "wrong", "undo"...). Approximate by design. */
export const looksLikeCorrection = (text: string) => text.length <= 200 && /^\s*(no\b|nope|wrong|not that|that'?s not|undo|revert|stop\b)/i.test(text)
/** Removes secrets, contact details and customer identifiers before anything leaves the laptop. The collector runs the same
 *  rules again (work-collector/src/scrub.js); a test on each side holds the same examples. */
const SCRUB_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[key]'],
  [/\b(?:sk|pk|rk|mf|ghp|gho|ghs|xox[abp]|AKIA|ASIA|AIza|eyJ)[A-Za-z0-9_.\-]{12,}/g, '[key]'],
  [/\bBearer\s+[A-Za-z0-9._~+\/=-]{12,}/gi, 'Bearer [key]'],
  [/([a-z]+:\/\/[^\s:@\/]+:)[^\s@\/]+@/gi, '$1[password]@'],
  [/\b((?:pass(?:word|wd)?|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|auth|otp|pin)\s*(?:is|=|:)\s*)["']?[^\s"',;]{3,}/gi, '$1[secret]'],
  [/\b[A-Fa-f0-9]{32,}\b/g, '[key]'],
  [/\b[A-Za-z0-9+\/_-]{40,}={0,2}/g, '[key]'],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]'],
  [/\b[A-Z]{5}\d{4}[A-Z]\b/g, '[pan]'],
  [/\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/g, '[gstin]'],
  [/\b\d{4}[ -]\d{4}[ -]\d{4}\b/g, '[number]'],
  [/\b(?:\d[ -]?){13,19}\b/g, '[number]'],
  [/(?:\+?91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b/g, '[phone]'],
  [/(?:\+?91[\s-]?)?\b[6-9]\d{2}[\s-]\d{3}[\s-]\d{4}\b/g, '[phone]'],
  [/\+\d{1,3}[\s-]?\(?\d{2,5}\)?[\s-]?\d{3,5}[\s-]?\d{3,5}\b/g, '[phone]'],
  [/\b\d{9,}\b/g, '[number]'],
]
export const scrubText = (t: string, max = 3000) => {
  let s = maskSecrets(String(t ?? '')).text
  for (const [re, to] of SCRUB_RULES) s = s.replace(re, to)
  return s.slice(0, max)
}
// ---------- enrolment (1.4.2): HQ gives a person a one-time code; typing "machau enrol CODE" swaps it for their own token ----------
export const ENROL_URL = 'https://team-collector.siddharth-90e.workers.dev/enrol'
export const enrolCodeIn = (text: string) => /^\s*machau enrol ([A-Za-z2-7]{16})\s*$/i.exec(text)?.[1]?.toUpperCase()
/** The person's collector file holds one JSON line per enrolment; the last good line wins. */
export function readCollector(raw: string): { member: string; token: string } | undefined {
  for (const line of raw.split('\n').reverse()) {
    try {
      const j = JSON.parse(line.replace(/^﻿/, '')) as { member?: unknown; token?: unknown }
      if (typeof j.member === 'string' && /^[a-z0-9][a-z0-9-]{1,40}$/.test(j.member) && typeof j.token === 'string' && /^[A-Za-z0-9_-]{30,200}$/.test(j.token)) return { member: j.member, token: j.token }
    } catch { /* next line */ }
  }
  return undefined
}
/** The folder name only (never the path), scrubbed, as the area when the person has not set one. */
export const areaFromFolder = (cwd: string) => scrubText(String(cwd || '').split(/[\\/]/).filter(Boolean).pop() ?? '', 60)
export type RecordStats = { turns: number; toolCalls: number; corrections: number; startedAt: number; status: 'finished' | 'open'; records: number; toolCallsAtLast: number; lastAskAt: number; awaiting: boolean }
export const newStats = (): RecordStats => ({ turns: 0, toolCalls: 0, corrections: 0, startedAt: Date.now(), status: 'open', records: 0, toolCallsAtLast: 0, lastAskAt: 0, awaiting: false })
/** A record is asked for after real work: at least 2 turns and 2 more tool calls since the last record, 15 minutes apart, 3 per session at most. */
export const recordDue = (st: RecordStats, now: number) =>
  !st.awaiting && st.records < 3 && st.turns >= 2 && st.toolCalls - st.toolCallsAtLast >= 2 && now - st.lastAskAt >= 15 * 60_000
/** What the person's own Claude is asked to write. About 170 tokens in, about 90 out. Visible to the person in the session. */
export const RECORD_ASK =
  '[machau-mod work record] Write a short work record of the work done in this session since the last record, for the team manager. ' +
  'Reply with ONLY one line, exactly: RECORD {"task":"...","done":"...","left":"...","area":"...","topic":"...","status":"finished|open|blocked"} ' +
  'Plain words, one short sentence each (under 25 words). Describe the work, not the people: no customer names, phone numbers, addresses, emails, passwords, keys or personal details. ' +
  'area = the project or product; topic = the project plus two or three key nouns of the task, lowercase, for example "sutra courier booking". ' +
  'If nothing real was worked on, reply exactly: RECORD {"skip":true}'
const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'fix', 'add', 'update', 'new', 'work', 'task', 'session', 'claude', 'page', 'file', 'check', 'make', 'get', 'set', 'run', 'use', 'are', 'was', 'not', 'one', 'two'])
export const normaliseTopic = (t: string) => [...new Set(String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w.length > 2 && !STOP_WORDS.has(w)))].slice(0, 6).join(' ')
export type WrittenRecord = { skip: true } | { task: string; done: string; left: string; area: string; topic: string; status: 'finished' | 'open' | 'blocked' }
/** Reads Claude's reply to RECORD_ASK. Every text is scrubbed here, on the laptop; the collector scrubs again. */
export function parseRecordReply(answer: string): WrittenRecord | undefined {
  const m = /RECORD\s*(\{[\s\S]*\})/.exec(String(answer || ''))
  if (!m) return undefined
  try {
    const j = JSON.parse(m[1]) as Record<string, unknown>
    if (j.skip === true) return { skip: true }
    const t = (v: unknown, max: number) => scrubText(String(v ?? ''), max).replace(/\s+/g, ' ').trim()
    const task = t(j.task, 300), done = t(j.done, 300)
    if (!task && !done) return undefined
    return { task, done, left: t(j.left, 300), area: t(j.area, 60), topic: normaliseTopic(t(j.topic, 120)), status: j.status === 'finished' || j.status === 'blocked' ? j.status : 'open' }
  } catch { return undefined }
}
/** The only fields sent for a record. The person's own words are never in it. */
export const recordBody = (a: { id: string; member: string; written: Exclude<WrittenRecord, { skip: true }>; stats: RecordStats; now: number }) =>
  JSON.stringify({
    id: a.id, member: a.member, area: a.written.area, status: a.written.status, turns: a.stats.turns, tool_calls: a.stats.toolCalls,
    minutes: Math.round((a.now - a.stats.startedAt) / 60_000), corrections: a.stats.corrections, kind: 'other',
    task: a.written.task, done: a.written.done, left: a.written.left, topic: a.written.topic,
  })


// ---------- team kit v1 (1.6.0): read the thread before writing, no short polling ----------
const arg = (e: Record<string, unknown>, k: string) => {
  const v = e[k] ?? (e.input as Record<string, unknown> | undefined)?.[k]
  return typeof v === 'string' || typeof v === 'number' ? String(v) : undefined
}
/** The chat a Machau Chat read or send call is about, if it names one. */
export const chatIdOfCall = (e: Record<string, unknown>) => arg(e, 'chat_id')
/** Calls that read a chat's messages (the reader's own connector: Sid's `machau-chat-sid` kind included). */
export const isChatRead = (tool: string) => {
  const p = splitMcp(tool)
  return p !== undefined && /^machau-chat/.test(p[0]) && (p[1] === 'get_messages' || p[1] === 'get_new_messages')
}
export const isChatSend = (tool: string) => {
  const p = splitMcp(tool)
  return p !== undefined && /^machau-chat/.test(p[0]) && p[1] === 'send_message'
}
export const READ_FIRST =
  'machau-mod: read this chat before you write in it. Call get_messages for this chat (the last 3 days at least), check what was already asked or answered, then send. This is said once per chat in a session.'
/** A timed wake-up under 20 minutes is polling: it costs a turn per look. */
export const MIN_WAKEUP_SECONDS = 20 * 60
export const POLL_REFUSED =
  'machau-mod: a wake-up under 20 minutes is polling, and every look costs a turn from your plan. To wait for a reply, send the message with a reply watch (Machau Chat\'s own: it wakes you when the answer comes). To wait for something else, ask the person to check later, or schedule one wake-up of 20 minutes or more.'
export const tooShortWakeup = (tool: string, e: Record<string, unknown>) => {
  if (tool !== 'ScheduleWakeup') return false
  const n = Number(arg(e, 'delaySeconds') ?? arg(e, 'delay_seconds') ?? arg(e, 'seconds'))
  return Number.isFinite(n) && n > 0 && n < MIN_WAKEUP_SECONDS
}


// ---------- company connectors (1.7.0): the addresses are in .mcp.json; people sign in as themselves ----------
/** The company connectors a person is expected to have, by the name Claude sees. Addresses only: no key, token or id. */
export const COMPANY_CONNECTORS: ReadonlyArray<{ name: string; address: string; what: string; bundled: boolean }> = [
  { name: 'bamboostan-app', address: 'https://app.bamboostan.com/api/mcp', what: 'staff app tools (your rights come from the staff access list)', bundled: true },
  { name: 'sutra', address: 'https://sutra.bamboostan.com/api/mcp', what: 'Sutra (your rights are your Sutra role; leaving = deactivation in Sutra)', bundled: true },
  // Every call re-reads the person's company membership (personContext), and removal deletes their personal keys: a removed person is refused.
  { name: 'machau-chat', address: 'https://chat.machau.in/api/mcp', what: 'Machau Chat (acts as you; ends when you are removed from the company)', bundled: true },
]
/** Which company connectors a session has: names from the fixed list only, never anything else the person has connected. */
export const connectorsSeen = (tools: readonly string[]): string[] => {
  const have = new Set(tools.map(t => splitMcp(t)?.[0]).filter((s): s is string => s !== undefined))
  return COMPANY_CONNECTORS.map(c => c.name).filter(n => [...have].some(h => h === n || h.startsWith(n)))
}
export const asksConnectors = (text: string) => /^\s*machau connectors\s*$/i.test(text)
export const CONNECTORS_ASK =
  'The person typed "machau connectors". Use the connectors skill: run `claude mcp list` in the shell, then say in one line each whether the company connectors (' +
  COMPANY_CONNECTORS.map(c => c.name).join(', ') +
  ') are connected, need a sign-in (tell them to run /mcp and sign in with their company Google account), or are missing (give the address from the skill and where to add it). Do not print any token.'
