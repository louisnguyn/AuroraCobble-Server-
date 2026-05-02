import { useCallback, useEffect, useState } from 'react'
import { fetchUserRankedHistory } from '../authApi'
import type { BattleReplayPayload, MatchResultPayload } from '../types'
import { BattleReplayCard, MatchResultCard, RankedFeedSubTab } from './RankedFeedCards.tsx'

type HistoryTab = 'matches' | 'replays'

export function AccountRankHistory({ viewerIgn }: { viewerIgn: string }) {
  const [tab, setTab] = useState<HistoryTab>('matches')
  const [matches, setMatches] = useState<MatchResultPayload[]>([])
  const [replays, setReplays] = useState<BattleReplayPayload[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    return fetchUserRankedHistory({ limit: 80 })
      .then((data) => {
        setMatches(Array.isArray(data.matchResults) ? data.matchResults : [])
        setReplays(Array.isArray(data.battleReplays) ? data.battleReplays : [])
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const panelClass = 'p-6 text-center rounded-lg border border-border/60 bg-surface/30 text-sm'

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted m-0">
        Matches and replays where your account name{' '}
        <span className="font-mono text-[#e2e8f0]/90">{viewerIgn}</span> appears as a player (same spelling as your
        in-game name).
      </p>

      <div className="flex flex-wrap gap-2 items-center justify-between gap-y-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Your rank history">
          <RankedFeedSubTab active={tab === 'matches'} onClick={() => setTab('matches')}>
            Match results
          </RankedFeedSubTab>
          <RankedFeedSubTab active={tab === 'replays'} onClick={() => setTab('replays')}>
            Battle replays
          </RankedFeedSubTab>
        </div>
        <button type="button" onClick={() => void load()} className="pixel-btn py-2 px-4 text-base">
          Refresh
        </button>
      </div>

      {loading ? (
        <div className={panelClass}>Loading your rank history…</div>
      ) : error ? (
        <div className={`${panelClass} text-error`}>{error}</div>
      ) : tab === 'matches' ? (
        matches.length === 0 ? (
          <div className={`${panelClass} text-muted`}>No ranked match results logged for you yet.</div>
        ) : (
          <div className="space-y-3">
            {matches.map((m, i) => (
              <MatchResultCard
                key={`${m.matchId ?? 'm'}-${m.timestamp ?? i}-${i}`}
                m={m}
                viewerIgn={viewerIgn}
                showPokemonTeams
              />
            ))}
          </div>
        )
      ) : replays.length === 0 ? (
        <div className={`${panelClass} text-muted`}>No battle replays logged for you yet.</div>
      ) : (
        <div className="space-y-3">
          {replays.map((r, i) => (
            <BattleReplayCard key={`${r.matchId ?? 'r'}-${r.timestamp ?? i}-${i}`} r={r} viewerIgn={viewerIgn} />
          ))}
        </div>
      )}
    </div>
  )
}
