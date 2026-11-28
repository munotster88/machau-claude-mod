---
name: report-problem
description: 'Solves a work problem with the person, and if Claude cannot, sends a short problem report to Sid. Use when the person describes a problem at work, a tool that does not do what they need, or says report a problem.'
---
# Report a problem

Sid asked that everyone explains their problem to their own Claude first. Most problems end here.

1. **Try to solve it.** Use the connectors you have (staff app, Sutra, Machau Chat, the others the person has): look at the real order, stock, listing or screen, find the cause, and give the person the fix or the next step. If it is solved, say so in two lines and stop. Do not send anything.
2. **If you cannot solve it**, draft a problem report with exactly these six parts, in plain short words:
   - **Trying to do:** what the person was trying to do.
   - **Happened instead:** what happened.
   - **Example:** one real example with its order number or code (a number or code only: no customer name, phone, address, email, password, key or Amazon buyer detail).
   - **How often and cost:** how often it happens and what it costs (time, money, orders).
   - **Already tried:** what you and the person already tried.
   - **Fix, in their words:** what would fix it, as the person says it.
3. **Show the draft to the person** in your reply and ask "send this to Sid?". Do not send before a yes. Change what they ask you to change.
4. **On their yes**, send it from their own account in Machau Chat: find Sid with `find_people` (Siddharth Munot), open the direct chat with `start_direct_chat`, read the last messages of that chat first, then `send_message`. The first line must be exactly `[problem] <one-line title>`, then the six parts as short lines. Sid's chat desk recognises that first line and routes it.
5. **Tell the person** it is sent and that Sid or the tech team will answer in Machau Chat. Do not wait for the answer in this session.

Never put a password, key, token, bank detail, customer name, phone, address or Amazon buyer detail in the report. The plugin refuses to send a `[problem]` message that holds a phone number, email address or key-like text.

Cost: nothing on start-up and no extra session. About 1,500 tokens when used.
