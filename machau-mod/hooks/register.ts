import type { Register } from 'claude-code'
import {
  ON_DEMAND_INDEX, ROUTED_TYPES, ROUTE_LABELS, briefFor, hasLiveVerdict, isClaudeInChrome, isDeployish, isPlaywright, liveClaim,
  maskSecrets, routeFor, routeId, serversIn, shouldDefer, trimInstructions, trimSkills, trimToolList,
} from './lib.ts'

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
}
type Switches = typeof DEFAULTS

// Scoreboard: every time a piece acts it writes one line to ~/.local/state/machau-mod/events.jsonl, so the monthly
// review can see what each piece changed. Never holds a secret, and no reply text beyond the flagged sentence.
// (A mod may not import Node's file library; it appends through one small shell command instead.)
type Host = { process: { run: (argv: readonly string[]) => Promise<unknown> } }
const PROFILE = 'cat "$HOME/.config/machau-mod/profile.json" 2>/dev/null || true'
let switches: Promise<Switches> | undefined
/** The switches for this person: the defaults, changed by their profile file if they have one. */
const sw = ($: Host): Promise<Switches> =>
  (switches ??= $.process
    .run(['/bin/sh', '-c', PROFILE])
    .then(r => {
      const out = typeof r === 'string' ? r : String((r as { stdout?: unknown })?.stdout ?? '')
      const own = out.trim() ? (JSON.parse(out) as { switches?: Partial<Switches> }).switches : undefined
      return { ...DEFAULTS, ...own }
    })
    .catch(() => DEFAULTS))
const APPEND = 'mkdir -p "$HOME/.local/state/machau-mod" && printf "%s\\n" "$1" >> "$HOME/.local/state/machau-mod/events.jsonl"'
const record = ($: Host, piece: string, detail: unknown) =>
  $.process
    .run(['/bin/sh', '-c', APPEND, 'machau-mod', JSON.stringify({ at: new Date().toISOString(), piece, detail })])
    .catch(() => {}) // a guard never fails a turn over its own log

const CHROME_DENY =
  'House rule: Claude in Chrome is not used here (it is unreliable). For the signed-in Chrome use `chrome.sh`; ' +
  'for anything else use the built-in browser (mcp__Claude_Browser__*).'

const PLAYWRIGHT_DENY =
  'House rule: Playwright is not used here. It opens a new, blank Chrome window with none of the sign-ins. ' +
  'For a site that needs a sign-in use `chrome.sh open URL` (a background tab in the real Chrome, Mac only; then ' +
  '`text`, `js`, `click`). For local previews, public pages, screenshots and resizing use the built-in browser ' +
  '(mcp__Claude_Browser__*, ToolSearch "+Claude_Browser").'

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
  // Context trim: connector instructions held back, and which loop already got which one.
  const held: Record<string, string> = {}
  const handedOver = new Set<string>()
  const savedOnce = new Set<string>()

  on('tool.check', async ($, e, next) => {
    if ((await sw($)).noClaudeInChrome && isClaudeInChrome(e.tool)) return { decision: 'deny', reason: CHROME_DENY }
    if ((await sw($)).noBlankChrome && isPlaywright(String(e.tool))) return { decision: 'deny', reason: PLAYWRIGHT_DENY }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    if ((await sw($)).noClaudeInChrome && isClaudeInChrome(tool)) {
      void record($, 'noClaudeInChrome', tool)
      return { deny: CHROME_DENY }
    }
    if ((await sw($)).noBlankChrome && isPlaywright(tool)) {
      void record($, 'noBlankChrome', tool)
      return { deny: PLAYWRIGHT_DENY }
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

    const r = await next(call)
    if (r.deny !== undefined) return r

    if ((await sw($)).liveGuard) {
      tick++
      const command = tool === 'Bash' ? String((e as { command?: unknown }).command ?? '') : ''
      // A LIVE verdict counts only from the ship check itself (or from reading its output after it was started),
      // never from some other tool's text that happens to hold the words.
      const isShipCheck = /\bship-check\b/.test(command)
      if (isShipCheck) shipCheckStarted = true
      if (hasLiveVerdict(r.text ?? '') && (isShipCheck || (shipCheckStarted && !command))) liveAt = tick
      else if (isDeployish(command) || tool === 'mcp__ccd_pr__set_auto_merge') deployAt = tick
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
        return { ...r, context: [...(r.context ?? []), `Instructions for the connector(s) you just looked up (held back until now by machau-mod):\n\n${pages.join('\n\n')}`] }
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
    if (!(await sw($)).liveGuard || e.agentId !== undefined || e.reason !== 'answer') return r
    if (deployAt <= liveAt || nudgedFor === deployAt) return r
    const sentence = liveClaim(e.answer)
    if (!sentence) return r
    nudgedFor = deployAt
    void record($, 'liveGuard', sentence)
    // Not awaited: a plugin's prompt runs once the session is idle, which is after this hook returns.
    void $.prompt.submit({ text: LIVE_NUDGE(sentence) }).catch(() => {})
    return r
  })

  // ---------- context trim ----------
  on('tool.describe', async ($, e, next) => {
    const r = await next(e)
    return (await sw($)).contextTrim && shouldDefer(String(e.tool)) ? { ...r, isDeferred: true } : r
  })

  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    if (!(await sw($)).contextTrim) return r
    const offered = ON_DEMAND_INDEX.filter(([key]) => e.tools.some(t => (key.endsWith('__') ? t.startsWith(key) : t === key)))
    if (offered.length === 0) return r
    const text = [
      'Tools available on demand (not preloaded; load with ToolSearch, e.g. "select:Artifact", before first use):',
      ...offered.map(([, line]) => `- ${line}`),
    ].join('\n')
    return { sections: [...r.sections, { id: 'machau-mod:on-demand', text, scope: 'session' as const }] }
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
