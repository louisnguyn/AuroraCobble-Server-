import { useMemo, useState } from 'react'
import type { SlugOption } from '../pokeRestrictionLists'
import { slugToTitleCase } from '../pokeRestrictionLists'

type Props = {
  label: string
  hint?: string
  options: SlugOption[]
  selected: string[]
  onChange: (slugs: string[]) => void
  loading?: boolean
}

export function RestrictionSlugPicker({ label, hint, options, selected, onChange, loading }: Props) {
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const nq = q.trim().toLowerCase()
    if (!nq) return options.slice(0, 80)
    return options.filter((o) => o.slug.includes(nq) || o.label.toLowerCase().includes(nq)).slice(0, 120)
  }, [options, q])

  const selectedSet = useMemo(() => new Set(selected), [selected])

  const add = (slug: string) => {
    if (selectedSet.has(slug)) return
    onChange([...selected, slug])
  }

  const remove = (slug: string) => {
    onChange(selected.filter((s) => s !== slug))
  }

  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-white m-0">{label}</h3>
        {hint ? <p className="text-xs text-slate-500 m-0 mt-1">{hint}</p> : null}
      </div>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search to filter…"
        className="w-full px-2 py-1.5 rounded-lg bg-black/40 border border-white/15 text-sm text-slate-100 placeholder:text-slate-600"
      />
      <div className="max-h-44 overflow-y-auto rounded-lg border border-white/10 bg-black/35 text-sm">
        {loading ? (
          <p className="p-3 text-slate-500 m-0">Loading list…</p>
        ) : filtered.length === 0 ? (
          <p className="p-3 text-slate-500 m-0">No matches.</p>
        ) : (
          <ul className="m-0 p-0 list-none divide-y divide-white/10">
            {filtered.map((o) => (
              <li key={o.slug}>
                <button
                  type="button"
                  disabled={selectedSet.has(o.slug)}
                  onClick={() => add(o.slug)}
                  className="w-full text-left px-3 py-2 text-slate-200 hover:bg-white/10 disabled:opacity-40 disabled:cursor-default"
                >
                  <span className="text-amber-200/90">+</span> {o.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="text-xs text-slate-500 m-0 mb-2">Selected ({selected.length})</p>
        <div className="flex flex-wrap gap-2">
          {selected.length === 0 ? (
            <span className="text-xs text-slate-600 italic">Nothing selected yet — use rich text below if listing manually.</span>
          ) : (
            selected.map((slug) => (
              <button
                key={slug}
                type="button"
                onClick={() => remove(slug)}
                className="inline-flex items-center gap-1 py-1 px-2 rounded-lg text-xs font-medium bg-amber-900/35 border border-amber-700/35 text-amber-100 hover:bg-amber-900/55"
              >
                × {slugToTitleCase(slug)}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
