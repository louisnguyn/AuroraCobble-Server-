import { useCallback, useEffect, useState } from 'react'
import { fetchMatchResults } from '../api'
import { MatchResultCard } from './RankedFeedCards.tsx'
import type { MatchResultPayload } from '../types'

export function RankedApiFeed() {
  const [matches, setMatches] = useState<MatchResultPayload[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    return fetchMatchResults({ limit: 50 })
      .then((m) => {
        setMatches(Array.isArray(m.items) ? m.items : [])
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const panelClass = 'p-8 text-center pixel-panel'

  if (loading) return <div className={panelClass}>Loading ranked match results…</div>
  if (error) return <div className={`${panelClass} text-error`}>Error: {error}</div>

  return (
    <section className="space-y-5" aria-labelledby="ranked-feed-heading">
      <h2 id="ranked-feed-heading" className="sr-only">
        Ranked match results
      </h2>
      <p className="text-xs text-muted m-0 max-w-2xl leading-relaxed">
        Public summary only (opponent teams hidden). Signed-in players see full teams and battle replays under Account →
        Rank history.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[#e2e8f0] m-0">Recent match results</h3>
        <button type="button" onClick={() => void load()} className="pixel-btn py-2 px-4 text-base shrink-0">
          Refresh
        </button>
      </div>

      {matches.length === 0 ? (
        <div className={`${panelClass} text-muted text-sm`}>No match results yet.</div>
      ) : (
        <div className="space-y-3 max-w-4xl">
          {matches.map((m, i) => (
            <MatchResultCard key={`${m.matchId ?? 'm'}-${m.timestamp ?? i}-${i}`} m={m} showPokemonTeams={false} />
          ))}
        </div>
      )}
    </section>
  )
}
