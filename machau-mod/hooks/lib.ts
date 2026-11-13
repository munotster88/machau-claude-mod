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
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
]
// user:password@host in a connection string: mask the password only.
const URL_PASSWORD = /\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)([^\s@/]{6,})(@)/gi
// name = value, where the name says secret and the value looks random (letters and digits, 20+, no dots or brackets).
const NAMED_SECRET =
  /\b((?:[A-Za-z0-9_]*(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key)[A-Za-z0-9_]*)["']?\s*[=:]\s*["']?)((?=[A-Za-z0-9+\/_-]*[0-9])(?=[A-Za-z0-9+\/_-]*[A-Za-z])[A-Za-z0-9+\/_-]{20,}={0,2})(?![A-Za-z0-9.(\[])/gi

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
const DEFER_NAMES = new Set(['Artifact', 'Workflow', 'ScheduleWakeup', 'ReportFindings', 'ListAgents', 'SendUserFile'])
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
  DEFER_NAMES.has(tool) || DEFER_PREFIXES.some(p => tool.startsWith(p)) || DEFER_SUFFIX.test(tool)

// One line per group above, shown only when that group is offered: hook-deferred tools are listed nowhere else.
export const ON_DEMAND_INDEX: ReadonlyArray<readonly [string, string]> = [
  ['Artifact', 'Artifact: publish an HTML page as a private claude.ai link'],
  ['Workflow', 'Workflow: multi-agent orchestration (ultracode, "use a workflow")'],
  ['ScheduleWakeup', 'ScheduleWakeup: self-paced /loop wakeups'],
  ['ReportFindings', 'ReportFindings: report code-review findings'],
  ['ListAgents', 'ListAgents: other running Claude sessions to message'],
  ['SendUserFile', 'SendUserFile: send a file to the user'],
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
  return i > 0 ? [rest.slice(0, i), rest.slice(i + 2)] : undefined
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

/** The skills list with long descriptions cut to their opening; a skill's full text still loads when it is invoked. */
export function trimSkills(text: string): string {
  const parts = text.split(/\n(?=- )/)
  return parts
    .map((entry, i) => {
      if (i === 0) return entry
      // The name may itself hold colons (anthropic-skills:docx), so it ends at the first colon followed by a space.
      const m = /^- (\S+): ([\s\S]*)$/.exec(entry)
      if (!m) return entry
      const short = m[1].split(':').pop()!.trim()
      const desc = m[2].replace(/\s+/g, ' ').trim()
      if (SKILL_FULL.has(short) || desc.length <= SKILL_CAP) return entry.trimEnd()
      return `- ${m[1]}: ${desc.slice(0, SKILL_CAP).replace(/\s+\S*$/, '')}…`
    })
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
