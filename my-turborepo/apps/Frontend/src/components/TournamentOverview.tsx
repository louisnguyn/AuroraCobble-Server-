import type { TournamentBracketSummary } from '../tournamentBracketSummary'

export function TournamentOverview({ summary }: { summary: TournamentBracketSummary }) {
  return (
    <div className="tournament-overview" role="status">
      <p className="tournament-overview-lead m-0">{summary.statusLine}</p>

      <ul className="tournament-overview-stats">
        <li className="tournament-overview-stat">
          <span className="tournament-overview-stat-label">Format</span>
          <span className="tournament-overview-stat-value">{summary.formatLabel}</span>
        </li>
        <li className="tournament-overview-stat">
          <span className="tournament-overview-stat-label">Players</span>
          <span className="tournament-overview-stat-value">{summary.playerCount}</span>
        </li>
        <li className="tournament-overview-stat">
          <span className="tournament-overview-stat-label">Results</span>
          <span className="tournament-overview-stat-value">
            {summary.matchesDecided}/{summary.matchesPlayable} matches
          </span>
        </li>
        <li className="tournament-overview-stat tournament-overview-stat--progress">
          <span className="tournament-overview-stat-label">Progress</span>
          <span className="tournament-overview-stat-value">{summary.progressPct}%</span>
          <span className="tournament-overview-progress" aria-hidden>
            <span
              className="tournament-overview-progress-fill"
              style={{ width: `${summary.progressPct}%` }}
            />
          </span>
        </li>
      </ul>

      <p className="tournament-overview-hint m-0">
        Tap a player for their team sheet. When both names are set in a match, use{' '}
        <span className="text-[#f5efe6]/90">Compare both teams</span>.
      </p>
    </div>
  )
}
