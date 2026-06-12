import { useEffect, useState } from 'react'
import { fetchTournamentParticipantTeam } from '../authApi'
import { PageHeader, PageShell } from './PageLayout.tsx'
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
    <PageShell max="5xl" className="!pb-12 px-2 sm:px-0">
      <div className="flex flex-wrap items-center justify-start gap-3">
        <button type="button" onClick={onBack} className="pixel-btn text-sm py-2 px-4">
          ← Back to bracket
        </button>
        {onCompareWithOther ? (
          <button type="button" onClick={onCompareWithOther} className="pixel-btn-primary text-sm py-2 px-4">
            Compare with another team
          </button>
        ) : null}
      </div>

      {data ? (
        <PageHeader
          accent="violet"
          eyebrow="Team sheet"
          title={data.participant.displayName}
          description="Submitted team for this tournament bracket."
        />
      ) : null}

      {err ? <p className="text-error m-0">{err}</p> : null}
      {data ? (
        <TrainerTeamSheetPanel participant={data.participant}>
          <TeamSheetGrid>
            {team.map((mon, i) => (
              <TournamentMonCard key={i} mon={mon} slot={i + 1} />
            ))}
          </TeamSheetGrid>
        </TrainerTeamSheetPanel>
      ) : !err ? (
        <p className="text-muted m-0">Loading…</p>
      ) : null}
    </PageShell>
  )
}
