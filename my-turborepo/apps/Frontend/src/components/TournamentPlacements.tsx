import type { TournamentBracketMatch } from '../authApi'
import { computeTournamentPlacements, type PlacementPlace } from '../tournamentPlacements'
import { navigateToPublicProfile } from './Profile.tsx'

const PLACE_ICONS: Record<PlacementPlace, string> = {
  1: '🏆',
  2: '🥈',
  3: '🥉',
}

const PLACE_CARD_CLASS: Record<PlacementPlace, string> = {
  1: 'tournament-placement-card--gold',
  2: 'tournament-placement-card--silver',
  3: 'tournament-placement-card--bronze',
}

export function TournamentPlacementsBanner({
  bracket,
  onOpenPlayer,
}: {
  bracket: TournamentBracketMatch[]
  onOpenPlayer?: (participantId: number) => void
}) {
  const placements = computeTournamentPlacements(bracket)
  if (placements.length === 0) return null

  return (
    <section className="tournament-placements" aria-label="Tournament results">
      <h3 className="tournament-placements-heading">Results</h3>
      <ul className="tournament-placements-grid">
        {placements.map((p) => (
          <li key={p.place} className={`tournament-placement-card ${PLACE_CARD_CLASS[p.place]}`}>
            <span className="tournament-placement-icon" aria-hidden>
              {PLACE_ICONS[p.place]}
            </span>
            <div className="tournament-placement-body">
              <span className="tournament-placement-label">{p.label}</span>
              <span className="tournament-placement-name tournament-placement-name--static">{p.name}</span>
            </div>
            <div className="tournament-placement-actions">
              <button
                type="button"
                className="tournament-placement-action"
                onClick={() => navigateToPublicProfile(p.name)}
              >
                Profile
              </button>
              {onOpenPlayer ? (
                <button
                  type="button"
                  className="tournament-placement-action tournament-placement-action--primary"
                  onClick={() => onOpenPlayer(p.participantId)}
                >
                  Team
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
