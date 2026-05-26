import { useEffect, useState } from 'react'
import { fetchMoveType } from '../pokemonApi.ts'
import { getTypeStyle } from '../pokemonTypeStyles.ts'

const NEUTRAL_MOVE_STYLE = {
  backgroundColor: 'rgba(34, 211, 238, 0.08)',
  color: '#e2e8f0',
  borderColor: 'rgba(34, 211, 238, 0.18)',
}

function MoveChip({ name, type }: { name: string; type: string | null | undefined }) {
  const style = type ? getTypeStyle(type) : NEUTRAL_MOVE_STYLE
  const loading = type === undefined

  return (
    <li
      className={`team-mon-move${loading ? ' team-mon-move--loading' : ''}`}
      style={{
        backgroundColor: style.backgroundColor,
        color: style.color,
        borderColor: style.borderColor,
      }}
      title={type ? `${name} (${type})` : name}
    >
      {name}
    </li>
  )
}

export function PokemonMoveList({ moves }: { moves: string[] }) {
  const [types, setTypes] = useState<Record<string, string | null | undefined>>({})

  const namesKey = moves.join('\0')

  useEffect(() => {
    if (moves.length === 0) return
    let cancelled = false
    setTypes(Object.fromEntries(moves.map((m) => [m, undefined])))
    moves.forEach((name) => {
      void fetchMoveType(name).then((t) => {
        if (!cancelled) setTypes((prev) => ({ ...prev, [name]: t }))
      })
    })
    return () => {
      cancelled = true
    }
  }, [namesKey])

  if (moves.length === 0) return null

  return (
    <ul className="team-mon-moves" aria-label="Moves">
      {moves.map((mv, i) => (
        <MoveChip key={`${i}-${mv}`} name={mv} type={types[mv]} />
      ))}
    </ul>
  )
}
