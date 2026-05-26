import { useEffect, useState } from 'react'
import { fetchTournamentParticipantTeam } from '../authApi'
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
    <div className="w-full max-w-6xl mx-auto space-y-6 pb-12 px-1 sm:px-2">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onBack} className="text-sm px-3 py-1.5 pixel-btn shrink-0">
          ← Back to bracket
        </button>
      </div>
      {err ? <p className="text-error">{err}</p> : null}
      {a && b ? (
        <>
          <header>
            <h1 className="text-xl sm:text-2xl font-semibold text-[#f5efe6] m-0">Team comparison</h1>
            <p className="text-sm text-muted mt-1 m-0">Same tournament · both sheets side by side</p>
          </header>

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
        </>
      ) : !err ? (
        <p className="text-muted">Loading both teams…</p>
      ) : null}
    </div>
  )
}
