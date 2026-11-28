// Live check of conditions (b): every company address must refuse a call with no sign-in, and point to a real sign-in.
// Run: node tools/check-connectors.mjs   (network; not part of CI). Exit 1 if any address fails.
import { readFileSync } from 'node:fs'
const servers = JSON.parse(readFileSync(new URL('../machau-mod/.mcp.json', import.meta.url), 'utf8')).mcpServers
let bad = 0
for (const [name, s] of Object.entries(servers)) {
  const r = await fetch(s.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  const www = r.headers.get('www-authenticate') || ''
  const meta = /resource_metadata="([^"]+)"/.exec(www)?.[1]
  let issuer = '', authEndpoint = ''
  if (meta) {
    const pr = await (await fetch(meta)).json().catch(() => ({}))
    issuer = (pr.authorization_servers || [])[0] || ''
    if (issuer) {
      const as = await (await fetch(new URL('/.well-known/oauth-authorization-server', issuer))).json().catch(() => ({}))
      authEndpoint = as.authorization_endpoint || ''
    }
  }
  const ok = r.status === 401 && !!meta && !!authEndpoint
  if (!ok) bad++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: no sign-in -> HTTP ${r.status}; sign-in pointer ${meta ? 'yes' : 'NO'}; authorize endpoint ${authEndpoint ? new URL(authEndpoint).host : 'NO'}`)
}
process.exit(bad ? 1 : 0)
