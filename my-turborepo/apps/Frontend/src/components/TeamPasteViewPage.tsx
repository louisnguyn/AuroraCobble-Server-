import { useMemo } from 'react'
import { parsePokepaste } from '../pokepasteParse'
import { loadTeamPasteView } from '../teamPasteViewStorage'
import { TournamentMonCard } from './TournamentMonCard.tsx'

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
          No team loaded. Create a PokePaste link from Team Builder first, then open &quot;View with
          sprites&quot;.
        </p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6 pb-12">
      <button type="button" onClick={onBack} className="pixel-btn text-sm py-2 px-4">
        ← Back to Team Builder
      </button>
      <header className="text-center max-w-lg mx-auto">
        <h1 className="text-2xl font-semibold text-[#f5efe6] m-0">{data.title || 'Team'}</h1>
      </header>

      {data.pokepastUrl ? (
        <p className="text-sm m-0">
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

      <div className="flex flex-col gap-3 max-w-lg mx-auto w-full">
        {team.map((mon, i) => (
          <TournamentMonCard key={`${mon.speciesSlug}-${i}`} mon={mon} />
        ))}
      </div>

      {team.length === 0 ? (
        <p className="text-sm text-muted m-0">Could not parse any Pokémon from this paste.</p>
      ) : null}

      <details className="pixel-panel-soft p-4">
        <summary className="text-sm font-medium text-[#f5efe6] cursor-pointer">Showdown paste text</summary>
        <pre className="mt-3 text-xs text-[#e2e8f0]/90 whitespace-pre-wrap font-mono m-0 overflow-x-auto">
          {data.paste}
        </pre>
      </details>
    </div>
  )
}
