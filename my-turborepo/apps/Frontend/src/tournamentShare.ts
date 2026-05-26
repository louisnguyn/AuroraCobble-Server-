/** Path route: `/tournament/{slug}` — shareable bracket links (no hash). */

/** Strip pasted full URLs — extract slug from path, hash, or plain text. */
export function normalizeTournamentSlug(input: string): string {
  let s = input.trim()
  if (!s) return ''

  if (s.startsWith('#')) s = s.slice(1).trim()

  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s)
      const fromPath = u.pathname.match(/\/tournament\/([^/]+)/i)
      if (fromPath) {
        s = fromPath[1]
      } else {
        const fromHash = u.hash.replace(/^#/, '')
        if (fromHash.toLowerCase().startsWith('tournament/')) {
          s = fromHash.slice('tournament/'.length)
        } else {
          const parts = u.pathname.split('/').filter(Boolean)
          s = parts[parts.length - 1] ?? s
        }
      }
    } catch {
      /* keep s */
    }
  }

  const fromPath = s.match(/\/tournament\/([^/?#]+)/i)
  if (fromPath) s = fromPath[1]

  const embedded =
    s.match(/#tournament\/([^?#]+)/i) ?? s.match(/(?:^|\/)tournament\/([^?#]+)/i)
  if (embedded) s = embedded[1]

  if (s.toLowerCase().startsWith('tournament/')) {
    s = s.slice('tournament/'.length)
  }

  try {
    s = decodeURIComponent(s)
  } catch {
    /* keep s */
  }

  return s.trim().toLowerCase()
}

export function parseTournamentSlugFromPath(): string | null {
  if (typeof window === 'undefined') return null
  const match = window.location.pathname.match(/^\/tournament\/([^/]+)\/?$/i)
  if (!match) return null
  const slug = normalizeTournamentSlug(match[1])
  return slug || null
}

function parseTournamentSlugFromHash(): string | null {
  if (typeof window === 'undefined') return null
  const raw = window.location.hash.replace(/^#/, '')
  if (!raw) return null

  if (raw.toLowerCase().startsWith('tournament/')) {
    const slug = normalizeTournamentSlug(raw)
    return slug || null
  }

  if (/^https?:\/\//i.test(raw) || raw.includes('tournament/')) {
    const slug = normalizeTournamentSlug(raw)
    return slug || null
  }

  return null
}

/** Redirect legacy `#tournament/slug` bookmarks to `/tournament/slug`. */
export function migrateTournamentHashToPath(): string | null {
  const slug = parseTournamentSlugFromHash()
  if (!slug || typeof window === 'undefined') return null
  setTournamentPath(slug, 'replace')
  return slug
}

export function parseTournamentSlugFromLocation(): string | null {
  return parseTournamentSlugFromPath() ?? migrateTournamentHashToPath()
}

export function buildTournamentShareUrl(slug: string): string {
  if (typeof window === 'undefined') return ''
  const s = normalizeTournamentSlug(slug)
  if (!s) return ''
  return `${window.location.origin}/tournament/${encodeURIComponent(s)}`
}

export function setTournamentPath(slug: string, mode: 'push' | 'replace' = 'replace'): void {
  const s = normalizeTournamentSlug(slug)
  if (!s || typeof window === 'undefined') return
  const next = `/tournament/${encodeURIComponent(s)}`
  if (mode === 'push') window.history.pushState(null, '', next)
  else window.history.replaceState(null, '', next)
}

export function clearTournamentPath(): void {
  if (typeof window === 'undefined') return
  if (!parseTournamentSlugFromPath()) return
  window.history.replaceState(null, '', '/')
}

/** @deprecated Use setTournamentPath */
export const setTournamentShareHash = setTournamentPath

/** @deprecated Use clearTournamentPath */
export const clearTournamentShareHash = clearTournamentPath

/** @deprecated Use migrateTournamentHashToPath */
export const repairTournamentHashIfNeeded = migrateTournamentHashToPath

/** @deprecated Use parseTournamentSlugFromLocation */
export { parseTournamentSlugFromHash }
