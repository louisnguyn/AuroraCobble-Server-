import type { ReactNode } from 'react'
import { typeAccentColor } from '../pokemonTypeStyles.ts'
import { PokemonMoveList } from './PokemonMoveList.tsx'
import { PokemonTypeBadges } from './PokemonTypeBadges.tsx'
import { PokemonSprite } from './PokemonSprite.tsx'

export type ParsedMon = {
  species?: string
  speciesSlug?: string
  types?: string[]
  item?: string
  ability?: string | null
  teraType?: string | null
  moves?: string[]
}

function cardAccentColor(mon: ParsedMon): string {
  if (mon.teraType?.trim()) return typeAccentColor(mon.teraType)
  const first = mon.types?.[0]
  if (first) return typeAccentColor(first)
  return 'rgba(139, 92, 246, 0.55)'
}

function MetaTag({ label, value, variant = 'default' }: { label: string; value: string; variant?: 'default' | 'item' }) {
  return (
    <div className={`team-mon-meta-tag${variant === 'item' ? ' team-mon-meta-tag--item' : ''}`}>
      <span className="team-mon-meta-label">{label}</span>
      <span className="team-mon-meta-value">{value}</span>
    </div>
  )
}

export function TournamentMonCard({ mon, slot }: { mon: ParsedMon; slot?: number }) {
  const slug = (mon.speciesSlug || mon.species || '').trim()
  const accent = cardAccentColor(mon)
  const moves = mon.moves?.filter((m) => m?.trim()) ?? []

  return (
    <article
      className="team-mon-card"
      style={{ ['--team-mon-tera' as string]: accent }}
    >
      <div className="team-mon-card-accent" aria-hidden />
      <div className="team-mon-card-inner">
        <div className="team-mon-card-head">
          {slot != null ? (
            <span className="team-mon-slot" aria-label={`Slot ${slot}`}>
              {slot}
            </span>
          ) : null}
          <PokemonSprite
            speciesSlug={slug}
            speciesDisplay={mon.species}
            centered={false}
            className="team-mon-sprite"
            emptyClassName="team-mon-sprite team-mon-sprite--empty"
          />
          <div className="team-mon-title-block min-w-0">
            <h3 className="team-mon-name">{mon.species ?? 'Pokémon'}</h3>
          </div>
        </div>

        <PokemonTypeBadges
          speciesSlug={slug}
          speciesDisplay={mon.species}
          teraType={mon.teraType}
          types={mon.types}
        />

        {mon.item || mon.ability ? (
          <div className="team-mon-meta">
            {mon.item ? <MetaTag label="Item" value={mon.item} variant="item" /> : null}
            {mon.ability ? <MetaTag label="Ability" value={mon.ability} /> : null}
          </div>
        ) : null}

        {moves.length > 0 ? <PokemonMoveList moves={moves} /> : null}
      </div>
    </article>
  )
}

export function TeamSheetGrid({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`team-sheet-grid ${className}`.trim()}>{children}</div>
}

export function TeamSheetPanel({
  title,
  subtitle,
  accent = 'violet',
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  accent?: 'violet' | 'cyan'
  children: ReactNode
}) {
  return (
    <section className={`team-sheet-panel team-sheet-panel--${accent}`}>
      <header className="team-sheet-panel-head">
        <h2 className="team-sheet-panel-title">{title}</h2>
        {subtitle != null && subtitle !== '' ? (
          <p className="team-sheet-panel-sub">{subtitle}</p>
        ) : null}
      </header>
      {children}
    </section>
  )
}
