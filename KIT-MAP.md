# KIT-MAP: every piece of Sid's Claude set-up and what the team plugin does about it

Kept in step by `~/os/bin/kit-gap.py` (run it with sid-mod's checks): a sid-mod piece with no row fails. Names only, nothing private.
Status: `in-team` the team plugin has it; `v1` team kit v1 (1.6.0, unpublished until Sid says); `v2` later, with the reason; `decided-no`; `sid-only` depends on Sid's data, accounts or Mac.
When a working-method fix is made in Sid's set-up: add the piece to sid-mod's README table and a row here the same day.

| piece | status | team equivalent | reason | date |
|---|---|---|---|---|
| liveguard | in-team | liveGuard (off by default) | Same guard; needs ship-check.py, so off for staff | 2026-11-28 |
| noclaudeinchrome | in-team | noClaudeInChrome (off) | Refuses the Chrome extension tools | 2026-11-28 |
| adsguard | sid-only |  | Sid's Google Ads limits and tools | 2026-11-28 |
| noblankchrome | in-team | noBlankChrome (on Mac, off Windows) | Same refusal; chrome.sh is Mac only | 2026-11-28 |
| secretmask | in-team | secretMask | Same piece | 2026-11-28 |
| contexttrim | in-team | contextTrim | Same piece | 2026-11-28 |
| modelrouting | in-team | modelRouting | Same piece | 2026-11-28 |
| savecap | sid-only |  | Sid's one-capture-per-task rule for his Company Brain | 2026-11-28 |
| readablepage | sid-only |  | Sid reads pages, not .md; staff do not share the habit | 2026-11-28 |
| dictationnames | sid-only |  | Reads Sid's vault and his dictation mistakes | 2026-11-28 |
| factcatcher | sid-only |  | Files facts in Sid's MBP vault | 2026-11-28 |
| sessionsize | in-team | session shrink | Same, with "shrink this session" | 2026-11-28 |
| quiet nudges | v2 |  | Team plugin nudges with a prompt; quiet Stop-hook notes need testing on staff plans | 2026-11-28 |
| smartshrink | in-team | smartShrink | Same piece | 2026-11-28 |
| autoshrink | in-team | session shrink (automatic) | Same piece | 2026-11-28 |
| selfdrive | v2 |  | Costs a small model call per reply; wait for plan-limit data | 2026-11-28 |
| autorecall | v2 |  | Needs a place for each person's memory and a privacy decision | 2026-11-28 |
| plantick | in-team | task-list ticks | Same piece | 2026-11-28 |
| one desk per company | v2 |  | Parallel sessions drain individual plans; built around Sid's chat | 2026-11-28 |
| bil text in a shared person's chat | sid-only |  | BIL clean room, Sid only | 2026-11-28 |
| prompts are not recordings | sid-only |  | NeoSapien round, Sid only | 2026-11-28 |
| chatwatch | v2 |  | Needs the app open and a minute timer; preset reply watch used in v1 | 2026-11-28 |
| until | v2 |  | v1 has presets only; custom shell checks must be PowerShell on Windows | 2026-11-28 |
| pollguard | v1 | pollGuard (1.6.0) | Built in team kit v1 | 2026-11-28 |
| daily round | sid-only |  | NeoSapien digest, Sid only | 2026-11-28 |
| desk keeper | v2 |  | Only with desks | 2026-11-28 |
| memory line | sid-only |  | Mac memory pressure line | 2026-11-28 |
| deskguard | v2 |  | Only with HQ and desks | 2026-11-28 |
| waiting-list check | v2 |  | Follows the waiting list once it runs for staff | 2026-11-28 |
| hq wake-ups | v2 |  | Only with HQ and desks | 2026-11-28 |
| picklist | v2 |  | Widget tool not proven on staff plans | 2026-11-28 |
| bossguard | sid-only |  | Sid's boss and employee session split | 2026-11-28 |
| capacitygate | in-team | capacity check | Same idea; Windows reading of memory included | 2026-11-28 |
| waiting list | v1 | put-offs skill (1.6.0) | Put-offs become tasks, in the person's own connector | 2026-11-28 |
| taskregister | v2 |  | Needs a per-person task file | 2026-11-28 |
| sidedesk | v2 |  | Parallel desk session; costs plan | 2026-11-28 |
| voice | sid-only |  | ffmpeg and a local model on Sid's Mac | 2026-11-28 |
| team inbox | in-team | task inbox | Same idea, inside the plugin | 2026-11-28 |
| strip | v2 |  | Mac app hook; the needs-you page replaces it in v1 | 2026-11-28 |
| scoreboard | in-team | events.jsonl log | Same local log | 2026-11-28 |
| keysclip | sid-only | | Sid's key store and clipboard helper (Mac) | 2026-11-28 |
| hq back office | v1 | skill my-hq (back office off by default) | Hook-driven traffic takeover is Sid's; the team version is a plain second session the person starts | 2026-11-28 |

## Team-only pieces (not in Sid's mod, so never "stale")

| piece | status | team equivalent | reason | date |
|---|---|---|---|---|
| read before writing | v1 | readThread (1.6.0) | Shakti #3; new in team kit v1 | 2026-11-28 |
| needs-you list | v1 | skill needs-you (1.6.0) | Live list from the person's own tasks | 2026-11-28 |
| my hq (light) | v1 | skill my-hq (1.6.0) | One main session; back office off by default | 2026-11-28 |
| company connectors | v1 | .mcp.json (staff app) + skill connectors + `machau connectors` (1.7.0) | staff app, Sutra and Machau Chat carried; Engage and Brain wait: they fail the leaver test | 2026-11-28 |
| report a problem | v1 | skill report-problem + rule + [problem] guard (1.8.0) | Sid 28 Nov: solve it with Claude first; if not, a six-part report to Sid's chat desk, only on the person's yes | 2026-11-28 |
