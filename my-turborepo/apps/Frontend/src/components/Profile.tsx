import type { ChangeEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchPublicProfile, patchMyPublicProfile, uploadProfileAvatar, type PublicProfile } from '../authApi'
import { useAuth } from '../contexts/AuthContext'
import { RoleBadge } from './RoleBadge.tsx'
import { normalizePvpTierSlugForAssets, pvpTierHumanName, PvPTierBadge } from './PvPTierBadge.tsx'
import { isAccountVerified, VerifiedAccountBadge } from './VerifiedAccountBadge.tsx'

export function parseProfileSlugFromHash(): string | null {
  if (typeof window === 'undefined') return null
  const raw = window.location.hash.replace(/^#/, '')
  if (!raw.startsWith('profile/')) return null
  const rest = raw.slice('profile/'.length)
  try {
    const slug = decodeURIComponent(rest).trim()
    return slug || null
  } catch {
    return rest.trim() || null
  }
}

/** Full profile URL including hash — for clipboard. */
export function buildProfileShareUrl(username: string) {
  if (typeof window === 'undefined') return ''
  return `${window.location.origin}${window.location.pathname.replace(/\/$/, '')}${window.location.search}#profile/${encodeURIComponent(username.trim())}`
}

function formatJoined(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

function formatPvpFormatLabel(raw: string): string {
  const t = raw.replace(/_/g, ' ').trim().toLowerCase()
  return t.replace(/\b\w/g, (c) => c.toUpperCase())
}

const PROFILE_AC_TIER_CLASS: Record<string, string> = {
  silver: 'profile-ac-card profile-ac-silver',
  cyan: 'profile-ac-card profile-ac-cyan',
  emerald: 'profile-ac-card profile-ac-emerald',
  violet: 'profile-ac-card profile-ac-violet',
  rose: 'profile-ac-card profile-ac-rose',
  gold: 'profile-ac-card profile-ac-gold',
  crimson: 'profile-ac-card profile-ac-crimson',
  mythic: 'profile-ac-card profile-ac-mythic',
}

function achievementCardClass(tier: string) {
  return PROFILE_AC_TIER_CLASS[tier] ?? 'profile-ac-card profile-ac-cyan'
}

type ProfileProps = {
  slugFromHashOrNav: string | null
}

export function Profile({ slugFromHashOrNav }: ProfileProps) {
  const { user, isAuthenticated } = useAuth()
  const fromHash = slugFromHashOrNav?.trim() ?? ''
  const targetUsername =
    fromHash.length > 0
      ? fromHash
      : isAuthenticated && user?.username
        ? user.username.trim()
        : null

  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [editBio, setEditBio] = useState('')
  const [editAvatar, setEditAvatar] = useState('')
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const avatarFileRef = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState(false)

  const isSelf = Boolean(
    isAuthenticated && profile && user?.username?.trim().toLowerCase() === profile.username.trim().toLowerCase()
  )
  /** Hash URLs (#profile/name) are for sharing — never show bio/avatar editor there, even if it's your profile. */
  const isShareLinkView = (slugFromHashOrNav?.trim() ?? '').length > 0
  const showOwnCardEditor = isSelf && !isShareLinkView

  const reload = useCallback(async () => {
    if (!targetUsername) {
      setProfile(null)
      setLoading(false)
      setLoadErr(null)
      return
    }
    setLoading(true)
    setLoadErr(null)
    try {
      const data = await fetchPublicProfile(targetUsername)
      setProfile(data.profile)
      if (data.profile.username === user?.username) {
        setEditBio(data.profile.bio ?? '')
        setEditAvatar(data.profile.avatarUrl ?? '')
      }
    } catch (e: unknown) {
      setProfile(null)
      setLoadErr((e as Error)?.message ?? 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }, [targetUsername, user?.username])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    if (showOwnCardEditor && profile) {
      setEditBio(profile.bio ?? '')
      setEditAvatar(profile.avatarUrl ?? '')
    }
  }, [showOwnCardEditor, profile?.bio, profile?.avatarUrl])

  const tierSlug = profile?.pvp.tier?.trim()
    ? normalizePvpTierSlugForAssets(profile.pvp.tier)
    : ''

  const shareLink = profile ? buildProfileShareUrl(profile.username) : ''

  const onCopyShare = async () => {
    if (!shareLink) return
    try {
      await navigator.clipboard.writeText(shareLink)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const onPickAvatarFile = () => avatarFileRef.current?.click()

  const onAvatarFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !isSelf) return
    setUploadingAvatar(true)
    setSaveErr(null)
    try {
      const { profile: updated } = await uploadProfileAvatar(file)
      setProfile(updated)
      setEditAvatar(updated.avatarUrl ?? '')
    } catch (err: unknown) {
      setSaveErr((err as Error)?.message ?? 'Upload failed')
    } finally {
      setUploadingAvatar(false)
    }
  }

  const onSave = async () => {
    if (!isSelf) return
    setSaving(true)
    setSaveErr(null)
    try {
      const trimmedAvatar = editAvatar.trim()
      const patch: { bio: string; avatar_url?: string | null } = { bio: editBio }
      patch.avatar_url = trimmedAvatar === '' ? null : trimmedAvatar
      const data = await patchMyPublicProfile(patch)
      setProfile(data.profile)
    } catch (e: unknown) {
      setSaveErr((e as Error)?.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const headline = useMemo(() => {
    if (!profile) return 'Profile'
    return profile.username
  }, [profile])

  if (!targetUsername) {
    return (
      <div className="profile-page max-w-3xl mx-auto">
        <div className="profile-glass rounded-3xl border border-[#2d2a45]/80 p-10 text-center profile-ambient">
          <p className="text-lg text-muted m-0 mb-4">
            Sign in to open your public profile card — then share your link with friends.
          </p>
          <p className="text-sm text-[#cbd5e1] m-0">
            Profiles show your role badge, Cobble-ranked snapshot, badges for milestones (verification, podium, streaks).
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="profile-page max-w-3xl mx-auto flex justify-center py-24">
        <p className="text-muted animate-pulse">Opening trainer card…</p>
      </div>
    )
  }

  if (loadErr || !profile) {
    return (
      <div className="profile-page max-w-3xl mx-auto">
        <div className="profile-glass rounded-3xl border border-[color-mix(in_srgb,var(--color-error)_55%,transparent)] p-8 text-center">
          <p className="text-error m-0">{loadErr ?? 'Profile unavailable'}</p>
        </div>
      </div>
    )
  }

  const showPvPCard = Boolean(
    profile.pvp.rank != null || profile.pvp.elo != null || (profile.pvp.tier ?? '').trim()
  )

  return (
    <div className="profile-page max-w-4xl mx-auto pb-16">
      <div className="profile-hero profile-ambient rounded-[2rem] overflow-hidden mb-10 border border-[#362f55]/90 profile-glass relative">
        <div className="profile-hero-grid-bg pointer-events-none" aria-hidden />
        <a
          href="/"
          className="profile-hero-logo-link"
          aria-label="Aurora Cobble — home"
        >
          <img src="/logo.png" alt="" className="profile-hero-logo-img" loading="lazy" decoding="async" />
        </a>
        <div className="relative z-[1] p-8 sm:p-10 flex flex-col sm:flex-row gap-8 items-start">
          <div className="profile-avatar-shell shrink-0">
            <div className="profile-avatar-ring">
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt="" className="profile-avatar-img" loading="lazy" />
              ) : (
                <div className="profile-avatar-placeholder" aria-hidden title="No avatar set">
                  {profile.username.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
          </div>

          <div className="min-w-0 flex-1 pt-2 pr-[min(62vw,16rem)] sm:pr-52 md:pr-56 lg:pr-60 xl:pr-72">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight m-0 bg-gradient-to-r from-[#f8fafc] via-[#c4b5fd] to-[#22d3ee] bg-clip-text text-transparent">
                {headline}
              </h1>
              {isAuthenticated &&
              user?.username?.toLowerCase() === profile.username.toLowerCase() &&
              isAccountVerified(user) ? (
                <VerifiedAccountBadge className="w-9 h-9 flex-shrink-0" title="Verified account" />
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2 mb-6 items-center">
              <RoleBadge roleKey={profile.minecraftRole ?? 'member'} />
              <span className="text-xs text-muted">
                Trainer since{' '}
                <time dateTime={profile.memberSince}>{formatJoined(profile.memberSince)}</time>
              </span>
            </div>

            <div className="flex flex-wrap gap-3">
              <button type="button" className="pixel-btn-primary px-4 py-2 text-sm font-semibold" onClick={onCopyShare}>
                {copied ? 'Copied link' : 'Copy share link'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr,minmax(0,22rem)]">
        <div className="space-y-8 min-w-0">
          <section className="profile-glass rounded-2xl border border-[#2d2a45]/85 p-6 sm:p-8">
            <h2 className="text-xl font-bold m-0 mb-4 profile-section-heading">Bio</h2>
            <p className="text-[#cbd5f5] whitespace-pre-wrap m-0 leading-relaxed">
              {profile.bio?.trim() ? profile.bio : <span className="text-muted italic">No bio yet.</span>}
            </p>
          </section>

          <section className="profile-glass rounded-2xl border border-[#2d2a45]/85 p-6 sm:p-8">
            <h2 className="text-xl font-bold m-0 mb-5 profile-section-heading">Achievements</h2>
            {profile.achievements.length === 0 ? (
              <p className="text-muted m-0 italic">No achievements yet.</p>
            ) : (
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 profile-achievements-grid">
                {profile.achievements.map((a) =>
                  a.tier === 'mythic' ? (
                    <div key={a.id} className={achievementCardClass(a.tier)}>
                      <span className="profile-ac-mythic-ring" aria-hidden />
                      <div className="profile-ac-mythic-fill">
                        <p className="text-sm font-bold m-0 mb-1 tracking-wide">{a.title}</p>
                        <p className="text-xs text-[#aab4d9] leading-snug m-0">{a.description}</p>
                      </div>
                    </div>
                  ) : (
                    <div key={a.id} className={achievementCardClass(a.tier)}>
                      <p className="text-sm font-bold m-0 mb-1 tracking-wide">{a.title}</p>
                      <p className="text-xs text-[#aab4d9] leading-snug m-0">{a.description}</p>
                    </div>
                  )
                )}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6 min-w-0">
          {showPvPCard ? (
            <section className="profile-glass rounded-2xl border p-6 sm:p-7 profile-rank-strip">
              <div className="profile-rank-card-head">
                <div className="profile-rank-icon-wrap" aria-hidden>
                  <svg
                    className="w-[1.125rem] h-[1.125rem]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M8 21h8M12 17V4M7 10l5-5 5 5" />
                    <path d="M5 14h14" opacity="0.6" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="profile-rank-title">Current rank</h2>
                  <p className="profile-rank-sub">Synced from site ladder</p>
                </div>
              </div>
              <dl className="m-0">
                {profile.pvp.rank != null ? (
                  <div className="profile-rank-stat-row">
                    <dt className="profile-rank-stat-label m-0">Ladder rank</dt>
                    <dd className="profile-rank-ranked-num m-0 tabular-nums">#{profile.pvp.rank}</dd>
                  </div>
                ) : null}
                {profile.pvp.elo != null ? (
                  <div className="profile-rank-stat-row">
                    <dt className="profile-rank-stat-label m-0">ELO</dt>
                    <dd className="profile-rank-stat-val profile-rank-elonum m-0">{Math.round(profile.pvp.elo)}</dd>
                  </div>
                ) : null}
                {tierSlug ? (
                  <div className="profile-rank-stat-row profile-rank-stat-row-tier items-center">
                    <dt className="profile-rank-stat-label m-0">Tier</dt>
                    <dd className="m-0 min-w-0 flex justify-end shrink-0">
                      <PvPTierBadge
                        slug={tierSlug}
                        displayName={
                          profile.pvp.tier?.trim() ? pvpTierHumanName(profile.pvp.tier) : 'Tier'
                        }
                        imgHeightClass="h-9 sm:h-10"
                        className="profile-rank-tier-inline"
                      />
                    </dd>
                  </div>
                ) : null}
                {profile.pvp.format?.trim() ? (
                  <div className="profile-rank-stat-row items-center">
                    <dt className="profile-rank-stat-label m-0">Format</dt>
                    <dd className="m-0 min-w-0">
                      <span className="profile-rank-pill" title={formatPvpFormatLabel(profile.pvp.format)}>
                        {formatPvpFormatLabel(profile.pvp.format)}
                      </span>
                    </dd>
                  </div>
                ) : null}
              </dl>
            </section>
          ) : null}

          {showOwnCardEditor ? (
            <section className="profile-glass rounded-2xl border border-[#4338ca]/55 p-6 profile-edit-outline">
              <h2 className="text-lg font-bold m-0 mb-4 profile-section-heading edit-glow-text">Your card</h2>
              <p className="text-xs text-muted m-0 mb-4 leading-relaxed">
                Upload a square-ish PNG, JPG, GIF, or WebP (max 2 MB); it is saved to this site. Or paste a direct HTTPS URL
                to the image file (must start with <code className="text-[#a78bfa]">https://</code>). Use a link that points
                at the picture itself (<code className="text-[#a78bfa]">…/something.png</code>), not an album page. On
                Discord, right‑click the image → Open link → copy that URL. Bio: up to 800 characters.
              </p>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#94a3b8] mb-2">
                Bio
              </label>
              <textarea
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                rows={6}
                maxLength={850}
                className="profile-input-area w-full mb-4"
                placeholder="What do you specialize in?"
              />

              <input
                ref={avatarFileRef}
                id="profile-avatar-upload"
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                className="sr-only"
                onChange={onAvatarFileChange}
              />
              <div className="flex flex-wrap gap-2 mb-2">
                <button
                  type="button"
                  className="pixel-btn py-2 px-4 text-sm"
                  disabled={uploadingAvatar}
                  onClick={onPickAvatarFile}
                  aria-controls="profile-avatar-upload"
                >
                  {uploadingAvatar ? 'Uploading…' : 'Upload image from device'}
                </button>
              </div>

              <label className="block text-xs font-semibold uppercase tracking-wider text-[#94a3b8] mb-2 mt-4">
                Or paste image URL
              </label>
              <input
                type="url"
                inputMode="url"
                placeholder="https://cdn.example.com/avatar.png"
                value={editAvatar}
                onChange={(e) => setEditAvatar(e.target.value)}
                className="profile-input-text w-full mb-4"
              />

              {saveErr ? (
                <p className="text-sm text-[var(--color-error)] m-0 mb-3">{saveErr}</p>
              ) : null}

              <button
                type="button"
                className="pixel-btn-primary w-full py-3 font-semibold"
                disabled={saving || uploadingAvatar}
                onClick={onSave}
              >
                {saving ? 'Saving…' : 'Save bio & pasted URL'}
              </button>
            </section>
          ) : (
            <p className="text-xs text-muted text-center px-4 m-0">
              This trainer card reflects live site achievements and Cobble-ranked data.
            </p>
          )}
        </div>
      </div>

      {shareLink ? (
        <p className="mt-10 text-[11px] text-muted font-mono break-all text-center opacity-75">{shareLink}</p>
      ) : null}
    </div>
  )
}
