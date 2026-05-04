/** Labels for restriction pickers (PokéAPI slugs). */

export function slugToTitleCase(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}

export type SlugOption = { slug: string; label: string }

export async function fetchPokemonSlugOptions(): Promise<SlugOption[]> {
  const res = await fetch('https://pokeapi.co/api/v2/pokemon?limit=2500')
  if (!res.ok) return []
  const data = (await res.json()) as { results?: Array<{ name: string }> }
  const rows = data.results ?? []
  return rows.map((r) => ({ slug: r.name, label: slugToTitleCase(r.name) })).sort((a, b) => a.label.localeCompare(b.label))
}

export async function fetchMoveSlugOptions(): Promise<SlugOption[]> {
  const out: SlugOption[] = []
  try {
    let url: string | null = 'https://pokeapi.co/api/v2/move?limit=500'
    while (url) {
      const res = await fetch(url)
      if (!res.ok) break
      const data = (await res.json()) as { next?: string | null; results?: Array<{ name: string }> }
      for (const r of data.results ?? []) {
        if (r?.name) out.push({ slug: r.name, label: slugToTitleCase(r.name) })
      }
      url = typeof data.next === 'string' ? data.next : null
    }
  } catch {
    return []
  }
  out.sort((a, b) => a.label.localeCompare(b.label))
  return out
}

export async function fetchAbilitySlugOptions(): Promise<SlugOption[]> {
  const out: SlugOption[] = []
  try {
    let url: string | null = 'https://pokeapi.co/api/v2/ability?limit=500'
    while (url) {
      const res = await fetch(url)
      if (!res.ok) break
      const data = (await res.json()) as { next?: string | null; results?: Array<{ name: string }> }
      for (const r of data.results ?? []) {
        if (r?.name) out.push({ slug: r.name, label: slugToTitleCase(r.name) })
      }
      url = typeof data.next === 'string' ? data.next : null
    }
  } catch {
    return []
  }
  out.sort((a, b) => a.label.localeCompare(b.label))
  return out
}

export async function fetchItemSlugOptions(): Promise<SlugOption[]> {
  const out: SlugOption[] = []
  try {
    let url: string | null = 'https://pokeapi.co/api/v2/item?limit=500'
    while (url) {
      const res = await fetch(url)
      if (!res.ok) break
      const data = (await res.json()) as { next?: string | null; results?: Array<{ name: string }> }
      for (const r of data.results ?? []) {
        if (r?.name) out.push({ slug: r.name, label: slugToTitleCase(r.name) })
      }
      url = typeof data.next === 'string' ? data.next : null
    }
  } catch {
    return []
  }
  out.sort((a, b) => a.label.localeCompare(b.label))
  return out
}
