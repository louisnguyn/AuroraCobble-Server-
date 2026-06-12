import { useMemo } from 'react'
import { parsePokepaste } from '../pokepasteParse'
import { loadTeamPasteView } from '../teamPasteViewStorage'
import { PageEmptyState, PageHeader, PageShell } from './PageLayout.tsx'
import { TeamSheetGrid, TeamSheetPanel, TournamentMonCard } from './TournamentMonCard.tsx'

export function TeamPasteViewPage({ onBack }: { onBack: () => void }) {
  const data = useMemo(() => loadTeamPasteView(), [])
  const team = useMemo(() => (data?.paste ? parsePokepaste(data.paste) : []), [data?.paste])

  if (!data) {
    return (
      <PageShell max="3xl" className="!pb-12">
        <button type="button" onClick={onBack} className="pixel-btn text-sm py-2 px-4">
          ← Back to Team Builder
        </button>
        <PageEmptyState>No team is loaded. Export a team from Team Builder, then open the sprite viewer.</PageEmptyState>
      </PageShell>
    )
  }

  return (
    <PageShell max="5xl" className="!pb-12 px-2 sm:px-0">
      <button type="button" onClick={onBack} className="pixel-btn text-sm py-2 px-4">
        ← Back to Team Builder
      </button>

      <PageHeader
        accent="violet"
        eyebrow="Sprite viewer"
        title={data.title || 'Team'}
        description={
          data.pokepastUrl ? (
            <>
              <span className="text-muted">Showdown import: </span>
              <a
                href={data.pokepastUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline break-all"
              >
                {data.pokepastUrl}
              </a>
            </>
          ) : undefined
        }
      />

      <TeamSheetPanel title={data.title || 'Team'}>
        <TeamSheetGrid>
          {team.map((mon, i) => (
            <TournamentMonCard key={`${mon.speciesSlug}-${i}`} mon={mon} slot={i + 1} />
          ))}
        </TeamSheetGrid>

        {team.length === 0 ? (
          <p className="text-sm text-muted m-0 mt-4 text-center py-6">
            Could not parse any Pokémon from this paste.
          </p>
        ) : null}
      </TeamSheetPanel>

      <details className="rounded-xl border border-border/60 bg-[#0f0a1a]/50 group">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-[#f5efe6] hover:bg-surface-hover/20 rounded-xl transition-colors [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <span className="text-muted group-open:rotate-90 transition-transform inline-block">▸</span>
            Showdown paste text
          </span>
        </summary>
        <pre className="px-4 pb-4 text-xs text-[#e2e8f0]/90 whitespace-pre-wrap font-mono m-0 overflow-x-auto border-t border-border/40 pt-3">
          {data.paste}
        </pre>
      </details>
    </PageShell>
  )
}
