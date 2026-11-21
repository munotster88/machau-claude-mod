# Machau's Claude mod

Small guards and savings that run inside every Claude Code session (the Code tab of the Claude app, or `claude` in a terminal).
It does nothing in ordinary chat.

| Piece | What it does | Default |
|---|---|---|
| Secret mask | Keys and passwords in command output are masked before Claude and the saved transcript see them | on |
| Context trim | Sessions start smaller: big connectors show as one line, long instructions arrive when first needed | on |
| Model routing | A helper started without a model gets Opus, Sonnet or Haiku by what its work needs | on |
| Task-list ticks | In the Claude app, a step of the task list that has shown as running for 8 tool calls gets a reminder to tick it, so the list moves while the work runs | on |
| Session shrink | A long session is shortened in place: every word between you and Claude is kept, old tool output becomes one-line receipts. Past 300k tokens it happens by itself between tasks; "shrink this session" does it on request | on |
| Capacity check | A new session or helper is held when the computer has no memory left for it. Type "start it anyway" to set it aside for 10 minutes | on |
| Company Brain | Only if you have connected the Company Brain to Claude: Claude asks it before changing something a colleague may also be working on, and saves one short note when a task is finished (what was asked, decided and changed, and where). The note goes in under your own sign-in as a tool call you can see; the brain redacts and reviews it before anyone else can find it. Never keys, customer details or raw output | on |
| No blank Chrome | Refuses Playwright's logged-out Chrome window; points Claude to `chrome.sh` (a background tab in your own Chrome, Mac only) or the built-in browser | on (Mac), off (Windows) |
| Live-claim guard | "It is live" after a deploy needs a ship check first (needs `~/os/bin/ship-check.py`) | off |
| No Claude in Chrome | Refuses the Claude in Chrome tools | off |

## Mac and Windows
The same mod runs on both, and nothing else needs installing. It finds out which computer it is on and uses that computer's own shell for its few small files (`sh` on a Mac, PowerShell on Windows).

What differs on Windows:
- `chrome.sh` does not exist there, so "No blank Chrome" is off unless you switch it on.
- The capacity check holds a start only when under a tenth of memory is free. The finer Mac rules (swap, processor load, running builds) were measured on a Mac and are not applied on Windows yet; each check is written to the mod's log so they can be worked out.
- "Home folder" below means `C:\Users\<you>`.

## Install (once)
Easiest: paste this into a Code session in the Claude app and let Claude do it:

> Install the Claude plugin machau-mod from the GitHub marketplace munotster88/machau-claude-mod (run `claude plugin marketplace add munotster88/machau-claude-mod`, then `claude plugin install machau-mod@machau`) and tell me when it is done.

Or run the two commands yourself in a terminal:

```bash
claude plugin marketplace add munotster88/machau-claude-mod
```
```bash
claude plugin install machau-mod@machau
```
Then quit and reopen Claude.

## Updates
```bash
claude plugin marketplace update machau
```
```bash
claude plugin update machau-mod@machau
```

## Your own switches
Create `.config/machau-mod/profile.json` in your home folder, for example `{ "switches": { "autoShrink": false, "noClaudeInChrome": true } }`. It is read once per session. The names are in `machau-mod/hooks/register.ts`.

## What the mod did
Each time a piece acts it adds one line to `.local/state/machau-mod/events.jsonl` in your home folder (never a secret, and none of your conversation). The first line of every session says which version loaded and on which computer.

## Never put keys in this repo
It is public. Keys stay in each person's own Keychain.

## Changing the mod
Logic in `machau-mod/hooks/lib.ts` with a test (`node --test machau-mod/hooks/*.test.ts`), hook in `register.ts`, a row above, and a higher `version` in `machau-mod/.claude-plugin/plugin.json` and in `lib.ts`. Anything that touches the computer goes through `hooks/host.ts`, with a Mac and a Windows form. Run `claude plugin validate ./machau-mod` before pushing; every push is also tested on a real Mac and a real Windows machine (the Actions tab).
