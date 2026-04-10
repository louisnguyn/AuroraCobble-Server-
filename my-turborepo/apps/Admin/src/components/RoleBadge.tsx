import { useMemo, useState } from 'react'

/** LuckPerms key → tên file ảnh (không đuôi), nếu khác key (vd: youtube → youtuber). */
const RANK_IMAGE_FILE: Record<string, string> = {
  youtube: 'youtuber',
}

const RANK_EXT = ['png', 'webp', 'jpg', 'jpeg'] as const

export function rankBadgeSrcCandidates(roleKey: string): string[] {
  const k = (roleKey || 'member').trim().toLowerCase()
  const mapped = RANK_IMAGE_FILE[k] ?? k
  const names = mapped === k ? [mapped] : [mapped, k]
  const out: string[] = []
  for (const name of names) {
    for (const ext of RANK_EXT) {
      out.push(`/ranks/${name}.${ext}`)
    }
  }
  for (const name of names) {
    for (const ext of RANK_EXT) {
      out.push(`/${name}.${ext}`)
    }
  }
  return [...new Set(out)]
}

function fallbackLabel(roleKey: string): string {
  const k = roleKey.trim().toLowerCase()
  const map: Record<string, string> = {
    member: 'MEMBER',
    youtube: 'YOUTUBER',
  }
  return map[k] ?? k.toUpperCase()
}

type RoleBadgeProps = {
  roleKey: string
  className?: string
  compact?: boolean
}

/** Đặt ảnh vào `apps/Admin/public/ranks/<tên>.png` — cùng quy ước tên file với website. */
export function RoleBadge({ roleKey, className = '', compact }: RoleBadgeProps) {
  const k = (roleKey || 'member').trim().toLowerCase()
  const candidates = useMemo(() => rankBadgeSrcCandidates(k), [k])
  const [index, setIndex] = useState(0)
  const exhausted = index >= candidates.length
  const src = exhausted ? '' : candidates[index]

  if (exhausted) {
    return (
      <span
        className={`inline-flex items-center rounded border border-[#4a5568] bg-[#1e293b]/95 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-[#e2e8f0] ${className}`}
        title={k}
      >
        {fallbackLabel(k)}
      </span>
    )
  }

  return (
    <img
      src={src}
      alt=""
      aria-hidden
      loading="lazy"
      decoding="async"
      onError={() => setIndex((i) => i + 1)}
      className={`object-contain object-left [image-rendering:pixelated] ${compact ? 'h-[18px] max-w-[120px] sm:h-5 sm:max-w-[140px]' : 'h-5 max-w-[160px] sm:h-6 sm:max-w-[200px]'} w-auto ${className}`}
    />
  )
}
