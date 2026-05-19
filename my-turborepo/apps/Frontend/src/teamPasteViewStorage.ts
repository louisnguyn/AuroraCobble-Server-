export const TEAM_PASTE_VIEW_KEY = 'aurora-team-paste-view'

export type TeamPasteViewPayload = {
  title: string
  paste: string
  pokepastUrl?: string
  createdAt: number
}

export function saveTeamPasteView(payload: {
  title: string
  paste: string
  pokepastUrl?: string
}): void {
  try {
    const data: TeamPasteViewPayload = {
      ...payload,
      createdAt: Date.now(),
    }
    localStorage.setItem(TEAM_PASTE_VIEW_KEY, JSON.stringify(data))
  } catch {
    /* quota / private mode */
  }
}

export function loadTeamPasteView(): TeamPasteViewPayload | null {
  try {
    const raw = localStorage.getItem(TEAM_PASTE_VIEW_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as TeamPasteViewPayload
    if (!data?.paste?.trim()) return null
    return data
  } catch {
    return null
  }
}

export function isTeamPasteViewHash(): boolean {
  if (typeof window === 'undefined') return false
  const h = window.location.hash.replace(/^#/, '').toLowerCase()
  return h === 'team/paste' || h.startsWith('team/paste/')
}
