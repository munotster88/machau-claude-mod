---
name: needs-you
description: 'Shows the person''s own live needs you list - what waits on them, as a page they tick. Use when they ask what needs me, my list, what is waiting on me, or at the start of their day.'
---
# Needs you: the person's own live list

What waits on this person, in one checked list. Their own items only. Do this once when asked, never on a timer. Keep it cheap: the page is below, so do not search for files, and do not load another skill unless the Artifact tool refuses without it.

1. **Collect.** Open tasks assigned to the person (the `list_tasks` tool of their Machau Chat connector; the connector may be called `machau-chat` or `machau-chats`), plus anything they told you today is waiting on them. Check each is still open and not already done by a message in its chat (read the last 3 days) before it goes on the list. Drop duplicates.
   If the task list is short or empty, say so and ask once: "Want me to read your last 3 days of chats for asks addressed to you that are still open, and add them?" Only on a yes, read only their own chats, and list only asks to them that nobody has answered. Never add anything from another person's private chats.
2. **Page.** Look for the saved link in `~/.config/machau-mod/needs-you-url.txt` (home folder; use your file tools, they work on Mac and Windows).
   - No saved link: write the page below to a file in your scratch or temp folder (for example `needs-you.html`), publish that file with the Artifact tool, `capabilities: {"db": {}}`, icon word "checklist", then save the link in the saved-link file.
   - Saved link: reuse it; do not publish again.
3. **Rows.** With the ArtifactData tool, write one document per item in collection `needs` (task id as `doc_id`): `title` (short, plain), `detail` (one line: what to do, or what it costs), `due` (YYYY-MM-DD, optional), `done: false`, `checked_at` (now, ISO). For an item already in the list, update `title`, `detail`, `due`, `checked_at` only, never `done`: the person's tick is theirs. Set `done: true` for an item whose task you found closed. Read the collection first so each write is pinned with its version.
4. **Say** one line: how many need them, the top one, and the link. Do not list everything again in the reply.
5. **Fallback.** If the Artifact tool is not offered, the publish is refused, or the database is not available on this plan, give a plain numbered list in the reply and say once that the page could not be made. The tasks in Machau Chat stay the real list either way.

Cost: one pass is about 3,000 to 5,000 tokens. Do it when asked, or once at the start of a day, not more often.

## The page (write it exactly as it is)
```html
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Needs you</title><style>
:root{--bg:#f7f6f2;--fg:#1d1d1b;--muted:#5d5b55;--card:#fff;--rule:#dcd9cf;--ok:#1f6b43;--warn:#a65a00}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#161714;--fg:#eceae3;--muted:#aaa79a;--card:#20211d;--rule:#3a3b35;--ok:#8fd09a;--warn:#f0b060}}
:root[data-theme="dark"]{--bg:#161714;--fg:#eceae3;--muted:#aaa79a;--card:#20211d;--rule:#3a3b35;--ok:#8fd09a;--warn:#f0b060}
body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.5 -apple-system,system-ui,sans-serif;padding:16px 16px 48px;max-width:640px}
h1{font-size:1.3rem;margin:0 0 4px}.m{color:var(--muted);font-size:.88rem}
.row{display:flex;gap:12px;align-items:flex-start;background:var(--card);border:1px solid var(--rule);border-radius:10px;padding:12px 14px;margin:8px 0}
.row input{width:22px;height:22px;margin-top:3px}.row.done{opacity:.55}.row.done .t{text-decoration:line-through}
.t{font-weight:600}.d{color:var(--muted);font-size:.9rem}.due{color:var(--warn);font-size:.85rem}
</style></head><body>
<h1>Needs you: <span id="n">…</span></h1><div class="m" id="stamp">Loading…</div><div id="rows"></div>
<script>
(async () => {
  const $ = (s) => document.querySelector(s);
  const db = await claude.use('db');
  if (!db) { $('#stamp').textContent = 'This page needs to be opened signed in to Claude.'; return; }
  const col = db.collection('needs');
  const render = (docs) => {
    const rows = docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.done === true) - (b.done === true) || String(a.due || '9').localeCompare(String(b.due || '9')));
    $('#n').textContent = rows.filter(r => !r.done).length + ' open';
    $('#rows').replaceChildren(...rows.map(r => {
      const el = document.createElement('label'); el.className = 'row' + (r.done ? ' done' : '');
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!r.done;
      cb.addEventListener('change', () => col.doc(r.id).update({ done: cb.checked, done_at: cb.checked ? new Date().toISOString() : null }));
      const box = document.createElement('div');
      const t = document.createElement('div'); t.className = 't'; t.textContent = r.title || '';
      const d = document.createElement('div'); d.className = 'd'; d.textContent = r.detail || '';
      box.append(t, d);
      if (r.due) { const u = document.createElement('div'); u.className = 'due'; u.textContent = 'Due ' + r.due; box.append(u); }
      el.append(cb, box); return el;
    }));
    $('#stamp').textContent = 'Checked by Claude ' + (rows[0] && rows[0].checked_at ? new Date(rows[0].checked_at).toLocaleString() : 'not yet') + '. Tick a row when you have done it.';
  };
  const t = setTimeout(() => { $('#stamp').textContent = 'No data yet.'; }, 10000);
  col.onSnapshot(s => { clearTimeout(t); render(s.docs); });
})();
</script></body></html>
```
