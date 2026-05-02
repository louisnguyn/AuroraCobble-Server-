import { useCallback, useState } from 'react'

type ImgExt = 'png' | 'webp'

export function normalizePvpTierSlugForAssets(slugOrTier: string): string {
  const t = slugOrTier.trim().toLowerCase()
  return t === 'silver' ? 'iron' : t
}

export function pvpTierHumanName(rawTier: string): string {
  const t = rawTier.trim().toLowerCase()
  if (t === 'silver' || t === 'iron') return 'Iron'
  if (!t) return rawTier
  return t
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

/**
 * Shows `public/ranks/{slug}.png` (falls back to `.webp`, then `{displayName}` text).
 * Mirror the Frontend app; include the same asset files under `apps/Admin/public/ranks/` for local Admin builds.
 */
export function PvPTierBadge({
  slug,
  displayName,
  fallbackTextClassName = 'text-slate-400',
  className,
  imgHeightClass = 'h-7',
}: {
  slug: string
  displayName: string
  fallbackTextClassName?: string
  className?: string
  imgHeightClass?: string
}) {
  const [ext, setExt] = useState<ImgExt | null>('png')

  const onImgError = useCallback(() => {
    setExt((prev) => (prev === 'png' ? 'webp' : null))
  }, [])

  if (ext === null) {
    return (
      <span className={`text-xs font-semibold ${fallbackTextClassName} ${className ?? ''}`}>{displayName}</span>
    )
  }

  return (
    <span className={`inline-flex items-center min-h-[1.75rem] ${className ?? ''}`}>
      <img
        src={`/ranks/${slug}.${ext}`}
        alt={displayName}
        title={displayName}
        className={`${imgHeightClass} w-auto max-w-[7rem] object-contain object-left`}
        onError={onImgError}
        loading="lazy"
        decoding="async"
      />
    </span>
  )
}
