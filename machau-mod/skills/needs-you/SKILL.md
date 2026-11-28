---
name: needs-you
description: Shows the person's own live "needs you" list: what waits on them, as a page they tick. Use when they ask "what needs me", "my list", "what is waiting on me", or at the start of their day.
---
# Needs you: the person's own live list

What waits on this person, in one checked list. Their own tasks only. Do this once when asked, never on a timer.

1. **Collect.** Open tasks assigned to the person in Machau Chat (the `list_tasks` tool of their `machau-chat` connector), plus anything they told you today is waiting on them. Check each is still open and not already done by a message in its chat (read the last 3 days) before it goes on the list. Drop duplicates.
2. **Page.** The page file is `skills/needs-you/page.html` in this plugin (its folder is `${CLAUDE_PLUGIN_ROOT}`). Look for the saved link in `~/.config/machau-mod/needs-you-url.txt` (home folder; use your file tools, which work on Mac and Windows).
   - No saved link: publish the page file with the Artifact tool, `capabilities: {"db": {}}`, a short icon word such as "checklist", then save the link in that file.
   - Saved link: reuse it; do not publish again unless the page file changed.
3. **Rows.** With the ArtifactData tool, write one document per item in collection `needs` (use the task id as `doc_id`): `title` (short, plain), `detail` (one line: what to do, or what it costs), `due` (YYYY-MM-DD, optional), `done: false`, `checked_at` (now, ISO). For an item already in the list, update `title`, `detail`, `due`, `checked_at` only, never `done`: the person's tick is theirs. Set `done: true` for an item whose task you found closed. Read the collection first so you pin each write with its version.
4. **Say** one line: how many need them, the top one, and the link. Do not list everything again in the reply.
5. **Fallback.** If the Artifact tool is not offered, the publish is refused, or the database is not available on this plan, do not stop and do not hunt for a workaround: give a plain numbered list in the reply (the same items) and say once that the page could not be made. The tasks in Machau Chat stay the real list either way.

Cost: one pass is about 3,000 to 5,000 tokens. Do it when asked, or once at the start of a day, not more often.
