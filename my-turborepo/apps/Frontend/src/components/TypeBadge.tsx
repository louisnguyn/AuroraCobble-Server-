import { formatTypeLabel, getTypeStyle } from '../pokemonTypeStyles.ts'

export function TypeBadge({ type, title }: { type: string; title?: string }) {
  const label = formatTypeLabel(type)
  if (!label) return null
  const style = getTypeStyle(type)

  return (
    <span
      className="type-badge"
      style={{
        backgroundColor: style.backgroundColor,
        color: style.color,
        borderColor: style.borderColor,
      }}
      title={title ?? label}
    >
      {label}
    </span>
  )
}
