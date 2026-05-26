import type { TournamentBracketMatch } from './authApi'
import { computeTournamentPlacements, type TournamentPlacement } from './tournamentPlacements'

const ROUND_ORDER: TournamentBracketMatch['round'][] = [
  'round_of_16',
  'qualifying',
  'quarter',
  'semi',
  'final',
  'third',
]

const ROUND_LABELS: Record<TournamentBracketMatch['round'], string> = {
  round_of_16: 'Round of 16',
  qualifying: 'Qualifiers',
  quarter: 'Quarter-finals',
  semi: 'Semi-finals',
  final: 'Final',
  third: '3rd place',
}

export type TournamentBracketSummary = {
  playerCount: number
  formatLabel: string
  matchesDecided: number
  matchesPlayable: number
  progressPct: number
  statusLine: string
  placements: TournamentPlacement[]
}

function countParticipants(bracket: TournamentBracketMatch[]): number {
  const ids = new Set<number>()
  for (const m of bracket) {
    if (m.left.kind === 'participant' && m.left.id != null) ids.add(m.left.id)
    if (m.right.kind === 'participant' && m.right.id != null) ids.add(m.right.id)
  }
  return ids.size
}

function isHeadToHeadReady(m: TournamentBracketMatch): boolean {
  return m.left.kind === 'participant' && m.right.kind === 'participant'
}

function formatSizeLabel(bracketSize: 8 | 12 | 16 | undefined, playerCount: number): string {
  if (bracketSize === 8) return '8-player single elimination'
  if (bracketSize === 16) return '16-player single elimination'
  if (bracketSize === 12) return '12-player (qualifiers + top 4)'
  if (playerCount > 0) return `${playerCount}-player bracket`
  return 'Tournament bracket'
}

function buildStatusLine(bracket: TournamentBracketMatch[], placements: TournamentPlacement[]): string {
  if (placements.some((p) => p.place === 1)) {
    const champ = placements.find((p) => p.place === 1)
    const ru = placements.find((p) => p.place === 2)
    if (champ && ru) return `Complete — ${champ.name} won · ${ru.name} runner-up`
    if (champ) return `Complete — champion ${champ.name}`
    return 'Tournament complete'
  }

  for (const round of ROUND_ORDER) {
    const matches = bracket.filter((m) => m.round === round)
    if (!matches.length) continue
    const live = matches.filter((m) => isHeadToHeadReady(m) && m.winnerParticipantId == null)
    if (live.length > 0) {
      return `${ROUND_LABELS[round]} — ${live.length} match${live.length === 1 ? '' : 'es'} to play`
    }
  }

  const decided = bracket.filter((m) => m.winnerParticipantId != null).length
  if (decided === 0) return 'Bracket published — results will appear as matches are played'
  return 'Waiting for next round matchups'
}

export function computeTournamentBracketSummary(
  bracket: TournamentBracketMatch[],
  bracketSize?: 8 | 12 | 16
): TournamentBracketSummary {
  const playerCount = countParticipants(bracket)
  const placements = computeTournamentPlacements(bracket)
  const headToHead = bracket.filter(isHeadToHeadReady)
  const matchesPlayable = headToHead.length
  const matchesDecided = headToHead.filter((m) => m.winnerParticipantId != null).length
  const progressPct =
    matchesPlayable > 0 ? Math.round((matchesDecided / matchesPlayable) * 100) : 0

  return {
    playerCount,
    formatLabel: formatSizeLabel(bracketSize, playerCount),
    matchesDecided,
    matchesPlayable,
    progressPct,
    statusLine: buildStatusLine(bracket, placements),
    placements,
  }
}
