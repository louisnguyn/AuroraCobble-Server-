import { useMemo } from 'react'
import { parsePokepaste } from '../pokepasteParse'
import { loadTeamPasteView } from '../teamPasteViewStorage'
import { TeamSheetGrid, TeamSheetPanel, TournamentMonCard } from './TournamentMonCard.tsx'

export function TeamPasteViewPage({ onBack }: { onBack: () => void }) {
  const data = useMemo(() => loadTeamPasteView(), [])
  const team = useMemo(() => (data?.paste ? parsePokepaste(data.paste) : []), [data?.paste])

  if (!data) {
    return (
      <div className="w-full max-w-3xl mx-auto space-y-4 pb-12">
        <button type="button" onClick={onBack} className="pixel-btn text-sm py-2 px-4">
          ← Back
        </button>
        <p className="text-sm text-muted m-0">
          No team is loaded. Export a team from Team Builder, then open the sprite viewer.
        </p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 pb-12 px-2 sm:px-4">
      <button type="button" onClick={onBack} className="pixel-btn text-sm py-2 px-4">
        ← Back to Team Builder
      </button>

      <TeamSheetPanel title={data.title || 'Team'}>
        {data.pokepastUrl ? (
          <p className="text-sm m-0 mb-4 pb-3 border-b border-violet-900/35">
            <span className="text-muted">Showdown import: </span>
            <a
              href={data.pokepastUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline break-all"
            >
              {data.pokepastUrl}
            </a>
          </p>
        ) : null}

        <TeamSheetGrid>
          {team.map((mon, i) => (
            <TournamentMonCard key={`${mon.speciesSlug}-${i}`} mon={mon} slot={i + 1} />
          ))}
        </TeamSheetGrid>

        {team.length === 0 ? (
          <p className="text-sm text-muted m-0 mt-4">Could not parse any Pokémon from this paste.</p>
        ) : null}
      </TeamSheetPanel>

      <details className="pixel-panel-soft p-4">
        <summary className="text-sm font-medium text-[#f5efe6] cursor-pointer">Showdown paste text</summary>
        <pre className="mt-3 text-xs text-[#e2e8f0]/90 whitespace-pre-wrap font-mono m-0 overflow-x-auto">
          {data.paste}
        </pre>
      </details>
    </div>
  )
}
