import { useEffect, useState } from 'react'
import { fetchTournamentParticipantTeam } from '../authApi'
import { type ParsedMon, TournamentMonCard } from './TournamentMonCard.tsx'

export function TournamentTeamDetail({
  slug,
  participantId,
  onBack,
  onCompareWithOther,
}: {
  slug: string
  participantId: number
  onBack: () => void
  /** Return to bracket to pick a second team for side-by-side compare. */
  onCompareWithOther?: () => void
}) {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchTournamentParticipantTeam>> | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    fetchTournamentParticipantTeam(slug, participantId)
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : 'Failed'))
  }, [slug, participantId])

  const team = (data?.participant.team as ParsedMon[]) ?? []

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6 pb-12 px-2 sm:px-4">
      <div className="flex flex-wrap items-center justify-start gap-3">
        <button type="button" onClick={onBack} className="text-sm px-3 py-1.5 pixel-btn">
          ← Back to bracket
        </button>
        {onCompareWithOther ? (
          <button
            type="button"
            onClick={onCompareWithOther}
            className="text-sm px-3 py-1.5 pixel-btn-primary"
          >
            Compare with another team
          </button>
        ) : null}
      </div>
      {err ? <p className="text-error">{err}</p> : null}
      {data ? (
        <>
          <header className="text-center max-w-lg mx-auto">
            <h1 className="text-2xl font-semibold text-[#f5efe6] m-0">{data.participant.displayName}</h1>
            <p className="text-sm text-muted m-0 mt-1">Seed #{data.participant.seedRank}</p>
          </header>
          <div className="space-y-3 max-w-lg mx-auto w-full">
            {team.map((mon, i) => (
              <TournamentMonCard key={i} mon={mon} />
            ))}
          </div>
        </>
      ) : !err ? (
        <p className="text-muted">Loading…</p>
      ) : null}
    </div>
  )
}
