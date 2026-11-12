# Machau's Claude mod

Small guards and savings that run inside every Claude Code session (the Code tab of the Claude app, or `claude` in a terminal).
It does nothing in ordinary chat.

| Piece | What it does | Default |
|---|---|---|
| Secret mask | Keys and passwords in command output are masked before Claude and the saved transcript see them | on |
| No blank Chrome | Refuses Playwright's logged-out Chrome window; points Claude to `chrome.sh` (a background tab in your own Chrome, Mac only) or the built-in browser | on |
| Context trim | Sessions start smaller: big connectors show as one line, long instructions arrive when first needed | on |
| Model routing | A helper started without a model gets Opus, Sonnet or Haiku by what its work needs | on |
| Live-claim guard | "It is live" after a deploy needs a ship check first (needs `~/os/bin/ship-check.py`) | off |
| No Claude in Chrome | Refuses the Claude in Chrome tools | off |

## Install (once)
You need a GitHub account that has been invited to this repo, and to be signed in to GitHub on your machine (`gh auth login`).

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
Create `~/.config/machau-mod/profile.json`, for example `{ "switches": { "noClaudeInChrome": true } }`.

## Never put keys in this repo
Everyone invited would get them. Keys stay in each person's own Keychain.

## Changing the mod
Logic in `machau-mod/hooks/lib.ts` with a test (`node --test machau-mod/hooks/lib.test.ts`), hook in `register.ts`, a row above, and a higher `version` in `machau-mod/.claude-plugin/plugin.json`.
