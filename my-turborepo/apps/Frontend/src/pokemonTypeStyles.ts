/** Official-style type colors (hex) for badges and accents. */
export const TYPE_BG_HEX: Record<string, string> = {
  normal: '#a8a878',
  fire: '#f08030',
  water: '#6890f0',
  electric: '#f8d030',
  grass: '#78c850',
  ice: '#98d8d8',
  fighting: '#c03028',
  poison: '#a040a0',
  ground: '#e0c068',
  flying: '#a890f0',
  psychic: '#f85888',
  bug: '#a8b820',
  rock: '#b8a038',
  ghost: '#705898',
  dragon: '#7038f8',
  dark: '#705848',
  steel: '#b8b8d0',
  fairy: '#ee99ac',
  stellar: '#a855f7',
}

export function typeKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '')
}

export function formatTypeLabel(name: string): string {
  const k = typeKey(name)
  if (!k) return ''
  if (k === 'hp') return 'HP'
  return k.charAt(0).toUpperCase() + k.slice(1)
}

function hexLuminance(hex: string): number {
  const h = hex.replace('#', '')
  if (h.length !== 6) return 0.5
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  return 0.299 * r + 0.587 * g + 0.114 * b
}

export function typeTextColor(bgHex: string): string {
  return hexLuminance(bgHex) > 0.55 ? '#1a1a22' : '#f8fafc'
}

export function typeAccentColor(typeName: string | null | undefined): string {
  if (!typeName?.trim()) return 'rgba(139, 92, 246, 0.55)'
  const key = typeKey(typeName)
  return TYPE_BG_HEX[key] ?? 'rgba(234, 179, 8, 0.75)'
}

export function getTypeStyle(typeName: string): { backgroundColor: string; color: string; borderColor: string } {
  const key = typeKey(typeName)
  const bg = TYPE_BG_HEX[key] ?? '#6b7280'
  const color = typeTextColor(bg)
  const borderColor =
    hexLuminance(bg) > 0.55 ? 'rgba(0, 0, 0, 0.22)' : 'rgba(255, 255, 255, 0.18)'
  return { backgroundColor: bg, color, borderColor }
}
