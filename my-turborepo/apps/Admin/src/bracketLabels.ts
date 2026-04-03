/** Viewer-facing label for internal bracket keys (qual-0, qf-1, …). */
export function formatBracketMatchKeyLabel(matchKey: string): string {
  const q = /^qual-(\d+)$/.exec(matchKey)
  if (q) return `Qualifier ${parseInt(q[1], 10) + 1}`
  const f = /^qf-(\d+)$/.exec(matchKey)
  if (f) return `Quarter-final ${parseInt(f[1], 10) + 1}`
  const s = /^sf-(\d+)$/.exec(matchKey)
  if (s) return `Semi-final ${parseInt(s[1], 10) + 1}`
  if (matchKey === 'final') return 'Final'
  if (matchKey === 'third') return '3rd place'
  return matchKey
}
