/** Viewer-facing label for internal bracket keys (qual-0, r16-2, qf-1, …). */
export function formatBracketMatchKeyLabel(matchKey: string): string {
  const n = (idx: string) => parseInt(idx, 10) + 1
  const r16 = /^r16-(\d+)$/.exec(matchKey)
  if (r16) return `Round of 16 ${n(r16[1])}`
  const q = /^qual-(\d+)$/.exec(matchKey)
  if (q) return `Qualifier ${n(q[1])}`
  const f = /^qf-(\d+)$/.exec(matchKey)
  if (f) return `Quarter-final ${n(f[1])}`
  const s = /^sf-(\d+)$/.exec(matchKey)
  if (s) return `Semi-final ${n(s[1])}`
  if (matchKey === 'final') return 'Final'
  if (matchKey === 'third') return '3rd place'
  return matchKey
}
