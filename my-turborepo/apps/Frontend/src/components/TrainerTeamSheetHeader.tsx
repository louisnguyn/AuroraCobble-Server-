import type { ReactNode } from 'react'
import { getPvpTierFromElo, normalizePvpTierSlugForAssets, PvPTierBadge } from './PvPTierBadge.tsx'
import { TeamSheetPanel } from './TournamentMonCard.tsx'

export type TournamentParticipantHeader = {
  displayName: string
  seedRank: number
  pvpRank?: number | null
  pvpElo?: number | null
  pvpFormat?: string | null
}

function formatPvpFormatLabel(raw: string | null | undefined): string {
  const k = (raw ?? '').trim().toLowerCase()
  if (k === 'singles') return 'Singles'
  if (k === 'doubles') return 'Doubles'
  if (!k) return 'Ladder'
  return k.charAt(0).toUpperCase() + k.slice(1)
}

function pvpRankPillClass(rank: number): string {
  if (rank === 1) return 'team-sheet-rank-pill team-sheet-rank-pill--gold'
  if (rank === 2) return 'team-sheet-rank-pill team-sheet-rank-pill--silver'
  if (rank === 3) return 'team-sheet-rank-pill team-sheet-rank-pill--bronze'
  return 'team-sheet-rank-pill team-sheet-rank-pill--muted'
}

function TrainerLadderStats({ participant }: { participant: TournamentParticipantHeader }) {
  if (participant.pvpRank == null || !Number.isFinite(participant.pvpRank)) return null

  const elo =
    participant.pvpElo != null && Number.isFinite(participant.pvpElo)
      ? Math.round(participant.pvpElo)
      : null
  const tier = elo != null ? getPvpTierFromElo(elo) : null

  return (
    <div className="team-sheet-trainer-stats" aria-label="Leaderboard stats">
      <div className="team-sheet-trainer-stat">
        <span className="team-sheet-trainer-stat-label">Rank</span>
        <span className={pvpRankPillClass(participant.pvpRank)}>#{participant.pvpRank}</span>
      </div>
      {elo != null ? (
        <div className="team-sheet-trainer-stat">
          <span className="team-sheet-trainer-stat-label">ELO</span>
          <span className="team-sheet-trainer-elo">{elo}</span>
        </div>
      ) : null}
      {tier ? (
        <div className="team-sheet-trainer-stat team-sheet-trainer-stat--tier">
          <span className="team-sheet-trainer-stat-label">Tier</span>
          <PvPTierBadge
            slug={normalizePvpTierSlugForAssets(tier.slug)}
            displayName={tier.displayName}
            imgHeightClass="h-8"
            className="team-sheet-trainer-tier-badge"
          />
        </div>
      ) : null}
      <span className="team-sheet-trainer-format">{formatPvpFormatLabel(participant.pvpFormat)}</span>
    </div>
  )
}

export function TrainerTeamSheetPanel({
  participant,
  accent = 'violet',
  children,
}: {
  participant: TournamentParticipantHeader
  accent?: 'violet' | 'cyan'
  children: ReactNode
}) {
  const hasLadder = participant.pvpRank != null && Number.isFinite(participant.pvpRank)

  return (
    <TeamSheetPanel
      accent={accent}
      title={
        <>
          <span className="team-sheet-trainer-label">Trainer:</span> {participant.displayName}
        </>
      }
      subtitle={hasLadder ? <TrainerLadderStats participant={participant} /> : undefined}
    >
      {children}
    </TeamSheetPanel>
  )
}
