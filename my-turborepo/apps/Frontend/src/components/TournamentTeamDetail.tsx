import { useEffect, useState } from 'react'
import { fetchTournamentParticipantTeam } from '../authApi'
import { TrainerTeamSheetPanel } from './TrainerTeamSheetHeader.tsx'
import { type ParsedMon, TeamSheetGrid, TournamentMonCard } from './TournamentMonCard.tsx'

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
    <div className="w-full max-w-5xl mx-auto space-y-6 pb-12 px-2 sm:px-4">
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
        <TrainerTeamSheetPanel participant={data.participant}>
          <TeamSheetGrid>
            {team.map((mon, i) => (
              <TournamentMonCard key={i} mon={mon} slot={i + 1} />
            ))}
          </TeamSheetGrid>
        </TrainerTeamSheetPanel>
      ) : !err ? (
        <p className="text-muted">Loading…</p>
      ) : null}
    </div>
  )
}
