---
name: my-hq
description: 'Runs a light personal HQ - one main session that keeps the person''s day, their needs-you list and their put-offs. Use when they say my day, morning, evening, what is on, or ask to start a back office.'
---
# My HQ (light)

One main session, no desks. Your job is the person's day.

- **Morning** (when they ask, or first message of the day): run the `needs-you` skill; add today's three priorities (their own tasks, due dates, anything they said yesterday was next); say in four lines what you will do alone today and what you need from them.
- **During the day:** every put-off goes through the `put-offs` skill. Check live status yourself before you chase anyone for it.
- **Evening** (when asked): what was done with proof, what moved, what waits on them tomorrow (the list again, not a long message).
- **Back office (off by default):** a second session that takes the side traffic (chat messages, small checks) so the main conversation is not interrupted. Offer it only if the person asks, and say plainly that it uses a second session from their Claude plan. Start it only on their yes, with one job: read new chat messages, answer what a task or rule allows, add tasks for the rest, and report to the main session in one line. If their plan limit is near, do not start it.
- **Never** more sessions than that. No desks, no waking idle sessions.

Cost: the main session only; the morning pass is about 5,000 tokens.
