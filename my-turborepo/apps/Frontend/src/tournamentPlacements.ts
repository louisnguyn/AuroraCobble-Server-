import type { TournamentBracketMatch, TournamentBracketSlot } from './authApi'

export type PlacementPlace = 1 | 2 | 3

export type TournamentPlacement = {
  place: PlacementPlace
  label: string
  name: string
  participantId: number
}

const PLACE_LABELS: Record<PlacementPlace, string> = {
  1: 'Champion',
  2: 'Runner-up',
  3: '3rd place',
}

function slotAsParticipant(slot: TournamentBracketSlot): { id: number; name: string } | null {
  if (slot.kind !== 'participant' || slot.id == null) return null
  const name = (slot.name ?? '').trim()
  return { id: slot.id, name: name || 'Player' }
}

function matchSide(
  m: TournamentBracketMatch,
  role: 'winner' | 'loser'
): { id: number; name: string } | null {
  const w = m.winnerParticipantId
  if (w == null) return null
  const left = slotAsParticipant(m.left)
  const right = slotAsParticipant(m.right)
  if (!left || !right) return null
  if (role === 'winner') {
    return left.id === w ? left : right.id === w ? right : null
  }
  return left.id === w ? right : right.id === w ? left : null
}

function findMatch(bracket: TournamentBracketMatch[], round: TournamentBracketMatch['round'], key: string) {
  return bracket.find((m) => m.key === key) ?? bracket.find((m) => m.round === round)
}

/** Top three from final + bronze match when winners are recorded. */
export function computeTournamentPlacements(bracket: TournamentBracketMatch[]): TournamentPlacement[] {
  const out: TournamentPlacement[] = []
  const final = findMatch(bracket, 'final', 'final')
  const third = findMatch(bracket, 'third', 'third')

  const push = (place: PlacementPlace, m: TournamentBracketMatch, role: 'winner' | 'loser') => {
    const p = matchSide(m, role)
    if (!p) return
    out.push({ place, label: PLACE_LABELS[place], name: p.name, participantId: p.id })
  }

  if (final) {
    push(1, final, 'winner')
    push(2, final, 'loser')
  }
  if (third) {
    push(3, third, 'winner')
  }

  return out.sort((a, b) => a.place - b.place)
}
