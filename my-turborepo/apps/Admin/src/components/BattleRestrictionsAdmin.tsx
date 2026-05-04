import { useCallback, useEffect, useState } from 'react'
import {
  fetchAdminBattleRestrictions,
  putAdminBattleRestrictions,
  uploadBattleRestrictionImage,
  type BattleRestrictionsDocument,
} from '../authApi'
import {
  fetchAbilitySlugOptions,
  fetchItemSlugOptions,
  fetchMoveSlugOptions,
  fetchPokemonSlugOptions,
  type SlugOption,
} from '../pokeRestrictionLists'
import TipTap from './TipTap.tsx'
import { RestrictionSlugPicker } from './RestrictionSlugPicker.tsx'

const emptyDoc: Omit<BattleRestrictionsDocument, 'updated_at'> = {
  format_label: '',
  player_restrictions_html: '',
  pokemon_slugs: [],
  pokemon_notes_html: '',
  pokemon_blacklist_slugs: [],
  pokemon_blacklist_notes_html: '',
  move_slugs: [],
  move_notes_html: '',
  ability_slugs: [],
  ability_notes_html: '',
  item_slugs: [],
  item_notes_html: '',
}

export function BattleRestrictionsAdmin() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [doc, setDoc] = useState<Omit<BattleRestrictionsDocument, 'updated_at'>>(emptyDoc)

  const [pokeOpts, setPokeOpts] = useState<SlugOption[]>([])
  const [moveOpts, setMoveOpts] = useState<SlugOption[]>([])
  const [abOpts, setAbOpts] = useState<SlugOption[]>([])
  const [itemOpts, setItemOpts] = useState<SlugOption[]>([])
  const [listsLoading, setListsLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetchAdminBattleRestrictions()
      .then((d) =>
        setDoc({
          format_label: d.format_label ?? '',
          player_restrictions_html: d.player_restrictions_html ?? '',
          pokemon_slugs: d.pokemon_slugs ?? [],
          pokemon_notes_html: d.pokemon_notes_html ?? '',
          pokemon_blacklist_slugs: d.pokemon_blacklist_slugs ?? [],
          pokemon_blacklist_notes_html: d.pokemon_blacklist_notes_html ?? '',
          move_slugs: d.move_slugs ?? [],
          move_notes_html: d.move_notes_html ?? '',
          ability_slugs: d.ability_slugs ?? [],
          ability_notes_html: d.ability_notes_html ?? '',
          item_slugs: d.item_slugs ?? [],
          item_notes_html: d.item_notes_html ?? '',
        })
      )
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    let cancelled = false
    setListsLoading(true)
    Promise.all([
      fetchPokemonSlugOptions(),
      fetchMoveSlugOptions(),
      fetchAbilitySlugOptions(),
      fetchItemSlugOptions(),
    ])
      .then(([a, b, c, d]) => {
        if (cancelled) return
        setPokeOpts(a)
        setMoveOpts(b)
        setAbOpts(c)
        setItemOpts(d)
      })
      .catch(() => {
        if (!cancelled) {
          setPokeOpts([])
          setMoveOpts([])
          setAbOpts([])
          setItemOpts([])
        }
      })
      .finally(() => {
        if (!cancelled) setListsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const save = async () => {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const saved = await putAdminBattleRestrictions(doc)
      setDoc({
        format_label: saved.format_label ?? '',
        player_restrictions_html: saved.player_restrictions_html ?? '',
        pokemon_slugs: saved.pokemon_slugs ?? [],
        pokemon_notes_html: saved.pokemon_notes_html ?? '',
        pokemon_blacklist_slugs: saved.pokemon_blacklist_slugs ?? [],
        pokemon_blacklist_notes_html: saved.pokemon_blacklist_notes_html ?? '',
        move_slugs: saved.move_slugs ?? [],
        move_notes_html: saved.move_notes_html ?? '',
        ability_slugs: saved.ability_slugs ?? [],
        ability_notes_html: saved.ability_notes_html ?? '',
        item_slugs: saved.item_slugs ?? [],
        item_notes_html: saved.item_notes_html ?? '',
      })
      setMessage('Saved.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const uploadImg = async (file: File) => uploadBattleRestrictionImage(file)

  if (loading) {
    return <p className="text-slate-500">Loading restrictions…</p>
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-white m-0 mb-2">Battle restrictions</h1>
        <p className="text-sm text-slate-500 m-0 max-w-3xl">
          Edits the public “Restrictions” page. Pick Pokémon / moves / abilities / items from PokéAPI lists, or describe
          rules with the rich text areas. HTML is sanitized on save; images upload to Supabase (
          <code className="text-slate-400">restriction_images</code> bucket).
        </p>
      </div>

      {error ? <p className="text-sm text-rose-400 m-0">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-300/95 m-0">{message}</p> : null}

      <section className="rounded-xl border border-white/10 bg-black/25 p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-white m-0">Battle format</h2>
          <p className="text-xs text-slate-500 m-0 mt-1">
            Shown under the page title on the website (e.g. National Dex OU — Singles, VGC Regulation I).
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            id="battle-format-label"
            type="text"
            value={doc.format_label}
            onChange={(e) => setDoc((d) => ({ ...d, format_label: e.target.value }))}
            placeholder="e.g. National Dex OU — Singles"
            maxLength={240}
            className="flex-1 min-w-[12rem] px-3 py-2 rounded-lg bg-black/40 border border-white/15 text-sm text-slate-100 placeholder:text-slate-600"
          />
          <button
            type="button"
            className="px-3 py-2 rounded-lg text-xs font-medium border border-amber-500/35 text-amber-100 bg-amber-600/15 hover:bg-amber-600/25 shrink-0"
            onClick={() => {
              const el = document.getElementById('battle-format-label')
              if (el instanceof HTMLInputElement) el.focus()
            }}
          >
            Type format
          </button>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-white m-0">Player restrictions</h2>
        <p className="text-xs text-slate-500 m-0">General rules, clauses, conduct — anything that applies to players.</p>
        <TipTap
          value={doc.player_restrictions_html}
          onChange={(html) => setDoc((d) => ({ ...d, player_restrictions_html: html }))}
          placeholder="Clauses, conduct, format notes…"
          uploadImage={uploadImg}
        />
      </section>

      <section className="space-y-6">
        <h2 className="text-sm font-semibold text-white m-0">Pokémon</h2>
        <div className="space-y-3 border-l-2 border-emerald-500/25 pl-3">
          <p className="text-xs font-medium text-emerald-200/90 m-0">Restricted</p>
          <RestrictionSlugPicker
            label="Restricted Pokémon (from PokéAPI)"
            hint="Banned from the format entirely. Shown first on the public page."
            options={pokeOpts}
            selected={doc.pokemon_slugs}
            onChange={(slugs) => setDoc((d) => ({ ...d, pokemon_slugs: slugs }))}
            loading={listsLoading}
          />
          <p className="text-xs text-slate-500 m-0">Optional notes for restricted species.</p>
          <TipTap
            value={doc.pokemon_notes_html}
            onChange={(html) => setDoc((d) => ({ ...d, pokemon_notes_html: html }))}
            placeholder="e.g. allowed forms, nuances for restricted Pokémon…"
            uploadImage={uploadImg}
          />
        </div>
        <div className="space-y-3 border-l-2 border-rose-500/30 pl-3">
          <p className="text-xs font-medium text-rose-200/90 m-0">Blacklisted</p>
          <RestrictionSlugPicker
            label="Blacklisted Pokémon"
            hint="Separate list — e.g. temp bans, scouting list, or stricter disallow than “restricted”. Shown in its own block on the site."
            options={pokeOpts}
            selected={doc.pokemon_blacklist_slugs}
            onChange={(slugs) => setDoc((d) => ({ ...d, pokemon_blacklist_slugs: slugs }))}
            loading={listsLoading}
          />
          <p className="text-xs text-slate-500 m-0">Optional notes for the blacklist.</p>
          <TipTap
            value={doc.pokemon_blacklist_notes_html}
            onChange={(html) => setDoc((d) => ({ ...d, pokemon_blacklist_notes_html: html }))}
            placeholder="Why these are blacklisted, duration, exceptions…"
            uploadImage={uploadImg}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white m-0">Moves</h2>
        <RestrictionSlugPicker
          label="Restricted moves"
          options={moveOpts}
          selected={doc.move_slugs}
          onChange={(slugs) => setDoc((d) => ({ ...d, move_slugs: slugs }))}
          loading={listsLoading}
        />
        <TipTap
          value={doc.move_notes_html}
          onChange={(html) => setDoc((d) => ({ ...d, move_notes_html: html }))}
          placeholder="Move ban notes…"
          uploadImage={uploadImg}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white m-0">Abilities</h2>
        <RestrictionSlugPicker
          label="Restricted abilities"
          options={abOpts}
          selected={doc.ability_slugs}
          onChange={(slugs) => setDoc((d) => ({ ...d, ability_slugs: slugs }))}
          loading={listsLoading}
        />
        <TipTap
          value={doc.ability_notes_html}
          onChange={(html) => setDoc((d) => ({ ...d, ability_notes_html: html }))}
          placeholder="Ability ban notes…"
          uploadImage={uploadImg}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white m-0">Items</h2>
        <RestrictionSlugPicker
          label="Restricted items"
          options={itemOpts}
          selected={doc.item_slugs}
          onChange={(slugs) => setDoc((d) => ({ ...d, item_slugs: slugs }))}
          loading={listsLoading}
        />
        <TipTap
          value={doc.item_notes_html}
          onChange={(html) => setDoc((d) => ({ ...d, item_notes_html: html }))}
          placeholder="Item ban notes…"
          uploadImage={uploadImg}
        />
      </section>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="px-5 py-2.5 rounded-xl text-sm font-medium bg-emerald-600/30 border border-emerald-500/45 text-emerald-100 hover:bg-emerald-600/45 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save to database'}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => void load()}
          className="px-5 py-2.5 rounded-xl text-sm font-medium border border-white/15 text-slate-200 hover:bg-white/10 disabled:opacity-50"
        >
          Reload from server
        </button>
      </div>
    </div>
  )
}
