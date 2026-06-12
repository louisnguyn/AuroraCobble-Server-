import { useEffect, useState } from 'react'
import { fetchTournamentParticipantTeam } from '../authApi'
import { PageHeader, PageShell } from './PageLayout.tsx'
import { TrainerTeamSheetPanel } from './TrainerTeamSheetHeader.tsx'
import { type ParsedMon, TeamSheetGrid, TournamentMonCard } from './TournamentMonCard.tsx'

export function TournamentTeamCompare({
  slug,
  participantIdA,
  participantIdB,
  onBack,
}: {
  slug: string
  participantIdA: number
  participantIdB: number
  onBack: () => void
}) {
  const [a, setA] = useState<Awaited<ReturnType<typeof fetchTournamentParticipantTeam>> | null>(null)
  const [b, setB] = useState<Awaited<ReturnType<typeof fetchTournamentParticipantTeam>> | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    setErr(null)
    setA(null)
    setB(null)
    let cancelled = false
    Promise.all([
      fetchTournamentParticipantTeam(slug, participantIdA),
      fetchTournamentParticipantTeam(slug, participantIdB),
    ])
      .then(([da, db]) => {
        if (!cancelled) {
          setA(da)
          setB(db)
        }
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to load teams')
      })
    return () => {
      cancelled = true
    }
  }, [slug, participantIdA, participantIdB])

  const teamA = (a?.participant.team as ParsedMon[]) ?? []
  const teamB = (b?.participant.team as ParsedMon[]) ?? []

  return (
    <PageShell max="6xl" className="!pb-12 px-1 sm:px-0">
      <button type="button" onClick={onBack} className="pixel-btn text-sm py-2 px-4 shrink-0">
        ← Back to bracket
      </button>

      {a && b ? (
        <PageHeader
          accent="violet"
          eyebrow="Head to head"
          title="Team comparison"
          description={`${a.participant.displayName} vs ${b.participant.displayName} · same tournament`}
        />
      ) : null}

      {err ? <p className="text-error m-0">{err}</p> : null}
      {a && b ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 xl:gap-6">
          <TrainerTeamSheetPanel participant={a.participant} accent="violet">
            <TeamSheetGrid>
              {teamA.map((mon, i) => (
                <TournamentMonCard key={i} mon={mon} slot={i + 1} />
              ))}
            </TeamSheetGrid>
          </TrainerTeamSheetPanel>

          <TrainerTeamSheetPanel participant={b.participant} accent="cyan">
            <TeamSheetGrid>
              {teamB.map((mon, i) => (
                <TournamentMonCard key={i} mon={mon} slot={i + 1} />
              ))}
            </TeamSheetGrid>
          </TrainerTeamSheetPanel>
        </div>
      ) : !err ? (
        <p className="text-muted m-0">Loading both teams…</p>
      ) : null}
    </PageShell>
  )
}
