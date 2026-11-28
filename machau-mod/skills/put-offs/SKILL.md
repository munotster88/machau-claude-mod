---
name: put-offs
description: 'When you are about to tell the person your call, needs your approval, waiting on you or to leave something for later, make it a task for them instead. Use whenever something is put off to the person.'
---
# Put-offs become tasks

A thing left "for you to decide" in a chat reply is forgotten within a day. So:

1. Before you write "your call", "needs you", "waiting for your yes" or similar, check `list_tasks` (the person's `machau-chat` connector) for an open task that already covers it (same chat, same message, a look-alike title). If one exists, say so and stop.
2. Otherwise create one task with the connector's `create_task`, assigned to this person: a title that says what they must do (under 12 words), the chat or message it came from, and a due date (customer or approval: 1 day; team: 3 days; info: 7 days).
3. In your reply say what you made, in one line. Do not ask the person to remember it.
4. Close a task only with proof (a message, a record, a changed page), and tell whoever asked. Never close it because time passed.
5. Tasks are for THIS person only. If the thing is really for someone else, tell the person who you think should do it and ask before creating anything for anyone else.
6. If the connector is not available, say so once and put the item at the top of your reply instead.

Cost: one tool call per put-off; none when nothing is put off.
