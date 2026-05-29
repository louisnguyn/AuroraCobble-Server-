/** Path route: `/profile/{username}` — shareable trainer cards (no hash). */

export function normalizeProfileUsername(input: string): string {
  let s = input.trim()
  if (!s) return ''

  if (s.startsWith('#')) s = s.slice(1).trim()

  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s)
      const fromPath = u.pathname.match(/\/profile\/([^/]+)/i)
      if (fromPath) {
        s = fromPath[1]
      } else {
        const fromHash = u.hash.replace(/^#/, '')
        if (fromHash.toLowerCase().startsWith('profile/')) {
          s = fromHash.slice('profile/'.length)
        } else {
          const parts = u.pathname.split('/').filter(Boolean)
          s = parts[parts.length - 1] ?? s
        }
      }
    } catch {
      /* keep s */
    }
  }

  const fromPath = s.match(/\/profile\/([^/?#]+)/i)
  if (fromPath) s = fromPath[1]

  const embedded = s.match(/#profile\/([^?#]+)/i) ?? s.match(/(?:^|\/)profile\/([^?#]+)/i)
  if (embedded) s = embedded[1]

  if (s.toLowerCase().startsWith('profile/')) {
    s = s.slice('profile/'.length)
  }

  try {
    s = decodeURIComponent(s)
  } catch {
    /* keep s */
  }

  return s.trim()
}

export function parseProfileSlugFromPath(): string | null {
  if (typeof window === 'undefined') return null
  const match = window.location.pathname.match(/^\/profile\/([^/]+)\/?$/i)
  if (!match) return null
  const slug = normalizeProfileUsername(match[1])
  return slug || null
}

function parseProfileSlugFromHash(): string | null {
  if (typeof window === 'undefined') return null
  const raw = window.location.hash.replace(/^#/, '')
  if (!raw.toLowerCase().startsWith('profile/')) return null
  const slug = normalizeProfileUsername(raw)
  return slug || null
}

/** Redirect legacy `#profile/name` bookmarks to `/profile/name`. */
export function migrateProfileHashToPath(): string | null {
  const slug = parseProfileSlugFromHash()
  if (!slug || typeof window === 'undefined') return null
  setProfilePath(slug, 'replace')
  return slug
}

export function parseProfileSlugFromLocation(): string | null {
  return parseProfileSlugFromPath() ?? migrateProfileHashToPath()
}

export function buildProfileShareUrl(username: string): string {
  if (typeof window === 'undefined') return ''
  const s = normalizeProfileUsername(username)
  if (!s) return ''
  return `${window.location.origin}/profile/${encodeURIComponent(s)}`
}

export function setProfilePath(username: string, mode: 'push' | 'replace' = 'replace'): void {
  const s = normalizeProfileUsername(username)
  if (!s || typeof window === 'undefined') return
  const next = `/profile/${encodeURIComponent(s)}`
  if (mode === 'push') window.history.pushState(null, '', next)
  else window.history.replaceState(null, '', next)
}

export function clearProfilePath(): void {
  if (typeof window === 'undefined') return
  if (!parseProfileSlugFromPath()) return
  window.history.replaceState(null, '', '/')
}

/** Fired after programmatic history updates (pushState does not trigger popstate). */
export const APP_ROUTE_SYNC_EVENT = 'aurora:route-sync'

export function notifyAppRouteSync(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(APP_ROUTE_SYNC_EVENT))
}

export function navigateToPublicProfile(username: string): void {
  setProfilePath(username, 'push')
  notifyAppRouteSync()
}

/** @deprecated Use parseProfileSlugFromLocation */
export { parseProfileSlugFromHash }
