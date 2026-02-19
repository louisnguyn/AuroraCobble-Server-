import { useEffect, useState } from 'react'
import { fetchPokemonInfo, fetchItemImage, fetchMoveType, toPokeApiName } from '../pokemonApi'

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

/** PokéAPI uses form-specific slugs; map rule display names to the exact API slug when they differ. */
const POKEMON_SLUG_OVERRIDES: Record<string, string> = {
  'Deoxys': 'deoxys-normal',
  'Giratina': 'giratina-altered',
  'Landorus': 'landorus-incarnate',
  'Zygarde': 'zygarde-50',
  'Darmanitan-Galar': 'darmanitan-galar-standard',
  'Necrozma-Dawn Wings': 'necrozma-dawn',
  'Necrozma-Dusk Mane': 'necrozma-dusk',
  'Ogerpon-Hearthflame': 'ogerpon',
  'Palafin': 'palafin-zero',
  'Urshifu (Single Strike forme)': 'urshifu-single-strike',
}

function slugForRuleName(name: string): string {
  if (POKEMON_SLUG_OVERRIDES[name]) return POKEMON_SLUG_OVERRIDES[name]
  const withoutParen = name.replace(/\s*\([^)]*\)\s*$/g, '').trim()
  return toPokeApiName(withoutParen)
}

function BannedPokemonTag({ name }: { name: string }) {
  const [image, setImage] = useState<string | null>(null)
  const slug = slugForRuleName(name)
  useEffect(() => {
    let cancelled = false
    const slugsToTry = [slug]
    if (slug === 'deoxys') slugsToTry.push('deoxys-normal')
    if (slug === 'giratina') slugsToTry.push('giratina-altered')
    if (slug === 'landorus') slugsToTry.push('landorus-incarnate')
    if (slug === 'zygarde') slugsToTry.push('zygarde-50')
    ;(async () => {
      for (const s of slugsToTry) {
        const info = await fetchPokemonInfo(s)
        if (cancelled) return
        if (info?.image) {
          setImage(info.image)
          return
        }
      }
    })()
    return () => { cancelled = true }
  }, [slug])
  return (
    <span className="inline-flex items-center gap-1.5 py-0.5 px-2 rounded text-sm bg-bg/60 text-muted border border-border/50">
      {image ? (
        <img src={image} alt="" className="w-6 h-6 object-contain flex-shrink-0" />
      ) : (
        <span className="w-6 h-6 flex-shrink-0 rounded bg-surface-hover" aria-hidden />
      )}
      <span>{name}</span>
    </span>
  )
}

function BannedItemTag({ name }: { name: string }) {
  const [image, setImage] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    fetchItemImage(name).then((url) => {
      if (!cancelled && url) setImage(url)
    })
    return () => { cancelled = true }
  }, [name])
  return (
    <span className="inline-flex items-center gap-1.5 py-0.5 px-2 rounded text-sm bg-bg/60 text-muted border border-border/50">
      {image ? (
        <img src={image} alt="" className="w-6 h-6 object-contain flex-shrink-0" />
      ) : (
        <span className="w-6 h-6 flex-shrink-0 rounded bg-surface-hover" aria-hidden />
      )}
      <span>{name}</span>
    </span>
  )
}

function BannedMoveTag({ name }: { name: string }) {
  const [type, setType] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    fetchMoveType(name).then((t) => {
      if (!cancelled) setType(t ?? null)
    })
    return () => { cancelled = true }
  }, [name])
  const bgClass = type ? (TYPE_COLORS[type] ?? 'bg-bg/60') : 'bg-bg/60'
  return (
    <span className={`inline-flex items-center py-0.5 px-2 rounded text-sm font-medium text-white ${bgClass} border border-border/50`}>
      {name}
    </span>
  )
}

type FormatId = 'national-dex-ou' | 'vgc'
type StyleId = 'singles' | 'doubles' | 'triples'

const FORMATS: { id: FormatId; label: string }[] = [
  { id: 'national-dex-ou', label: 'National Dex OU' },
  { id: 'vgc', label: 'VGC' },
]

const STYLES: { id: StyleId; label: string }[] = [
  { id: 'singles', label: 'Singles' },
  { id: 'doubles', label: 'Doubles' },
  { id: 'triples', label: 'Triples' },
]

const NATIONAL_DEX_OU_SINGLES = {
  source: 'https://www.smogon.com/dex/sv/formats/national-dex/',
  playRestrictions: [
    { name: 'Species Clause', desc: 'Players cannot have more than one Pokémon with any National Pokédex number.' },
    { name: 'Endless Battle Clause', desc: "Players cannot intentionally prevent their opponent's Pokémon from fainting from PP depletion and Struggle recoil." },
    { name: 'Sleep Clause Mod', desc: "Players cannot induce sleep on more than one of the opponent's Pokémon at once." },
    { name: 'Evasion Clause', desc: 'Moves that boost evasion like Minimize are banned.' },
    { name: 'OHKO Clause', desc: 'Moves that OHKO the foe (Fissure, Guillotine, Horn Drill, and Sheer Cold) are banned.' },
    { name: 'Terastal Clause', desc: 'Players may not Terastallize.' },
  ],
  bannedPokemon: [
    'Annihilape', 'Arceus (all formes)', 'Baxcalibur', 'Calyrex-Ice', 'Calyrex-Shadow', 'Chi-Yu', 'Chien-Pao', 'Darkrai', 'Darmanitan-Galar', 'Deoxys', 'Deoxys-Attack', 'Deoxys-Speed', 'Dialga', 'Dialga-Origin', 'Dracovish', 'Dragapult', 'Espathra', 'Eternatus', 'Flutter Mane', 'Genesect', 'Giratina', 'Giratina-Origin', 'Gouging Fire', 'Groudon', 'Ho-Oh', 'Iron Bundle', 'Koraidon', 'Kyogre', 'Kyurem-Black', 'Kyurem-White', 'Landorus', 'Lugia', 'Lunala', 'Magearna', 'Marshadow', 'Mewtwo', 'Miraidon', 'Naganadel', 'Necrozma-Dawn Wings', 'Necrozma-Dusk Mane', 'Ogerpon-Hearthflame', 'Palafin', 'Palkia', 'Palkia-Origin', 'Pheromosa', 'Rayquaza', 'Reshiram', 'Roaring Moon', 'Shaymin-Sky', 'Sneasler', 'Solgaleo', 'Spectrier', 'Ursaluna-Bloodmoon', 'Urshifu (Single Strike forme)', 'Walking Wake', 'Xerneas', 'Yveltal', 'Zacian', 'Zacian-Crowned', 'Zamazenta-Crowned', 'Zekrom', 'Zygarde',
  ],
  bannedAbilities: ['Arena Trap', 'Moody', 'Power Construct', 'Shadow Tag'],
  bannedItems: [
    'Alakazite', 'Blastoisinite', 'Blazikenite', 'Gengarite', 'Kangaskhanite', "King's Rock", 'Lucarionite', 'Metagrossite', 'Quick Claw', 'Razor Fang', 'Salamencite',
  ],
  bannedMoves: ['Baton Pass', 'Assists', 'Last Respects', 'Shed Tail'],
}

function RulesContentNationalDexOUSingles() {
  const { source, playRestrictions, bannedPokemon, bannedAbilities, bannedItems, bannedMoves } = NATIONAL_DEX_OU_SINGLES
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Source:{' '}
        <a href={source} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
          Smogon National Dex
        </a>
      </p>

      <section className="rounded-lg bg-surface border border-border p-4 sm:p-5">
        <h3 className="text-base font-semibold m-0 mb-3">Play restrictions</h3>
        <p className="text-sm text-muted m-0 mb-2">Players cannot use these strategies:</p>
        <ul className="list-none m-0 p-0 space-y-2">
          {playRestrictions.map((r) => (
            <li key={r.name} className="text-sm">
              <span className="font-medium text-[#e2e8f0]">{r.name}:</span>{' '}
              <span className="text-muted">{r.desc}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg bg-surface border border-border p-4 sm:p-5">
        <h3 className="text-base font-semibold m-0 mb-3">Pokémon restrictions</h3>
        <p className="text-sm text-muted m-0 mb-2">Players cannot use the following Pokémon:</p>
        <div className="flex flex-wrap gap-2">
          {bannedPokemon.map((name) => (
            <BannedPokemonTag key={name} name={name} />
          ))}
        </div>
      </section>

      <section className="rounded-lg bg-surface border border-border p-4 sm:p-5">
        <h3 className="text-base font-semibold m-0 mb-3">Ability restrictions</h3>
        <p className="text-sm text-muted m-0 mb-2">Players cannot use the following abilities:</p>
        <div className="flex flex-wrap gap-2">
          {bannedAbilities.map((name) => (
            <span key={name} className="inline-block py-0.5 px-2 rounded text-sm bg-bg/60 text-muted border border-border/50">
              {name}
            </span>
          ))}
        </div>
      </section>

      <section className="rounded-lg bg-surface border border-border p-4 sm:p-5">
        <h3 className="text-base font-semibold m-0 mb-3">Item restrictions</h3>
        <p className="text-sm text-muted m-0 mb-2">Players cannot use the following items:</p>
        <div className="flex flex-wrap gap-2">
          {bannedItems.map((name) => (
            <BannedItemTag key={name} name={name} />
          ))}
        </div>
      </section>

      <section className="rounded-lg bg-surface border border-border p-4 sm:p-5">
        <h3 className="text-base font-semibold m-0 mb-3">Move restrictions</h3>
        <p className="text-sm text-muted m-0 mb-2">Players cannot use the following moves:</p>
        <div className="flex flex-wrap gap-2">
          {bannedMoves.map((name) => (
            <BannedMoveTag key={name} name={name} />
          ))}
        </div>
      </section>
    </div>
  )
}

export function Rules() {
  const [format, setFormat] = useState<FormatId>('national-dex-ou')
  const [style, setStyle] = useState<StyleId>('singles')

  const showNationalDexOUSingles = format === 'national-dex-ou' && style === 'singles'

  return (
    <div className="w-full max-w-[60rem] mx-auto space-y-6">
      <header>
        <h1 className="text-2xl sm:text-3xl font-semibold m-0">Rules</h1>
        <p className="text-sm text-muted m-0 mt-1">
          Format and battle style rules. Source: Smogon where applicable.
        </p>
      </header>

      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">Format:</span>
          <div className="flex rounded-lg bg-surface border border-border p-0.5">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFormat(f.id)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  format === f.id ? 'bg-accent text-white' : 'text-muted hover:text-[#e2e8f0] hover:bg-surface-hover'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">Battle style:</span>
          <div className="flex rounded-lg bg-surface border border-border p-0.5">
            {STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStyle(s.id)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  style === s.id ? 'bg-accent text-white' : 'text-muted hover:text-[#e2e8f0] hover:bg-surface-hover'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {showNationalDexOUSingles && (
        <>
          <h2 className="text-xl font-semibold m-0">National Dex OU — Singles</h2>
          <RulesContentNationalDexOUSingles />
        </>
      )}

      {!showNationalDexOUSingles && (
        <div className="rounded-lg bg-surface border border-border p-8 text-center text-muted">
          Rules for this format and battle style are not added yet. Only National Dex OU Singles is available for now.
        </div>
      )}
    </div>
  )
}
