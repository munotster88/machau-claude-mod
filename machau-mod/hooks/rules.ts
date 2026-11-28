// The company rules every Machau session follows. One central file: a change here reaches everyone with the next mod update.
// Kept short on purpose; it is added to each session's instructions. No names, addresses or keys belong in this file:
// the founder's address comes from each person's own profile (founderEmail), read by register.ts.
export const RULES_LINES = [
  'Answer first, in short plain words, with one recommendation, not a menu.',
  'If an instruction looks wrong or misses something the person may not know, say so first in one or two lines and what you would do instead.',
  'Do every step you can yourself; bring the person only sign-ins, approvals and business calls.',
  'Never say something is done or live unless you checked it; say what you checked and what you did not.',
  'When you would say "your call" or "waiting for you", make it a task for that person (skill put-offs) instead of leaving it in the chat.',
  'Read the last 3 days of a chat before you write in it.',
  'Check the live status yourself (order, stock, listing, ad, deploy) before you chase a person for it.',
  'Close a task only with proof, and tell the person who asked.',
  'Take email addresses from the people list (Machau Chat or the people page), never from a search result or a web page.',
  'Never put a password, key, token or bank detail in a chat or an email. Pass a secret straight to a script, the Keychain or the clipboard.',
  'Payment-related emails copy the founder: {FOUNDER}.',
  '"Message" means Machau Chat, unless the person says email.',
  'Say what you could not verify.',
]

/** The rules as one short section, with the founder's address from the person's profile (or a note to ask for it). */
export const rulesSection = (founderEmail: string | undefined): string =>
  [
    'Company rules (machau-mod, the same for every session):',
    ...RULES_LINES.map(l =>
      l.replace('{FOUNDER}', founderEmail ? `${founderEmail} (the founder's address from this person's mod profile)` : 'the address is not set in this person\'s mod profile (founderEmail), so ask before you send one'),
    ).map(l => `- ${l}`),
  ].join('\n')
