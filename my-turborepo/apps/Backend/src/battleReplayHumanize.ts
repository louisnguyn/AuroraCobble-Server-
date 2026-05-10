/** Same logic as Frontend `battleReplayHumanize` — kept here for replay AI prompts. */

export type BattleReplayPlayerRef = {
  uuid?: string
  playerName?: string
  team?: string[]
  isWinner?: boolean
}

/** CobbleRanked may send one string per line or one blob with `\n`-separated protocol lines. */
export function flattenBattleLogLines(raw: unknown): string[] {
  if (raw == null) return []
  const arr = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : []
  const out: string[] = []
  for (const item of arr) {
    if (typeof item !== 'string') continue
    for (const part of item.split(/\r?\n/)) {
      const t = part.trim()
      if (t) out.push(t)
    }
  }
  return out
}

function slotSideLabel(slot: string): string {
  const s = slot.trim().toLowerCase()
  if (s.startsWith('p2')) return 'Player 2'
  if (s.startsWith('p1')) return 'Player 1'
  return slot.length > 24 ? `${slot.slice(0, 21)}…` : slot
}

/** Map CobbleRanked / Showdown log lines to short English lines for casual readers. */
export function humanizeBattleLogLines(
  rawLines: unknown,
  players: Pick<BattleReplayPlayerRef, 'playerName' | 'uuid'>[]
): string[] {
  const lines = flattenBattleLogLines(rawLines)

  const idToName = new Map<string, string>()
  for (const p of players) {
    const name = (p.playerName ?? '').trim()
    const u = (p.uuid ?? '').trim()
    if (u && name) {
      idToName.set(u, name)
      idToName.set(u.toLowerCase(), name)
    }
  }

  const resolveWinId = (raw: string): string => {
    const s = raw.trim()
    const n = idToName.get(s) ?? idToName.get(s.toLowerCase())
    return n ?? (s.length > 20 ? `${s.slice(0, 18)}…` : s)
  }

  const out: string[] = []
  let skipAfterSplit = 0

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    if (rawLine === undefined) continue
    const line = rawLine.trim()
    if (!line) continue

    const lower = line.toLowerCase()
    if (
      lower === 'update' ||
      lower === 'sideupdate' ||
      lower === 'request instruction' ||
      lower === 'error instruction' ||
      /^p[12]$/.test(lower)
    ) {
      continue
    }

    if (line === 'end' && i + 1 < lines.length) {
      const next = lines[i + 1]?.trim() ?? ''
      if (next.startsWith('{')) {
        try {
          const j = JSON.parse(next) as { winner?: string }
          const w = j.winner?.trim()
          if (w) out.push(`Winner: ${resolveWinId(w)}`)
        } catch {
          out.push('Battle ended')
        }
        i++
        continue
      }
    }

    if (!line.startsWith('|')) {
      if (line.startsWith('{')) continue
      if (line.startsWith('>')) continue
      continue
    }

    if (line.includes('|request|')) continue

    const parts = line.split('|').filter((p) => p.length > 0)
    const cmd = parts[0] ?? ''

    if (cmd === 'split') {
      skipAfterSplit = 1
      continue
    }
    if (skipAfterSplit > 0) {
      skipAfterSplit -= 1
      continue
    }

    if (cmd === 't') continue
    if (cmd === 'pp_update') continue
    if (cmd === 'upkeep') continue
    if (cmd === 'player') continue
    if (cmd === 'teamsize' || cmd === 'gen' || cmd === 'tier') continue
    if (cmd === '-damage') continue

    if (cmd === 'gametype') {
      const g = parts[1]?.trim()
      if (g) out.push(`Format: ${g}`)
      continue
    }
    if (cmd === 'start') {
      out.push('Battle begins')
      continue
    }
    if (cmd === 'turn') {
      const t = parts[1]?.trim()
      if (t) out.push(`Turn ${t}`)
      continue
    }
    if (cmd === 'move' && parts.length >= 3) {
      const fromSlot = parts[1]?.trim() ?? ''
      const move = parts[2]?.trim() ?? 'Move'
      const toSlot = parts[3]?.trim()
      const from = slotSideLabel(fromSlot)
      if (toSlot) {
        out.push(`${from}: ${move} → ${slotSideLabel(toSlot)}`)
      } else {
        out.push(`${from}: ${move}`)
      }
      continue
    }
    if (cmd === 'switch' && parts.length >= 3) {
      const slot = parts[1]?.trim() ?? ''
      const detail = parts[2]?.trim() ?? ''
      const species = detail.split(',')[0]?.trim() || detail
      out.push(`${slotSideLabel(slot)} sends out ${species}`)
      continue
    }
    if (cmd === 'faint' && parts.length >= 2) {
      const who = parts[1]?.trim() ?? ''
      out.push(`Fainted: ${slotSideLabel(who)}`)
      continue
    }
    if (cmd === '-fieldstart' || cmd === '-fieldend') {
      const detail = parts.slice(1).join(' · ').replace(/\|/g, ' ').trim()
      if (detail.length > 0 && detail.length < 140) {
        out.push(cmd === '-fieldstart' ? `Field: ${detail}` : `Field ends: ${detail}`)
      }
      continue
    }
    if (
      cmd === '-ability' ||
      cmd === '-enditem' ||
      cmd === '-boost' ||
      cmd === '-singleturn' ||
      cmd === '-crit' ||
      cmd === '-supereffective' ||
      cmd === '-resisted' ||
      cmd === '-immune' ||
      cmd === '-heal' ||
      cmd === '-weather' ||
      cmd === '-sidestart' ||
      cmd === '-sideend' ||
      cmd === '-activate'
    ) {
      const detail = parts.slice(1).join(' · ').trim()
      if (detail.length > 0 && detail.length < 100) out.push(detail)
      continue
    }
    if (cmd === 'win' && parts.length >= 2) {
      out.push(`Winner: ${resolveWinId(parts[1] ?? '')}`)
      continue
    }
    if (cmd === 'tie') {
      out.push('Tie game')
      continue
    }
    if (cmd === '-message' && parts[1]) {
      const m = parts.slice(1).join(' ').trim()
      if (m.length < 120) out.push(m)
      continue
    }
    if (cmd === 'error' && parts[1]) {
      const msg = parts[1].replace(/^\[|\]$/g, '')
      if (msg && msg.length < 120) out.push(`Note: ${msg}`)
      continue
    }
  }

  const deduped: string[] = []
  for (const s of out) {
    const prev = deduped[deduped.length - 1]
    if (prev === s) continue
    if (s.startsWith('Winner:') && prev?.startsWith('Winner:')) {
      deduped[deduped.length - 1] = s
      continue
    }
    deduped.push(s)
  }
  return deduped
}
