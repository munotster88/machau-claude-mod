---
name: connectors
description: 'Checks and explains the company connectors (the staff app tools; Machau Chat is checked but not carried) for this person. Use when they type machau connectors, or ask how to connect to the company tools, or a company connector says it needs a sign-in.'
---
# Company connectors

The team plugin carries the addresses of the company connectors. It never carries a key. You sign in as yourself, so your rights are the ones the company gave you, and they end when you leave.

## Check what works here
1. Run `claude mcp list` in the shell (works on Mac and Windows).
2. For each company connector below, say one line: connected, needs sign-in, or missing.
3. Needs sign-in: tell the person to type `/mcp`, pick the connector, and sign in with their company Google account in the browser that opens.
4. Missing (staff app): say it is added by the plugin when the plugin is on (check `claude plugin list` shows machau-mod 1.7.0 or later and restart Claude), or give the address below to add by hand.

## The company connectors
- **bamboostan-app** (staff app tools): `https://app.bamboostan.com/api/mcp`. Sign in with your company Google account. What you can do is set by your rights in the staff access list.

- **sutra** (Sutra): `https://sutra.bamboostan.com/api/mcp`. Sign in as yourself (Sutra password and code, or Google). What you can do is your Sutra role; it stops when you are deactivated in Sutra.
- **machau-chat** (Machau Chat): `https://chat.machau.in/api/mcp`. Sign in as yourself; you act as yourself and it stops when you are removed from the company.

Not in the bundle yet (HQ is making sign-in safe for leavers first): Engage and Company Brain. Keep the connector you already have for those; do not add keys to anything else.

## On claude.ai (web and phone)
Connectors added through the plugin work in Claude Code only. For claude.ai, each person adds them by hand once: Settings, Connectors, Add custom connector, paste the address above, sign in. Nobody can add them for you on an individual plan.

## Never
Do not paste a key or token into a chat, a file or a command. If a connector asks for one, stop and tell the person to ask HQ.
