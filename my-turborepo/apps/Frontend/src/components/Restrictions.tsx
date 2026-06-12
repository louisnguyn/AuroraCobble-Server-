import { useEffect, useState, type ReactNode } from 'react'
import { fetchBattleRestrictions, type BattleRestrictionsDocument } from '../authApi'
import { fetchPokemonInfo, fetchItemImage, fetchMoveType } from '../pokemonApi'
import { PageEmptyState, PageHeader, PageShell } from './PageLayout.tsx'

const TYPE_COLORS: Record<string, string> = {
  normal: 'bg-[#a8a878]',
  fire: 'bg-[#f08030]',
  water: 'bg-[#6890f0]',
  electric: 'bg-[#f8d030]',
  grass: 'bg-[#78c850]',
  ice: 'bg-[#98d8d8]',
  fighting: 'bg-[#c03028]',
  poison: 'bg-[#a040a0]',
  ground: 'bg-[#e0c068]',
  flying: 'bg-[#a890f0]',
  psychic: 'bg-[#f85888]',
  bug: 'bg-[#a8b820]',
  rock: 'bg-[#b8a038]',
  ghost: 'bg-[#705898]',
  dragon: 'bg-[#7038f8]',
  dark: 'bg-[#705848]',
  steel: 'bg-[#b8b8d0]',
  fairy: 'bg-[#ee99ac]',
}

function formatSlugLabel(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}

function isEmptyHtml(html: string | undefined | null): boolean {
  const t = (html ?? '').replace(/\s/g, '')
  return !t || t === '<p></p>' || t === '<p><br></p>'
}

function PokemonChip({
  slug,
  variant,
}: {
  slug: string
  variant?: 'restricted' | 'blacklist'
}) {
  const [image, setImage] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void fetchPokemonInfo(slug).then((info) => {
      if (!cancelled && info?.image) setImage(info.image)
    })
    return () => {
      cancelled = true
    }
  }, [slug])
  const ring =
    variant === 'blacklist'
      ? 'border-rose-500/45 bg-rose-950/20'
      : 'border-border/50 bg-bg/60'
  return (
    <span className={`inline-flex items-center gap-1.5 py-0.5 px-2 rounded text-sm text-muted border ${ring}`}>
      {image ? (
        <img src={image} alt="" className="w-6 h-6 object-contain flex-shrink-0" />
      ) : (
        <span className="w-6 h-6 flex-shrink-0 rounded bg-surface-hover" aria-hidden />
      )}
      <span>{formatSlugLabel(slug)}</span>
    </span>
  )
}

function ItemChip({ slug }: { slug: string }) {
  const [image, setImage] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void fetchItemImage(slug).then((url) => {
      if (!cancelled && url) setImage(url)
    })
    return () => {
      cancelled = true
    }
  }, [slug])
  return (
    <span className="inline-flex items-center gap-1.5 py-0.5 px-2 rounded text-sm bg-bg/60 text-muted border border-border/50">
      {image ? (
        <img src={image} alt="" className="w-6 h-6 object-contain flex-shrink-0" />
      ) : (
        <span className="w-6 h-6 flex-shrink-0 rounded bg-surface-hover" aria-hidden />
      )}
      <span>{formatSlugLabel(slug)}</span>
    </span>
  )
}

function MoveChip({ slug }: { slug: string }) {
  const [type, setType] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void fetchMoveType(slug).then((t) => {
      if (!cancelled) setType(t ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [slug])
  const bgClass = type ? (TYPE_COLORS[type] ?? 'bg-bg/60') : 'bg-bg/60'
  return (
    <span
      className={`inline-flex items-center py-0.5 px-2 rounded text-sm font-medium text-white ${bgClass} border border-border/50`}
    >
      {formatSlugLabel(slug)}
    </span>
  )
}

function RichBlock({ html, className }: { html: string; className?: string }) {
  if (isEmptyHtml(html)) return null
  return (
    <div
      className={
        className ??
        [
          'restriction-rich max-w-none space-y-2 text-muted',
          '[&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base [&_strong]:font-semibold [&_strong]:text-[#e2e8f0]',
          '[&_a]:text-accent [&_a:hover]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_p]:my-2',
          '[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_img]:max-w-full [&_img]:rounded-md',
        ].join(' ')
      }
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function SectionCard({
  title,
  chips,
  notesHtml,
  emptyHint,
}: {
  title: string
  chips: ReactNode
  notesHtml: string
  emptyHint?: string
}) {
  const hasNotes = !isEmptyHtml(notesHtml)
  const chipsEmpty = chips == null || (Array.isArray(chips) && chips.length === 0)
  if (chipsEmpty && !hasNotes) {
    if (!emptyHint) return null
    return (
      <section className="pixel-panel p-4 sm:p-5">
        <h3 className="text-base font-semibold m-0 mb-2">{title}</h3>
        <p className="text-base text-muted m-0">{emptyHint}</p>
      </section>
    )
  }
  return (
    <section className="pixel-panel p-4 sm:p-5 space-y-3">
      <h3 className="text-base font-semibold m-0">{title}</h3>
      {!chipsEmpty ? <div className="flex flex-wrap gap-2">{chips}</div> : null}
      {hasNotes ? <RichBlock html={notesHtml} /> : null}
    </section>
  )
}

export function Restrictions() {
  const [data, setData] = useState<BattleRestrictionsDocument | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchBattleRestrictions()
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load restrictions')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const emptyConfigured =
    data &&
    !(data.format_label?.trim()) &&
    isEmptyHtml(data.player_restrictions_html) &&
    (data.pokemon_slugs?.length ?? 0) === 0 &&
    (data.pokemon_blacklist_slugs?.length ?? 0) === 0 &&
    (data.move_slugs?.length ?? 0) === 0 &&
    (data.ability_slugs?.length ?? 0) === 0 &&
    (data.item_slugs?.length ?? 0) === 0 &&
    isEmptyHtml(data.pokemon_notes_html) &&
    isEmptyHtml(data.pokemon_blacklist_notes_html) &&
    isEmptyHtml(data.move_notes_html) &&
    isEmptyHtml(data.ability_notes_html) &&
    isEmptyHtml(data.item_notes_html)

  return (
    <PageShell max="6xl">
      <PageHeader
        accent="rose"
        eyebrow="Competitive rules"
        title="Restrictions"
        description="Battle format limits and player rules for competitive play."
        footer={
          <>
            {data?.format_label?.trim() ? (
              <p className="text-lg font-semibold text-[#f5efe6] m-0">{data.format_label.trim()}</p>
            ) : null}
            {data?.updated_at ? (
              <p className="text-xs text-muted/80 m-0 mt-2">
                Last updated{' '}
                {new Date(data.updated_at).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </p>
            ) : null}
          </>
        }
      />

      {loading ? <p className="text-muted">Loading…</p> : null}
      {error ? (
        <div className="pixel-panel p-6 text-rose-400 text-base">
          {error}
          <p className="text-muted text-sm m-0 mt-2">
            Restrictions could not be loaded. Please try again later.
          </p>
        </div>
      ) : null}

      {!loading && !error && emptyConfigured ? (
        <PageEmptyState>Competitive restrictions have not been published yet.</PageEmptyState>
      ) : null}

      {!loading && !error && data && !emptyConfigured ? (
        <div className="space-y-6">
          {data.format_label?.trim() && isEmptyHtml(data.player_restrictions_html) ? (
            <p className="text-sm text-muted m-0 mb-2">
              Below: species / move / ability / item lists and notes for this format.
            </p>
          ) : null}
          {!isEmptyHtml(data.player_restrictions_html) ? (
            <section className="pixel-panel p-4 sm:p-5">
              <h2 className="text-lg font-semibold m-0 mb-3">Player restrictions</h2>
              <RichBlock html={data.player_restrictions_html} />
            </section>
          ) : null}

          <SectionCard
            title="Pokémon — restricted"
            chips={(data.pokemon_slugs ?? []).map((s) => (
              <PokemonChip key={s} slug={s} variant="restricted" />
            ))}
            notesHtml={data.pokemon_notes_html}
          />

          <SectionCard
            title="Pokémon — blacklisted"
            chips={(data.pokemon_blacklist_slugs ?? []).map((s) => (
              <PokemonChip key={`bl-${s}`} slug={s} variant="blacklist" />
            ))}
            notesHtml={data.pokemon_blacklist_notes_html}
          />

          <SectionCard
            title="Move restrictions"
            chips={(data.move_slugs ?? []).map((s) => (
              <MoveChip key={s} slug={s} />
            ))}
            notesHtml={data.move_notes_html}
          />

          <SectionCard
            title="Ability restrictions"
            chips={(data.ability_slugs ?? []).map((s) => (
              <span
                key={s}
                className="inline-block py-0.5 px-2 rounded-sm text-base bg-bg/60 text-muted border border-border/50"
              >
                {formatSlugLabel(s)}
              </span>
            ))}
            notesHtml={data.ability_notes_html}
          />

          <SectionCard
            title="Item restrictions"
            chips={(data.item_slugs ?? []).map((s) => (
              <ItemChip key={s} slug={s} />
            ))}
            notesHtml={data.item_notes_html}
          />
        </div>
      ) : null}
    </PageShell>
  )
}
