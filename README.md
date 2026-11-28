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
| Task inbox | Tasks HQ gives you in Machau Chat (your own `machau-chat` connector) are looked for when a session starts, when you say "take my tasks", and at the end of a turn every 30 minutes. Claude plans each, does what it can with your connectors, asks you only for your judgement, replies in the task's thread with proof, and closes it only with proof. An idle session is not woken: the check waits for the next turn | on |
| Role kit check | Pick your role once by typing "my role is <role>" (tech, website, marketing, marketplaces, customer care, accounts, operations). Each day, the connectors of your role are checked once; a failing or missing one shows one line and Tech & Access gets one Machau Chat message about it (at most once a day per connector) | on |
| Company rules | A short set of company rules (`machau-mod/hooks/rules.ts`) is added to every session: read the last 3 days of a chat, close a task only with proof, no secrets in chat, payment emails copy the founder | on |
| Read before writing | A message to a Machau Chat chat you have not read in this session is held once, with a pointer to read the last days first | on |
| No short polling | A timed wake-up under 20 minutes (polling, a turn per look) is refused; wait with Machau Chat's reply watch instead | on |
| Reply rules | Five more company rules: answer first and plain, flag a wrong instruction, do what you can yourself, never say done without checking, put-offs become tasks | on |
| Skills: needs-you, put-offs, my-hq | "What needs me" builds your own live list as a page you tick; "your call" things become tasks; a light personal HQ for your day (one session; a back office only if you ask) | on, nothing runs unless you ask |
| Company connectors | The plugin carries the addresses of the staff app and Sutra connectors (no key; you sign in with your company Google account and your rights are the ones the company gave you). `machau connectors` tells you which company connectors work on this computer | on; sign-in is yours to do (`/mcp`) |

The founder's address for payment emails and the Tech & Access chat are read from your profile, not from this repo: `"founderEmail": "..."` and `"desks": { "techAccess": "<chat id>" }` (without `desks`, the messages go to the founder's own chat).

## Mac and Windows
The same mod runs on both, and nothing else needs installing. It finds out which computer it is on and uses that computer's own shell for its few small files (`sh` on a Mac, PowerShell on Windows).

What differs on Windows:
- `chrome.sh` does not exist there, so "No blank Chrome" is off unless you switch it on.
- The capacity check holds a start only when under a tenth of memory is free. The finer Mac rules (memory pressure, processor load, running builds) were measured on a Mac and are not applied on Windows yet; each check is written to the mod's log so they can be worked out.
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

## Team work record (1.5.x): what is sent, and when
Nothing is sent until HQ gives you a one-time code (valid one hour) and you type `machau enrol <code>` in Claude. After that:
- **Once a day:** your name, the plugin version, Mac or Windows, the pieces switched on, and when Claude was last used. Nothing else.
- **After real work (at most 3 times a session, 15 minutes apart):** your own Claude writes three short lines in plain words, which you can see in the session: the task, what was done, what is left, plus the project, a short topic and whether it finished. It is told to leave out customer names, phone numbers, addresses, emails, passwords and keys. Your own words are not sent. Counts (turns, tool calls, corrections, minutes) go with it.
- **Cost:** about 170 tokens in and 90 out per record, so under 800 fresh tokens in a long session.
- **Removed twice:** phone numbers, emails, keys, passwords, PAN, GSTIN, Aadhaar and card numbers are stripped on your computer and again on the collector.
- **See what was sent in your name:** type `machau records` in Claude. The same lines are in `.local/state/machau-mod/records.jsonl` in your home folder.
- Records are kept 90 days; only Sid and Divya can read them. To stop: delete `.config/machau-mod/collector.json`, or set `"switches": {"heartbeat": false, "workRecord": false}` in your profile.

## Your own switches
Create `.config/machau-mod/profile.json` in your home folder, for example `{ "switches": { "autoShrink": false, "noClaudeInChrome": true } }`. It is read once per session. The names are in `machau-mod/hooks/register.ts`.

## What the mod did
Each time a piece acts it adds one line to `.local/state/machau-mod/events.jsonl` in your home folder (never a secret, and none of your conversation). The first line of every session says which version loaded and on which computer.

## Never put keys in this repo
It is public. Keys stay in each person's own Keychain.

## Changing the mod
Logic in `machau-mod/hooks/lib.ts` with a test (`node --test machau-mod/hooks/*.test.ts`), hook in `register.ts`, a row above, and a higher `version` in `machau-mod/.claude-plugin/plugin.json` and in `lib.ts`. Anything that touches the computer goes through `hooks/host.ts`, with a Mac and a Windows form. Run `claude plugin validate ./machau-mod` before pushing; every push is also tested on a real Mac and a real Windows machine (the Actions tab).
