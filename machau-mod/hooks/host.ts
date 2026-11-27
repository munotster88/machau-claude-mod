// What the mod needs from the computer it runs on, the same on a Mac and on Windows: a few small files under the
// person's home folder, and one reading of memory. A mod may not import Node's file library, so each is one short
// command: /bin/sh on a Mac or Linux, Windows PowerShell on Windows (it is always there; the command travels
// base64-encoded, so nothing in it ever needs quoting). Every call fails soft: no answer means '' or undefined.
export type Run = { process: { run: (argv: readonly string[]) => Promise<unknown> } }
export type Os = 'mac' | 'windows' | 'linux' | 'unknown'

export const text = (r: unknown) => (typeof r === 'string' ? r : String((r as { stdout?: unknown })?.stdout ?? ''))

/** The promise's value, or `otherwise` when it takes longer than `ms` or fails. */
export function within<T>(p: Promise<T>, ms: number, otherwise: T): Promise<T> {
  return new Promise<T>(res => {
    const t = setTimeout(() => res(otherwise), ms)
    p.then(
      v => (clearTimeout(t), res(v)),
      () => (clearTimeout(t), res(otherwise)),
    )
  })
}

// ---------- encoding (no Buffer, no btoa: only what every JavaScript engine has) ----------
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
export function base64(bytes: readonly number[]): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]
    const b = bytes[i + 1]
    const c = bytes[i + 2]
    out += B64[a >> 2] + B64[((a & 3) << 4) | ((b ?? 0) >> 4)]
    out += b === undefined ? '=' : B64[((b & 15) << 2) | ((c ?? 0) >> 6)]
    out += c === undefined ? '=' : B64[c & 63]
  }
  return out
}
export const utf16le = (s: string): number[] => {
  const b: number[] = []
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    b.push(c & 255, c >> 8)
  }
  return b
}
export const utf8 = (s: string): number[] => Array.from(new TextEncoder().encode(s))

/** The argv that runs a PowerShell script on Windows, whatever characters the script holds. */
export const powershell = (script: string): string[] => [
  'powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand',
  base64(utf16le(`$ProgressPreference='SilentlyContinue'; [Console]::OutputEncoding=[Text.Encoding]::UTF8; ${script}`)),
]

// ---------- which computer ----------
/** Mac, Windows or Linux: from the engine when it says, otherwise by asking the computer once. */
export async function detect($: Run, hint: unknown = (globalThis as { process?: { platform?: unknown } }).process?.platform): Promise<Os> {
  if (hint === 'darwin') return 'mac'
  if (hint === 'win32') return 'windows'
  if (hint === 'linux') return 'linux'
  const u = await within($.process.run(['/bin/sh', '-c', 'uname -s']).then(text), 3000, '')
  if (/darwin/i.test(u)) return 'mac'
  if (/linux/i.test(u)) return 'linux'
  if (/mingw|msys|cygwin/i.test(u)) return 'windows'
  const w = await within($.process.run(powershell("Write-Output 'machau-mod-win'")).then(text), 10_000, '')
  return w.includes('machau-mod-win') ? 'windows' : 'unknown'
}

// ---------- small files under the home folder ----------
// `rel` is always one of the mod's own fixed paths, with forward slashes (for example .local/state/machau-mod/events.jsonl).
const safeRel = (rel: string) => /^[A-Za-z0-9._/-]+$/.test(rel) && !rel.includes('..')
const winPath = (rel: string) => `(Join-Path $env:USERPROFILE '${rel.replace(/\//g, '\\')}')`

/** The file's text, or '' when it is missing or cannot be read. */
export function readHome($: Run, os: Os, rel: string, ms = 10_000): Promise<string> {
  if (!safeRel(rel) || os === 'unknown') return Promise.resolve('')
  const argv =
    os === 'windows'
      ? powershell(`$p = ${winPath(rel)}; if (Test-Path -LiteralPath $p) { [Console]::Out.Write([IO.File]::ReadAllText($p)) }`)
      : ['/bin/sh', '-c', 'cat "$HOME/$1" 2>/dev/null || true', 'machau-mod', rel]
  return within($.process.run(argv).then(text), ms, '')
}

/** Adds one line to the file, making its folder first. Never throws. */
export function appendHome($: Run, os: Os, rel: string, line: string, ms = 10_000): Promise<void> {
  if (!safeRel(rel) || os === 'unknown') return Promise.resolve()
  const argv =
    os === 'windows'
      ? powershell(
          `$p = ${winPath(rel)}; New-Item -ItemType Directory -Force -Path (Split-Path -Parent $p) | Out-Null; ` +
            `$d = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${base64(utf8(line))}')); ` +
            '[IO.File]::AppendAllText($p, $d + "`n")',
        )
      : ['/bin/sh', '-c', 'mkdir -p "$(dirname "$HOME/$1")" && printf "%s\\n" "$2" >> "$HOME/$1"', 'machau-mod', rel, line]
  return within($.process.run(argv).then(() => undefined), ms, undefined)
}

// ---------- one reading of memory and load ----------
const MAC_READ =
  'echo "ram $(sysctl -n hw.memsize)"; echo "cores $(sysctl -n hw.ncpu)"; ' +
  'echo "free $(memory_pressure 2>/dev/null | grep -i "free percentage")"; ' +
  'echo "swap $(sysctl -n vm.swapusage)"; echo "level $(sysctl -n kern.memorystatus_vm_pressure_level 2>/dev/null)"; ' +
  'echo "load $(sysctl -n vm.loadavg)"; echo "@@ps"; ps -Ao command='
const WIN_READ =
  '$o = Get-CimInstance Win32_OperatingSystem; $c = Get-CimInstance Win32_ComputerSystem; ' +
  'Write-Output ("ram_kb " + $o.TotalVisibleMemorySize); Write-Output ("free_kb " + $o.FreePhysicalMemory); ' +
  'Write-Output ("cores " + $c.NumberOfLogicalProcessors)'

/** The raw reading for lib.ts to parse (parseMacReading, parseWindowsReading), or '' when there is none in time. */
export function readMachine($: Run, os: Os, ms: number): Promise<string> {
  if (os === 'mac') return within($.process.run(['/bin/sh', '-c', MAC_READ]).then(text), ms, '')
  if (os === 'windows') return within($.process.run(powershell(WIN_READ)).then(text), ms, '')
  return Promise.resolve('')
}
