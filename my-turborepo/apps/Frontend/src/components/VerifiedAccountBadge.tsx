import type { AuthUser } from '../authApi'

export function isAccountVerified(user: Pick<AuthUser, 'minecraft_verified_at'> | null | undefined): boolean {
  const at = user?.minecraft_verified_at
  return at != null && String(at).length > 0
}

type BadgeProps = {
  className?: string
  title?: string
}

/** Starburst checkmark from `/verified-account.png` (public). */
export function VerifiedAccountBadge({ className = '', title = 'Verified account' }: BadgeProps) {
  return (
    <img
      src="/verified-account.png"
      alt=""
      aria-label={title}
      title={title}
      className={`inline-block shrink-0 object-contain align-middle [vertical-align:-0.125em] ${className}`}
      width={20}
      height={20}
      loading="lazy"
      decoding="async"
    />
  )
}
