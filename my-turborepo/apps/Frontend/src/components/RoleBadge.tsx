import { useMemo, useState } from 'react'

/** LuckPerms key → tên file ảnh (không đuôi), khi khác key. */
const RANK_IMAGE_FILE: Record<string, string> = {}

const RANK_EXT = ['png', 'webp', 'jpg', 'jpeg'] as const

/**
 * Các URL thử lần lượt khi ảnh lỗi (404):
 * - `public/ranks/<tên>.<ext>` — chuẩn khuyến nghị
 * - `public/<tên>.<ext>` — nếu bạn để ảnh thẳng trong `public/`
 * Thử cả tên map và tên key khi có alias trong RANK_IMAGE_FILE.
 */
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

export function rankBadgeImageSrc(roleKey: string): string {
  const all = rankBadgeSrcCandidates(roleKey)
  return all[0] ?? `/ranks/${(roleKey || 'member').trim().toLowerCase()}.png`
}

function fallbackLabel(roleKey: string): string {
  const k = roleKey.trim().toLowerCase()
  const map: Record<string, string> = {
    member: 'MEMBER',
  }
  return map[k] ?? k.toUpperCase()
}

type RoleBadgeProps = {
  roleKey: string
  className?: string
  /** Shorter in tight headers */
  compact?: boolean
}

/**
 * Badge rank cạnh username. Đặt ảnh vào `apps/<app>/public/ranks/<tên>.png` (hoặc `.webp`/`.jpg`).
 * Vite phục vụ `public/` tại URL gốc → `/ranks/champion.png`.
 */
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
