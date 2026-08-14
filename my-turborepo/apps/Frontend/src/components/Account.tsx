import { displayInventoryItemName } from '../inventoryLabels'
import { websitePointsBalance } from '../currencyLabel'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  buyShopItem,
  changePassword,
  claimDailyLoginReward,
  claimInventoryItem,
  fetchDailyLoginStatus,
  fetchShopItems,
  fetchUserPvpRank,
  fetchUserCurrencies,
  fetchUserInventory,
  fetchVerificationStatus,
  submitVerificationRequest,
  fetchRoleCatalog,
  buyRank,
  activateOwnedRank,
  claimVipTier,
  fetchRoleRequestStatus,
  submitRoleGrantRequest,
  type VerificationStatusResponse,
  type RoleCatalogEntry,
  type VipCatalogEntry,
  type RoleWebsitePerks,
  type DailyLoginStatus,
  type UserPvpRank,
  type BattlePassShopItem,
  type ShopItem,
} from '../authApi'
import { AuthModal } from './AuthModal'
import { CobbleWebsiteWallet } from './CobbleWebsiteWallet.tsx'
import { CustomSelect } from './CustomSelect.tsx'
import { isAccountVerified, VerifiedAccountBadge } from './VerifiedAccountBadge.tsx'
import { RoleBadge } from './RoleBadge.tsx'
import { AccountRankHistory } from './AccountRankHistory.tsx'
import { normalizePvpTierSlugForAssets, pvpTierHumanName, PvPTierBadge } from './PvPTierBadge.tsx'
import { PageHeader, PageNotice, PageShell, PageSection, PageTabBar } from './PageLayout.tsx'

type DailyStatAccent = 'violet' | 'amber' | 'sky' | 'emerald' | 'cyan'

const DAILY_STAT_SHELL: Record<DailyStatAccent, { box: string; label: string }> = {
  violet: {
    box: 'border-violet-500/40 bg-gradient-to-b from-violet-950/45 to-[#0f0a1a]/60',
    label: 'text-violet-300/85',
  },
  amber: {
    box: 'border-amber-500/45 bg-gradient-to-b from-amber-950/50 to-[#0f0a1a]/60',
    label: 'text-amber-300/85',
  },
  sky: {
    box: 'border-sky-500/40 bg-gradient-to-b from-sky-950/45 to-[#0f0a1a]/60',
    label: 'text-sky-300/85',
  },
  emerald: {
    box: 'border-emerald-500/35 bg-gradient-to-b from-emerald-950/35 to-[#0f0a1a]/60',
    label: 'text-emerald-300/85',
  },
  cyan: {
    box: 'border-cyan-500/35 bg-gradient-to-b from-cyan-950/35 to-[#0f0a1a]/60',
    label: 'text-cyan-300/85',
  },
}

function DailyRewardStatCard({
  label,
  value,
  sub,
  accent = 'violet',
  valueClassName = 'text-[#f5efe6]',
}: {
  label: string
  value: ReactNode
  sub?: string
  accent?: DailyStatAccent
  valueClassName?: string
}) {
  const tone = DAILY_STAT_SHELL[accent]
  return (
    <div className={`rounded-xl border px-3 py-4 text-center ${tone.box}`}>
      <p className={`text-[10px] uppercase tracking-wider font-semibold m-0 mb-2 ${tone.label}`}>{label}</p>
      <div className={`text-2xl sm:text-3xl font-bold tabular-nums m-0 leading-none ${valueClassName}`}>{value}</div>
      {sub ? <p className="text-[11px] text-muted mt-2 m-0 leading-snug">{sub}</p> : null}
    </div>
  )
}

function perksForMinecraftRole(
  cat: {
    purchasable: RoleCatalogEntry[]
    grantOnly: RoleCatalogEntry[]
    vip?: VipCatalogEntry[]
    memberPerks: RoleWebsitePerks
  },
  minecraftRole: string
): RoleWebsitePerks {
  const k = minecraftRole.trim().toLowerCase()
  return (
    cat.purchasable.find((e) => e.key === k)?.perks ??
    cat.grantOnly.find((e) => e.key === k)?.perks ??
    cat.memberPerks
  )
}

type RoleCatState = {
  defaultRole: string
  memberPerks: RoleWebsitePerks
  purchasable: RoleCatalogEntry[]
  grantOnly: RoleCatalogEntry[]
  vip: VipCatalogEntry[]
  currentRole?: string
  activeDisplayRole?: string
  highestShopRank?: string
  shopProgressRoleKey?: string
  highestVip?: string
  nextPurchasableRoleKey?: string | null
  websiteVipTier?: string
  nextVipClaimKey?: string | null
  ownedRoles?: string[]
  ownedInventory?: { key: string; kind: string; active: boolean }[]
  mythicBadgeCount?: number
  goldBadgeCount?: number
  legendBadgeCount?: number
  profileBadgeCounts?: { mythic: number; gold: number; legend: number }
  purchasableTierOrder?: string[]
}

function roleCatFromApi(roles: Awaited<ReturnType<typeof fetchRoleCatalog>>): RoleCatState {
  return {
    defaultRole: roles.defaultRole,
    memberPerks: roles.memberPerks,
    purchasable: roles.purchasable,
    grantOnly: roles.grantOnly,
    vip: roles.vip ?? [],
    currentRole: roles.currentRole,
    activeDisplayRole: roles.activeDisplayRole ?? roles.currentRole,
    highestShopRank: roles.highestShopRank ?? roles.shopProgressRoleKey,
    shopProgressRoleKey: roles.shopProgressRoleKey,
    highestVip: roles.highestVip ?? roles.websiteVipTier,
    nextPurchasableRoleKey: roles.nextPurchasableRoleKey,
    websiteVipTier: roles.websiteVipTier,
    nextVipClaimKey: roles.nextVipClaimKey,
    ownedRoles: roles.ownedRoles,
    ownedInventory: roles.ownedInventory ?? [],
    mythicBadgeCount: roles.mythicBadgeCount,
    goldBadgeCount: roles.goldBadgeCount,
    legendBadgeCount: roles.legendBadgeCount,
    profileBadgeCounts: roles.profileBadgeCounts,
    purchasableTierOrder: roles.purchasableTierOrder,
  }
}

function RolePerksSummary({ perks }: { perks: RoleWebsitePerks }) {
  const d = perks.shopDiscountPercent
  const cellClass =
    'rounded-md border border-white/[0.06] bg-slate-950/55 px-2.5 py-2 min-h-[4rem] sm:min-h-0 flex flex-col justify-center gap-0.5'
  const labelClass = 'text-[10px] uppercase tracking-wide text-slate-500 m-0'
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] sm:text-xs leading-snug text-slate-300">
      <div className={cellClass}>
        <p className={labelClass}>Shop</p>
        <p className="m-0">
          {d > 0 ? (
            <span className="text-emerald-300 font-semibold tabular-nums">-{d}%</span>
          ) : (
            <span className="text-slate-500">0%</span>
          )}
          <span className="text-slate-500 block sm:inline sm:ml-1 text-[10px] sm:text-[11px] mt-0.5 sm:mt-0">
            Items &amp; Pokemon
          </span>
        </p>
      </div>
      <div className={cellClass}>
        <p className={labelClass}>Daily reward</p>
        <p className="m-0">
          <span className="text-amber-200/95 font-medium tabular-nums">
            +{perks.dailyFlatCobble.toLocaleString()}
          </span>
          <span className="text-slate-500 block text-[10px] sm:text-[11px] mt-0.5">VIP AsterynPoints / day</span>
        </p>
      </div>
      <div className={cellClass}>
        <p className={labelClass}>Tickets</p>
        <p className="m-0">
          <span className="text-sky-200/95 font-medium tabular-nums">+{perks.dailyTickets}</span>
          <span className="text-slate-500 block text-[10px] sm:text-[11px] mt-0.5">Rank tickets / day</span>
        </p>
      </div>
      {(perks.dailyItems?.length ?? 0) > 0 ? (
        <div className={`${cellClass} sm:col-span-3`}>
          <p className={labelClass}>Daily items</p>
          <p className="m-0 text-slate-200">
            {perks.dailyItems!.map((it) => `${it.label} ×${it.amount}`).join(' · ')}
          </p>
        </div>
      ) : null}
    </div>
  )
}

export function Account() {
  type AccountTab = 'account' | 'daily' | 'shop' | 'ranks' | 'inventory' | 'cobble' | 'history'
  const { isAuthenticated, user, refreshUser } = useAuth()
  const canUseWebsiteShop = Boolean(user?.is_admin) || isAccountVerified(user)
  const [showAuth, setShowAuth] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [daily, setDaily] = useState<DailyLoginStatus | null>(null)
  const [dailyLoading, setDailyLoading] = useState(false)
  const [dailyLoadError, setDailyLoadError] = useState<string | null>(null)
  const [rewardsClaimBusy, setRewardsClaimBusy] = useState(false)
  const [rewardsClaimError, setRewardsClaimError] = useState<string | null>(null)
  const [rewardsClaimSuccess, setRewardsClaimSuccess] = useState<string | null>(null)
  const [dailyResetCountdown, setDailyResetCountdown] = useState('-')
  const [inventory, setInventory] = useState<{ item_key: string; quantity: number }[]>([])
  const [shopItems, setShopItems] = useState<ShopItem[]>([])
  const [battlePassShopItems, setBattlePassShopItems] = useState<BattlePassShopItem[]>([])
  const [shopDiscountPercent, setShopDiscountPercent] = useState(0)
  const [shopEventDiscountPercent, setShopEventDiscountPercent] = useState(0)
  const [shopBusyItem, setShopBusyItem] = useState<string | null>(null)
  const [shopError, setShopError] = useState<string | null>(null)
  const [shopSuccess, setShopSuccess] = useState<string | null>(null)
  const [battlePassShopError, setBattlePassShopError] = useState<string | null>(null)
  const [battlePassShopSuccess, setBattlePassShopSuccess] = useState<string | null>(null)
  const [cobbleBalance, setCobbleBalance] = useState(0)
  const [claimBusyItem, setClaimBusyItem] = useState<string | null>(null)
  const [claimError, setClaimError] = useState<string | null>(null)
  const [claimedToServerAt, setClaimedToServerAt] = useState<Record<string, string>>({})
  const [activeTab, setActiveTab] = useState<AccountTab>('daily')
  const [userPvpRank, setUserPvpRank] = useState<UserPvpRank | null>(null)
  const [vStatus, setVStatus] = useState<VerificationStatusResponse | null>(null)
  const [vLoading, setVLoading] = useState(false)
  const [vError, setVError] = useState<string | null>(null)
  const [vRequestNote, setVRequestNote] = useState('')
  const [vSubmitting, setVSubmitting] = useState(false)
  const [roleCat, setRoleCat] = useState<RoleCatState | null>(null)
  const [roleStatus, setRoleStatus] = useState<Awaited<ReturnType<typeof fetchRoleRequestStatus>> | null>(null)
  const [rankBusyKey, setRankBusyKey] = useState<string | null>(null)
  const [rankError, setRankError] = useState<string | null>(null)
  const [rankSuccess, setRankSuccess] = useState<string | null>(null)
  const [grantRolePick, setGrantRolePick] = useState('')
  const [grantMessage, setGrantMessage] = useState('')
  const [grantSubmitting, setGrantSubmitting] = useState(false)
  const refreshWebsiteCobbleBalance = useCallback(() => {
    fetchUserCurrencies().then(({ currencies }) => {
      setCobbleBalance(websitePointsBalance(currencies))
    })
  }, [])

  /** Must match `PVP_DAILY_REWARDS` in backend (`apps/Backend/src/index.ts`). */
  const PVP_DAILY_REWARD_BY_RANK: Record<number, number> = {
    1: 1,
  }
  const PVP_DAILY_TICKETS_BY_RANK: Record<number, number> = {
    1: 1,
  }

  const displayItemName = displayInventoryItemName

  useEffect(() => {
    if (!isAuthenticated) {
      setVStatus(null)
      return
    }
    let cancelled = false
    setVLoading(true)
    fetchVerificationStatus()
      .then((s) => {
        if (!cancelled) {
          setVError(null)
          setVStatus(s)
          if (s.verified) void refreshUser()
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setVStatus(null)
          setVError(err instanceof Error ? err.message : 'Could not load verification status.')
        }
      })
      .finally(() => {
        if (!cancelled) setVLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isAuthenticated, refreshUser])

  const pendingRequestId = vStatus?.pending?.id
  useEffect(() => {
    if (!isAuthenticated || pendingRequestId == null) return
    const t = window.setInterval(() => {
      void fetchVerificationStatus().then((s) => {
        setVStatus(s)
        if (s.verified) void refreshUser()
      })
    }, 16_000)
    return () => window.clearInterval(t)
  }, [isAuthenticated, pendingRequestId, refreshUser])

  useEffect(() => {
    if (!isAuthenticated) return
    setDailyLoading(true)
    setDailyLoadError(null)
    Promise.all([
      fetchDailyLoginStatus(),
      fetchUserInventory(),
      fetchShopItems(),
      fetchUserCurrencies(),
      fetchUserPvpRank(),
      fetchRoleCatalog().catch(() => null),
      fetchRoleRequestStatus().catch(() => null),
    ])
      .then(([d, inv, shop, currencies, pvpRank, roles, rStatus]) => {
        setDaily(d)
        setInventory(inv.inventory ?? [])
        setShopItems(shop.items ?? [])
        setBattlePassShopItems(shop.battlePassItems ?? [])
        setShopDiscountPercent(shop.shopDiscountPercent ?? 0)
        setShopEventDiscountPercent(shop.shopEventDiscountPercent ?? roles?.shopEventDiscountPercent ?? 0)
        setCobbleBalance(
          websitePointsBalance(currencies.currencies)
        )
        setUserPvpRank(pvpRank)
        if (roles) {
          setRoleCat(roleCatFromApi(roles))
        }
        if (rStatus) setRoleStatus(rStatus)
      })
      .catch((e) => setDailyLoadError(e instanceof Error ? e.message : 'Failed to load daily rewards'))
      .finally(() => setDailyLoading(false))
  }, [isAuthenticated])

  useEffect(() => {
    const update = () => {
      const tz = daily?.timeZone ?? 'Asia/Ho_Chi_Minh'
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).formatToParts(new Date())
      const hNow = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
      const mNow = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
      const sNow = Number(parts.find((p) => p.type === 'second')?.value ?? '0')
      const elapsed = hNow * 3600 + mNow * 60 + sNow
      const total = 24 * 3600 - elapsed
      const h = Math.floor(total / 3600)
      const min = Math.floor((total % 3600) / 60)
      const s = total % 60
      setDailyResetCountdown(`${h}h ${min}m ${s}s`)
    }

    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [daily?.timeZone])

  const pvpLeaderboardPreview = useMemo(() => {
    const isRanked = userPvpRank?.status === 'ranked' && userPvpRank.rank != null
    const rk = isRanked ? userPvpRank.rank : null
    const inTop1 = rk === 1
    const cobble = rk != null ? PVP_DAILY_REWARD_BY_RANK[rk] ?? 0 : 0
    const tickets = rk != null ? PVP_DAILY_TICKETS_BY_RANK[rk] ?? 0 : 0
    return { rk, inTop1, cobble, tickets, isRanked }
  }, [userPvpRank])

  const rewardsBreakdown = useMemo(() => {
    const empty = {
      claimedToday: false,
      canClaimDaily: false,
      rb: undefined as DailyLoginStatus['dailyRankBonus'],
      nr: undefined as DailyLoginStatus['streak']['nextReward'] | undefined,
      streakLadderCobble: 0,
      roleFlatCobble: 0,
      roleTickets: 0,
      nextClaimCobbleTotal: null as number | null,
      dailyBundleCobble: 0,
      dailyBundleTickets: 0,
      totalCobble: 0,
      totalTickets: 0,
      hasClaimable: false,
    }
    if (!daily) return empty

    const claimedToday = daily.claim?.status === 'success'
    const canClaimDaily = Boolean(daily.eligible && !claimedToday)
    const rb = daily.dailyRankBonus
    const nr = daily.streak?.nextReward
    const streakLadderCobble = (nr?.kind === 'asterynpoints' || nr?.kind === 'cobbledollars') ? nr.amount : 0
    const roleFlatCobble = rb?.flatCobbleBonusPerClaim ?? 0
    const roleTickets = rb?.ticketBonusPerClaim ?? 0
    const nextClaimCobbleTotal = rb?.nextClaimCobbleTotal ?? null

    const dailyBundleCobble = canClaimDaily ? (nextClaimCobbleTotal ?? 0) : 0
    const dailyBundleTickets = canClaimDaily ? roleTickets : 0

    return {
      claimedToday,
      canClaimDaily,
      rb,
      nr,
      streakLadderCobble,
      roleFlatCobble,
      roleTickets,
      nextClaimCobbleTotal,
      dailyBundleCobble,
      dailyBundleTickets,
      totalCobble: dailyBundleCobble,
      totalTickets: dailyBundleTickets,
      hasClaimable: canClaimDaily,
    }
  }, [daily])

  const handleVerificationSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setVError(null)
    setVSubmitting(true)
    try {
      await submitVerificationRequest(vRequestNote.trim() || undefined)
      setVRequestNote('')
      const s = await fetchVerificationStatus()
      setVStatus(s)
      if (s.verified) void refreshUser()
    } catch (err) {
      setVError(err instanceof Error ? err.message : 'Could not submit request.')
    } finally {
      setVSubmitting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match')
      return
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters')
      return
    }
    setSubmitting(true)
    try {
      await changePassword(currentPassword, newPassword)
      setSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change password')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isAuthenticated) {
    return (
      <PageShell max="2xl" className="py-4">
        <PageHeader
          accent="cyan"
          eyebrow="Your profile"
          title="Account"
          description="Sign in to manage your profile, wallet, and settings."
        />
        <div className="pixel-panel-soft p-8 text-center">
          <button
            type="button"
            onClick={() => setShowAuth(true)}
            className="py-2.5 px-6 pixel-btn-primary"
          >
            Log in
          </button>
        </div>
        {showAuth && <AuthModal onClose={() => setShowAuth(false)} defaultMode="login" />}
      </PageShell>
    )
  }

  const handleClaimDailyReward = async () => {
    const claimedToday = daily?.claim?.status === 'success'
    const canClaimDaily = Boolean(daily?.eligible && !claimedToday)
    if (!canClaimDaily) return

    setRewardsClaimError(null)
    setRewardsClaimSuccess(null)
    setRewardsClaimBusy(true)
    try {
      const r = await claimDailyLoginReward()
      const clanXpLine =
        r.clanXp && r.clanXp.granted > 0
          ? ` · +${r.clanXp.granted.toLocaleString()} Clan XP (now level ${r.clanXp.level})`
          : ''
      setRewardsClaimSuccess(`${r.message}${clanXpLine}`)
    } catch (e) {
      setRewardsClaimError(e instanceof Error ? e.message : 'Claim failed')
    } finally {
      try {
        const [d, inv, currencies, pvpRank] = await Promise.all([
          fetchDailyLoginStatus(),
          fetchUserInventory(),
          fetchUserCurrencies(),
          fetchUserPvpRank(),
        ])
        setDaily(d)
        setInventory(inv.inventory ?? [])
        setCobbleBalance(websitePointsBalance(currencies.currencies))
        setUserPvpRank(pvpRank)
      } catch {
        /* ignore refresh errors */
      }
      setRewardsClaimBusy(false)
    }
  }

  const handleBuyBattlePass = async (item: BattlePassShopItem) => {
    if (!canUseWebsiteShop) {
      setBattlePassShopError('Account verification required to buy from the shop.')
      return
    }
    if (item.owned) return
    setBattlePassShopError(null)
    setBattlePassShopSuccess(null)
    setShopBusyItem(item.itemKey)
    try {
      const res = await buyShopItem(item.itemKey, 1)
      setBattlePassShopSuccess(`Purchased ${item.label}. Access is active on the server.`)
      setCobbleBalance(res.newBalance)
      const shopUp = await fetchShopItems()
      setBattlePassShopItems(shopUp.battlePassItems ?? [])
    } catch (err) {
      setBattlePassShopError(err instanceof Error ? err.message : 'Purchase failed')
    } finally {
      setShopBusyItem(null)
    }
  }

  const handleBuyItem = async (item: ShopItem) => {
    if (!canUseWebsiteShop) {
      setShopError('Account verification required to buy from the shop.')
      return
    }
    setShopError(null)
    setShopSuccess(null)
    setShopBusyItem(item.itemKey)
    try {
      const res = await buyShopItem(item.itemKey, 1)
      setShopSuccess(`Purchased ${item.label} x${res.quantityPurchased}`)
      const [inv, currencies] = await Promise.all([fetchUserInventory(), fetchUserCurrencies()])
      setInventory(inv.inventory ?? [])
      setCobbleBalance(websitePointsBalance(currencies.currencies))
    } catch (err) {
      setShopError(err instanceof Error ? err.message : 'Purchase failed')
    } finally {
      setShopBusyItem(null)
    }
  }

  const handleClaimItem = async (itemKey: string) => {
    setClaimError(null)
    setClaimBusyItem(itemKey)
    try {
      await claimInventoryItem(itemKey, 1)
      setClaimedToServerAt((prev) => ({
        ...prev,
        [itemKey]: new Date().toISOString(),
      }))
      const inv = await fetchUserInventory()
      setInventory(inv.inventory ?? [])
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : 'Claim failed')
    } finally {
      setClaimBusyItem(null)
    }
  }

  const handleBuyRank = async (entry: RoleCatalogEntry) => {
    if (!canUseWebsiteShop) {
      setRankError('Account verification required to buy ranks.')
      return
    }
    if (!entry.canBuyNow) {
      setRankError('You must buy ranks one step at a time, starting from the next tier.')
      return
    }
    setRankError(null)
    setRankSuccess(null)
    setRankBusyKey(entry.key)
    try {
      const out = await buyRank(entry.key)
      setRankSuccess(
        entry.freeRank
          ? `Claimed ${entry.label} into your inventory. Open Inventory to choose in-game display.`
          : `Purchased ${entry.label} into your inventory. Open Inventory to choose in-game display.`
      )
      setCobbleBalance(out.newBalance)
      void refreshUser()
      const [shopUp, rs, rolesUp] = await Promise.all([
        fetchShopItems(),
        fetchRoleRequestStatus().catch(() => null),
        fetchRoleCatalog().catch(() => null),
      ])
      setShopItems(shopUp.items ?? [])
      setBattlePassShopItems(shopUp.battlePassItems ?? [])
      setShopDiscountPercent(shopUp.shopDiscountPercent ?? 0)
      setShopEventDiscountPercent(shopUp.shopEventDiscountPercent ?? 0)
      if (rs) setRoleStatus(rs)
      if (rolesUp) setRoleCat(roleCatFromApi(rolesUp))
    } catch (err) {
      setRankError(err instanceof Error ? err.message : 'Rank purchase failed')
    } finally {
      setRankBusyKey(null)
    }
  }

  const handleActivateRank = async (roleKey: string, label: string) => {
    setRankError(null)
    setRankSuccess(null)
    setRankBusyKey(`activate:${roleKey}`)
    try {
      const out = await activateOwnedRank(roleKey)
      // Optimistic UI so Displaying / Active updates immediately.
      setRoleCat((prev) => {
        if (!prev) return prev
        const k = roleKey.trim().toLowerCase()
        return {
          ...prev,
          currentRole: k,
          activeDisplayRole: k,
          ownedInventory: (prev.ownedInventory ?? []).map((row) => ({
            ...row,
            active: row.key === k,
          })),
          purchasable: prev.purchasable.map((e) => ({ ...e, active: e.key === k })),
          vip: prev.vip.map((e) => ({ ...e, active: e.key === k })),
          grantOnly: prev.grantOnly.map((e) => ({ ...e, active: e.key === k })),
        }
      })
      if (out.alreadyActive) {
        setRankSuccess(`${label} is already your active display.`)
      } else if (roleKey === 'player') {
        setRankSuccess(
          `Display set to PLAYER — in-game icon uses LuckPerms group "player" (pack glyph U+E00D).`
        )
      } else {
        setRankSuccess(
          `Switched display to ${label}${out.lpGroup ? ` (LuckPerms: ${out.lpGroup})` : ''}.`
        )
      }
      void refreshUser()
      const rolesUp = await fetchRoleCatalog().catch(() => null)
      if (rolesUp) setRoleCat(roleCatFromApi(rolesUp))
      const rs = await fetchRoleRequestStatus().catch(() => null)
      if (rs) setRoleStatus(rs)
    } catch (err) {
      setRankError(err instanceof Error ? err.message : 'Could not switch rank')
    } finally {
      setRankBusyKey(null)
    }
  }

  const handleClaimVip = async (entry: VipCatalogEntry) => {
    if (!canUseWebsiteShop) {
      setRankError('Account verification required to claim VIP.')
      return
    }
    if (!entry.canClaimNow) {
      if (entry.meetsBadgeRequirement === false && entry.badgeRequirementLabel) {
        setRankError(
          `${entry.badgeRequirementLabel} (you have ${roleCat?.mythicBadgeCount ?? 0} mythic, ${roleCat?.goldBadgeCount ?? 0} gold, ${roleCat?.legendBadgeCount ?? 0} legend).`
        )
      } else {
        setRankError('Claim VIP tiers one step at a time.')
      }
      return
    }
    setRankError(null)
    setRankSuccess(null)
    setRankBusyKey(`vip:${entry.key}`)
    try {
      await claimVipTier(entry.key)
      setRankSuccess(`Claimed VIP ${entry.label} into inventory. Open Inventory to display it in-game.`)
      void refreshUser()
      const [shopUp, rolesUp] = await Promise.all([
        fetchShopItems().catch(() => null),
        fetchRoleCatalog().catch(() => null),
      ])
      if (shopUp) {
        setShopDiscountPercent(shopUp.shopDiscountPercent ?? 0)
        setShopEventDiscountPercent(shopUp.shopEventDiscountPercent ?? 0)
      }
      if (rolesUp) setRoleCat(roleCatFromApi(rolesUp))
    } catch (err) {
      setRankError(err instanceof Error ? err.message : 'VIP claim failed')
    } finally {
      setRankBusyKey(null)
    }
  }

  const handleSubmitGrant = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!grantRolePick.trim()) return
    setGrantSubmitting(true)
    setRankError(null)
    setRankSuccess(null)
    try {
      await submitRoleGrantRequest(grantRolePick.trim(), grantMessage.trim() || undefined)
      setGrantMessage('')
      const rs = await fetchRoleRequestStatus()
      setRoleStatus(rs)
      setRankSuccess('Rank request sent. You will be notified when it is reviewed.')
    } catch (err) {
      setRankError(err instanceof Error ? err.message : 'Could not submit request')
    } finally {
      setGrantSubmitting(false)
    }
  }

  return (
    <PageShell max="3xl">
      <PageHeader
        accent="cyan"
        eyebrow="Your profile"
        title="Account"
        description={
          <>
            Signed in as{' '}
            <span className="inline-flex items-center gap-1.5 flex-wrap align-middle">
              <RoleBadge roleKey={user?.minecraft_role ?? 'member'} />
              <span className="text-[#e2e8f0]">{user?.username}</span>
              {user && isAccountVerified(user) ? <VerifiedAccountBadge className="w-5 h-5" /> : null}
            </span>
            {user?.email ? (
              <span className="block mt-1 truncate text-muted" title={user.email}>
                {user.email}
              </span>
            ) : null}
          </>
        }
      />

      <PageTabBar
        ariaLabel="Account sections"
        tabs={(
          [
            ['daily', 'Daily'],
            ['history', 'Rank history'],
            ['shop', 'Shop'],
            ['ranks', 'Ranks'],
            ['inventory', 'Inventory'],
            ['cobble', 'Wallet'],
            ['account', 'Account'],
          ] as const satisfies readonly [AccountTab, string][]
        ).map(([id, label]) => ({ id, label }))}
        active={activeTab}
        onChange={setActiveTab}
      />

      <PageSection className="space-y-6">
      {activeTab === 'cobble' && <CobbleWebsiteWallet onBalanceUpdated={refreshWebsiteCobbleBalance} />}

      {activeTab === 'history' &&
        (isAuthenticated && user?.username?.trim() ? (
          <>
            <h2 className="text-lg font-medium text-[#e2e8f0] m-0 mb-3">Rank history</h2>
            <AccountRankHistory viewerIgn={user.username.trim()} />
          </>
        ) : (
          <p className="text-sm text-muted m-0">Sign in to see your ranked match results and battle replays.</p>
        ))}

      {activeTab === 'daily' && (
        <>
          <div className="mb-5 rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-950/35 via-[#0a1020]/90 to-[#0f0a1a]/95 p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] uppercase tracking-widest text-amber-300/90 font-semibold m-0">
                PVP leaderboard
              </p>
              <span className="text-[11px] text-muted">Auto at 00:00 — separate from daily claim</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <DailyRewardStatCard
                accent="amber"
                label="Your rank"
                value={
                  pvpLeaderboardPreview.isRanked && userPvpRank?.rank != null ? (
                    <span className="inline-flex flex-wrap items-center justify-center gap-1.5">
                      #{userPvpRank.rank}
                      {userPvpRank.tier ? (
                        <PvPTierBadge
                          slug={normalizePvpTierSlugForAssets(userPvpRank.tier)}
                          displayName={pvpTierHumanName(userPvpRank.tier)}
                          imgHeightClass="h-5"
                        />
                      ) : null}
                    </span>
                  ) : (
                    'Unranked'
                  )
                }
                sub="Top 1 only"
              />
              <DailyRewardStatCard
                accent="amber"
                label="AsterynPoints reward"
                value={
                  pvpLeaderboardPreview.inTop1 ? (
                    <span className="text-[#fbbf24]">{pvpLeaderboardPreview.cobble.toLocaleString()}</span>
                  ) : (
                    '—'
                  )
                }
                sub={pvpLeaderboardPreview.inTop1 ? 'If still #1 at reset' : 'Not #1'}
              />
              <DailyRewardStatCard
                accent="sky"
                label="Tickets"
                value={pvpLeaderboardPreview.inTop1 && pvpLeaderboardPreview.tickets > 0 ? `+${pvpLeaderboardPreview.tickets}` : '—'}
                sub="Normal tickets"
              />
            </div>
          </div>

          <h2 className="text-lg font-medium text-[#e2e8f0] m-0 mb-3">Daily login &amp; role</h2>
          {dailyLoading ? (
            <p className="text-sm text-muted mb-6">Loading rewards…</p>
          ) : dailyLoadError ? (
            <p className="text-sm text-error mb-6">{dailyLoadError}</p>
          ) : !daily ? (
            <p className="text-sm text-muted mb-6">No reward data.</p>
          ) : (
            <div className="mb-6 rounded-xl border border-violet-500/30 bg-gradient-to-br from-violet-950/35 via-[#120a22]/85 to-[#0f0a1a]/95 p-4 sm:p-5 space-y-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-violet-300/90 font-semibold m-0 mb-1">
                    Today&apos;s bundle
                  </p>
                  <p className="text-sm text-[#e2e8f0] m-0">
                    Streak check-in — VIP Point + rank tickets, one claim per day after you join in-game
                  </p>
                </div>
                <p className="text-xs text-muted m-0 shrink-0 tabular-nums">
                  {daily.date} · reset {dailyResetCountdown}
                </p>
              </div>

              {rewardsBreakdown.claimedToday ? (
                <PageNotice variant="success">
                  Claimed today — Day {daily.claim?.streakDay ?? '?'} · {daily.claim?.selectedReward ?? 'Reward'}
                </PageNotice>
              ) : daily.eligible ? (
                <PageNotice variant="success">Eligible — join verified for today. Tap claim below.</PageNotice>
              ) : (
                <PageNotice variant="warn">Join the server after reset to unlock today&apos;s bundle.</PageNotice>
              )}

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <DailyRewardStatCard
                  accent="violet"
                  label="Streak"
                  value={`Day ${daily.streak.nextDay}`}
                  sub={rewardsBreakdown.streakLadderCobble > 0 ? `+${rewardsBreakdown.streakLadderCobble.toLocaleString()} AP` : 'Check-in'}
                />
                <DailyRewardStatCard
                  accent="amber"
                  label="VIP AsterynPoints"
                  value={
                    rewardsBreakdown.roleFlatCobble > 0 ? (
                      <span className="text-[#fbbf24]">+{rewardsBreakdown.roleFlatCobble.toLocaleString()}</span>
                    ) : (
                      '—'
                    )
                  }
                  sub={
                    rewardsBreakdown.rb ? (
                      <span className="inline-flex items-center justify-center gap-1.5 flex-wrap">
                        <RoleBadge roleKey={rewardsBreakdown.rb.vipTier ?? 'player'} />
                      </span>
                    ) : (
                      'No VIP bonus'
                    )
                  }
                />
                <DailyRewardStatCard
                  accent="sky"
                  label="Rank tickets"
                  value={rewardsBreakdown.roleTickets > 0 ? `+${rewardsBreakdown.roleTickets}` : '—'}
                  sub={
                    rewardsBreakdown.rb ? (
                      <span className="inline-flex items-center justify-center gap-1.5 flex-wrap">
                        <RoleBadge roleKey={rewardsBreakdown.rb.minecraftRole} />
                      </span>
                    ) : (
                      'Normal tickets'
                    )
                  }
                />
                <DailyRewardStatCard
                  accent="emerald"
                  label="Claim total"
                  value={
                    <span className="text-[#fbbf24]">{rewardsBreakdown.totalCobble.toLocaleString()}</span>
                  }
                  sub={`${rewardsBreakdown.totalTickets} ticket${rewardsBreakdown.totalTickets === 1 ? '' : 's'}`}
                  valueClassName=""
                />
              </div>
              {(rewardsBreakdown.rb?.items?.length ?? 0) > 0 ? (
                <p className="text-sm text-slate-300 m-0">
                  <span className="text-[10px] uppercase tracking-wide text-slate-500 mr-2">Daily items</span>
                  {rewardsBreakdown.rb!.items!.map((it) => `${it.label} ×${it.amount}`).join(' · ')}
                  <span className="text-slate-500 text-xs block mt-1">Goes to Inventory — claim in-game while online</span>
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
                <span>
                  Lifetime claims:{' '}
                  <strong className="text-slate-300 tabular-nums">{(daily.totalClaimDays ?? 0).toLocaleString()}</strong>
                </span>
                <span>Reset 00:00 ({daily.timeZone})</span>
              </div>

              <div className="pt-1 flex flex-col sm:flex-row sm:items-center gap-3">
                <button
                  type="button"
                  onClick={() => void handleClaimDailyReward()}
                  disabled={rewardsClaimBusy || !rewardsBreakdown.hasClaimable}
                  className="py-2.5 px-6 pixel-btn-primary disabled:opacity-50 w-full sm:w-auto text-base font-semibold"
                >
                  {rewardsClaimBusy ? 'Claiming…' : 'Claim daily reward'}
                </button>
                {!rewardsBreakdown.hasClaimable && !rewardsBreakdown.claimedToday ? (
                  <span className="text-xs text-muted">Claim unlocks after an in-game login today.</span>
                ) : null}
              </div>

              {rewardsClaimSuccess ? (
                <p className="text-sm text-emerald-300 m-0">{rewardsClaimSuccess}</p>
              ) : null}
              {rewardsClaimError ? <p className="text-sm text-error m-0">{rewardsClaimError}</p> : null}
            </div>
          )}
        </>
      )}

      {activeTab === 'inventory' && (
        <>
          <h2 className="text-lg font-medium text-[#e2e8f0] m-0 mb-2">Ranks &amp; VIPs</h2>
          <p className="text-xs text-muted m-0 mb-3">
            Everything you own (bought, claimed, or granted). Choose which one to display in-game. Defaults: MEMBER and
            PLAYER (both have pack icons when LuckPerms groups + prefixes are set).
          </p>
          <div className="mb-6 pixel-well p-4 space-y-2">
            {(roleCat?.ownedInventory?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted m-0">
                No ranks or VIPs owned yet. Buy ranks, claim VIP, or wait for a staff grant.
              </p>
            ) : (
              (roleCat?.ownedInventory ?? []).map((row) => {
                const label =
                  row.key === 'member'
                    ? 'MEMBER'
                    : row.key === 'player'
                      ? 'PLAYER'
                      : roleCat?.purchasable.find((e) => e.key === row.key)?.label ??
                        roleCat?.vip.find((e) => e.key === row.key)?.label ??
                        roleCat?.grantOnly.find((e) => e.key === row.key)?.label ??
                        row.key.toUpperCase()
                const kindLabel =
                  row.key === 'member'
                    ? 'Default rank'
                    : row.key === 'player'
                      ? 'Default VIP'
                      : row.kind === 'shop'
                        ? 'Rank'
                        : row.kind === 'vip'
                          ? 'VIP'
                          : row.kind === 'grant'
                            ? 'Granted'
                            : 'Other'
                return (
                  <div
                    key={row.key}
                    className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${
                      row.active
                        ? 'border-emerald-500/45 bg-emerald-950/25'
                        : 'border-border/70 bg-[#0a0f18]/40'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <RoleBadge roleKey={row.key} />
                      <div className="min-w-0">
                        <p className="m-0 text-sm font-semibold text-[#e2e8f0]">{label}</p>
                        <p className="m-0 text-[10px] uppercase tracking-wide text-muted">{kindLabel}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleActivateRank(row.key, label)}
                      disabled={row.active || rankBusyKey === `activate:${row.key}`}
                      className="shrink-0 px-3 py-2 text-sm pixel-btn-primary disabled:opacity-50"
                    >
                      {row.active
                        ? 'Displaying'
                        : rankBusyKey === `activate:${row.key}`
                          ? 'Switching…'
                          : 'Display in-game'}
                    </button>
                  </div>
                )
              })
            )}
            {rankSuccess && activeTab === 'inventory' ? (
              <p className="text-sm text-emerald-300 m-0 pt-1">{rankSuccess}</p>
            ) : null}
            {rankError && activeTab === 'inventory' ? (
              <p className="text-sm text-error m-0 pt-1">{rankError}</p>
            ) : null}
          </div>

          <h2 className="text-lg font-medium text-[#e2e8f0] m-0 mb-3">Website inventory</h2>
          <div className="mb-6 pixel-well p-4">
            {inventory.length === 0 ? (
              <p className="text-sm text-muted m-0">No items in inventory yet.</p>
            ) : (
              <ul className="m-0 p-0 list-none space-y-2">
                {inventory.map((it) => (
                  <li key={it.item_key} className="text-sm text-[#e2e8f0] flex items-center justify-between gap-3">
                    <span>
                      {displayItemName(it.item_key)}: <span className="tabular-nums">{it.quantity}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleClaimItem(it.item_key)}
                      disabled={it.quantity < 1 || claimBusyItem === it.item_key}
                      className="shrink-0 py-2 px-3 pixel-btn-primary disabled:opacity-50 text-base"
                    >
                      {claimBusyItem === it.item_key ? 'Claiming...' : 'Claim'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
        {inventory.length > 0 && (
          <div className="mt-2 space-y-1">
            {inventory.map((it) => {
              const claimedAt = claimedToServerAt[it.item_key]
              if (!claimedAt) return null
              return (
                <p key={`claimed-${it.item_key}`} className="text-xs text-emerald-300 m-0">
                  {displayItemName(it.item_key)} delivered in-game at{' '}
                  {new Date(claimedAt).toLocaleTimeString()}.
                </p>
              )
            })}
          </div>
        )}
            {claimError && <p className="text-sm text-error mt-3 mb-0">{claimError}</p>}
          </div>
        </>
      )}

      {activeTab === 'shop' && (
        <>
          <p className="text-sm text-muted m-0 mb-3">
            AsterynPoints balance:{' '}
            <span className="text-[#fbbf24] font-semibold tabular-nums">{cobbleBalance.toLocaleString()}</span>
          </p>
          {!canUseWebsiteShop ? (
            <div
              className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
              role="status"
            >
              <p className="m-0 font-medium">Shop available after account verification</p>
              <p className="m-0 mt-1 text-xs text-amber-100/90">
                If not verified, you cannot buy on the website (Shop, Battle pass). Submit a verification request in the
                Account tab.
              </p>
            </div>
          ) : null}

          <h2 className="text-lg font-medium text-[#e2e8f0] m-0 mb-3">Shop</h2>
          {shopEventDiscountPercent > 0 ? (
            <p className="text-sm text-amber-200/95 m-0 mb-3 rounded-lg border border-amber-500/35 bg-amber-950/25 px-3 py-2">
              Special event: <strong>-{shopEventDiscountPercent}%</strong> on item shop, battle pass, and
              rank purchases
              {shopDiscountPercent > 0 ? ` (stacks with your -${shopDiscountPercent}% rank discount)` : ''}.
            </p>
          ) : null}
          {shopDiscountPercent > 0 ? (
            <p className="text-sm text-emerald-300/95 m-0 mb-3">
              Rank discount: -{shopDiscountPercent}% on AsterynPoints (item shop and battle pass).
            </p>
          ) : null}
          <div className="mb-6 pixel-well p-4">
            <div className="space-y-2">
              {shopItems.map((item) => (
                <div key={item.itemKey} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm text-[#e2e8f0] m-0">{item.label}</p>
                    <p className="text-xs text-muted m-0">
                      {item.discountedCost < item.cost ? (
                        <>
                          <span className="line-through opacity-70">{item.cost.toLocaleString()}</span>{' '}
                          <span className="text-[#fbbf24] tabular-nums">{item.discountedCost.toLocaleString()} AsterynPoints</span>
                        </>
                      ) : (
                        <>Cost: {item.cost.toLocaleString()} AsterynPoints</>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleBuyItem(item)}
                    disabled={
                      !canUseWebsiteShop || shopBusyItem === item.itemKey || cobbleBalance < item.discountedCost
                    }
                    className="shrink-0 py-2 px-3 pixel-btn-primary disabled:opacity-50 text-base"
                  >
                    {shopBusyItem === item.itemKey ? 'Buying...' : 'Buy'}
                  </button>
                </div>
              ))}
            </div>
            {shopSuccess && <p className="text-sm text-emerald-300 mt-3 mb-0">{shopSuccess}</p>}
            {shopError && <p className="text-sm text-error mt-3 mb-0">{shopError}</p>}
          </div>

          <h2 className="text-lg font-medium text-[#e2e8f0] m-0 mb-3">Battle pass</h2>
          <div className="mb-6 pixel-well p-4">
            <p className="text-sm text-muted m-0 mb-3">
              One-time purchase per account. Permissions apply on the Minecraft server using your website username as
              your in-game name. Staff can see and revoke active grants in the admin panel.
            </p>
            <div className="space-y-2">
              {battlePassShopItems.map((item) => (
                <div
                  key={item.itemKey}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-[#e2e8f0] m-0">{item.label}</p>
                    <p className="text-xs text-muted m-0">
                      {item.owned ? (
                        <span className="text-emerald-300/95">Already active on your account</span>
                      ) : item.discountedCost < item.cost ? (
                        <>
                          <span className="line-through opacity-70">{item.cost.toLocaleString()}</span>{' '}
                          <span className="text-[#fbbf24] tabular-nums">{item.discountedCost.toLocaleString()} AsterynPoints</span>
                        </>
                      ) : (
                        <>Cost: {item.cost.toLocaleString()} AsterynPoints</>
                      )}
                    </p>
                  </div>
                  {item.owned ? (
                    <span className="shrink-0 text-xs font-semibold text-emerald-300/90 px-2 py-1 rounded border border-emerald-500/35 bg-emerald-950/30">
                      Owned
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleBuyBattlePass(item)}
                      disabled={
                        !canUseWebsiteShop || shopBusyItem === item.itemKey || cobbleBalance < item.discountedCost
                      }
                      className="shrink-0 py-2 px-3 pixel-btn-primary disabled:opacity-50 text-base"
                    >
                      {shopBusyItem === item.itemKey ? 'Buying...' : 'Buy'}
                    </button>
                  )}
                </div>
              ))}
            </div>
            {battlePassShopSuccess && (
              <p className="text-sm text-emerald-300 mt-3 mb-0">{battlePassShopSuccess}</p>
            )}
            {battlePassShopError && <p className="text-sm text-error mt-3 mb-0">{battlePassShopError}</p>}
          </div>
        </>
      )}

      {activeTab === 'ranks' && (
        <>
          <p className="text-sm text-muted m-0 mb-2">
            AsterynPoints balance:{' '}
            <span className="text-[#fbbf24] font-semibold tabular-nums">{cobbleBalance.toLocaleString()}</span>
          </p>
          <p className="text-sm text-muted m-0 mb-3">
            Active in-game display:{' '}
            <span className="inline-flex align-middle mr-1">
              <RoleBadge roleKey={roleCat?.activeDisplayRole ?? roleStatus?.currentRole ?? user?.minecraft_role ?? 'member'} />
            </span>
            <span className="text-[#e2e8f0] font-medium">
              {(
                roleCat?.activeDisplayRole ??
                roleStatus?.currentRole ??
                user?.minecraft_role ??
                'member'
              ).toUpperCase()}
            </span>
            <span className="text-muted"> · switch in Inventory</span>
          </p>
          {roleCat ? (
            <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-sky-500/30 bg-sky-950/25 px-3 py-2.5">
                <p className="m-0 mb-1 text-[10px] font-semibold uppercase tracking-wide text-sky-300/90">
                  Your current highest rank
                </p>
                <div className="flex items-center gap-2">
                  <RoleBadge roleKey={roleCat.highestShopRank ?? 'member'} />
                  <span className="text-sm font-semibold text-[#e2e8f0]">
                    {(roleCat.highestShopRank ?? 'member').toUpperCase()}
                  </span>
                </div>
              </div>
              <div className="rounded-lg border border-violet-500/30 bg-violet-950/25 px-3 py-2.5">
                <p className="m-0 mb-1 text-[10px] font-semibold uppercase tracking-wide text-violet-300/90">
                  Your current highest VIP
                </p>
                <div className="flex items-center gap-2">
                  <RoleBadge roleKey={roleCat.highestVip ?? 'player'} />
                  <span className="text-sm font-semibold text-[#e2e8f0]">
                    {(roleCat.highestVip ?? 'player').toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
          ) : null}
          {!canUseWebsiteShop ? (
            <div
              className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
              role="status"
            >
              <p className="m-0 font-medium">Buying ranks requires a verified account</p>
              <p className="m-0 mt-1 text-xs text-amber-100/85">
                Verified accounts can purchase eligible ranks here. Premium ranks are available by request only.
              </p>
            </div>
          ) : null}

          <h2 className="text-lg font-medium text-[#e2e8f0] m-0 mb-3">Buy rank (AsterynPoints)</h2>
          {shopEventDiscountPercent > 0 ? (
            <p className="text-sm text-amber-200/95 m-0 mb-3">
              Rank shop event: -{shopEventDiscountPercent}% on all purchasable ranks.
            </p>
          ) : null}
          <p className="text-xs text-muted m-0 mb-3">
            Below are perks for your active display. Buy/claim adds to Inventory — switch display under Inventory.
          </p>
          {roleCat ? (
            <div className="mb-4 rounded-lg border border-emerald-600/40 bg-emerald-950/25 px-3 py-2">
              <p className="text-[11px] font-medium text-emerald-200/95 m-0 mb-1">
                Your perks -{' '}
                <span className="text-[#e2e8f0]">
                  {(roleStatus?.currentRole ?? user?.minecraft_role ?? 'member').toUpperCase()}
                </span>
              </p>
              <RolePerksSummary
                perks={perksForMinecraftRole(
                  roleCat,
                  roleStatus?.currentRole ?? user?.minecraft_role ?? 'member'
                )}
              />
            </div>
          ) : null}
          {roleCat ? (
            <div className="mb-4 overflow-hidden rounded-xl border border-sky-500/30 bg-gradient-to-br from-sky-950/40 via-[#0a0f18]/90 to-[#0a0f18]">
              <div className="border-b border-sky-500/20 bg-sky-950/30 px-4 py-2">
                <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-300/90">
                  Rank progression
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2.5 p-3 sm:grid-cols-3 sm:gap-3">
                <div className="rounded-lg border border-white/[0.07] bg-black/25 px-3 py-2.5">
                  <p className="m-0 mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                    How it works
                  </p>
                  <p className="m-0 text-xs leading-relaxed text-slate-300">
                    Buy ranks with AsterynPoints one step at a time. Purchases go to Inventory — pick display there. VIP
                    is claimed with profile badges.
                  </p>
                </div>
                <div className="rounded-lg border border-white/[0.07] bg-black/25 px-3 py-2.5">
                  <p className="m-0 mb-2 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                    Your profile badges (for VIP)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-violet-500/40 bg-violet-950/45 px-2.5 py-1 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                      <span className="font-bold tabular-nums text-violet-100">{roleCat.mythicBadgeCount ?? 0}</span>
                      <span className="text-violet-200/80">mythic</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-950/45 px-2.5 py-1 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                      <span className="font-bold tabular-nums text-amber-100">{roleCat.goldBadgeCount ?? 0}</span>
                      <span className="text-amber-200/80">gold</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-orange-500/40 bg-orange-950/45 px-2.5 py-1 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                      <span className="font-bold tabular-nums text-orange-100">{roleCat.legendBadgeCount ?? 0}</span>
                      <span className="text-orange-200/80">legend</span>
                    </span>
                  </div>
                  <p className="m-0 mt-2 text-[10px] text-slate-500">
                    VIP: {(roleCat.websiteVipTier ?? 'player').toUpperCase()}
                    {roleCat.nextVipClaimKey ? ` · next ${roleCat.nextVipClaimKey.toUpperCase()}` : ' · max'}
                  </p>
                </div>
                <div className="rounded-lg border border-amber-500/35 bg-amber-950/30 px-3 py-2.5">
                  <p className="m-0 mb-2 text-[10px] font-medium uppercase tracking-wide text-amber-200/75">
                    Next for you
                  </p>
                  {roleCat.nextPurchasableRoleKey ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <RoleBadge roleKey={roleCat.nextPurchasableRoleKey} compact />
                      <span className="text-sm font-semibold tracking-wide text-[#fbbf24]">
                        {roleCat.purchasable.find((e) => e.key === roleCat.nextPurchasableRoleKey)?.label ??
                          roleCat.nextPurchasableRoleKey.toUpperCase()}
                      </span>
                    </div>
                  ) : (
                    <p className="m-0 text-xs leading-relaxed text-slate-400">
                      {roleCat.currentRole && roleCat.currentRole !== 'member'
                        ? 'You already have the highest shop rank (or a staff rank).'
                        : 'No further shop upgrades available.'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : null}
          <p className="text-xs text-muted m-0 mb-3">After payment, the rank is added to Inventory (not auto-equipped).</p>
          <div className="mb-6 pixel-well p-4 space-y-3">
            {roleCat?.purchasable?.length ? (
              roleCat.purchasable.map((entry) => (
                <div
                  key={entry.key}
                  className="flex flex-col gap-3 rounded-lg border border-border/70 bg-[#0a0f18]/40 px-3 py-3 sm:px-4 sm:py-3"
                >
                  <div className="flex flex-row items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div className="shrink-0">
                        <RoleBadge roleKey={entry.key} />
                      </div>
                      <div className="min-w-0">
                        <p className="m-0 text-sm font-semibold text-[#e2e8f0]">{entry.label}</p>
                        <p className="m-0 mt-1 text-sm font-medium tabular-nums text-[#fbbf24]">
                          {entry.freeRank ? (
                            <span className="text-emerald-300">Free</span>
                          ) : entry.listCost != null && entry.cost != null && entry.cost < entry.listCost ? (
                            <>
                              <span className="line-through opacity-70 text-muted mr-1.5">
                                {entry.listCost.toLocaleString()}
                              </span>
                              {entry.cost.toLocaleString()} AsterynPoints
                            </>
                          ) : (
                            <>{(entry.cost ?? 0).toLocaleString()} AsterynPoints</>
                          )}
                        </p>
                        {entry.badgeRequirementLabel ? (
                          <p className="m-0 mt-1 text-xs text-rose-200/90">
                            {entry.badgeRequirementLabel}
                            {entry.meetsBadgeRequirement === false ? (
                              <span className="text-muted"> — not met yet</span>
                            ) : entry.meetsBadgeRequirement ? (
                              <span className="text-emerald-300/90"> — OK</span>
                            ) : null}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-stretch gap-2 self-start">
                      {entry.owned ? (
                        <span className="px-4 py-2 text-sm font-semibold text-emerald-300/95 border border-emerald-500/35 rounded-lg bg-emerald-950/20 text-center">
                          Owned
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleBuyRank(entry)}
                          disabled={
                            !canUseWebsiteShop ||
                            rankBusyKey === entry.key ||
                            !entry.canBuyNow ||
                            (!entry.freeRank && cobbleBalance < (entry.cost ?? 0))
                          }
                          className="px-4 py-2 text-base pixel-btn-primary disabled:opacity-50"
                        >
                          {entry.locked
                            ? 'Locked'
                            : rankBusyKey === entry.key
                              ? entry.freeRank
                                ? 'Claiming…'
                                : 'Buying...'
                              : entry.freeRank
                                ? 'Claim'
                                : 'Buy'}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="w-full border-t border-border/45 pt-3">
                    <RolePerksSummary perks={entry.perks} />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted m-0">Unable to load rank catalog. Please try again later.</p>
            )}
          </div>

          <h2 className="text-lg font-medium text-[#e2e8f0] m-0 mb-2">VIP (profile badges)</h2>
          <p className="text-xs text-muted m-0 mb-3">
            Claim VIP tiers with achievements — no AsterynPoints. After claiming, choose display in Inventory.
            Daily Point follows VIP. Daily tickets follow shop rank. Daily items stack from shop rank and VIP.
          </p>
          <div className="mb-6 pixel-well p-4 space-y-3">
            {roleCat?.vip?.length ? (
              roleCat.vip.map((entry) => (
                <div
                  key={entry.key}
                  className="flex flex-col gap-3 rounded-lg border border-violet-500/25 bg-[#0a0f18]/40 px-3 py-3 sm:px-4 sm:py-3"
                >
                  <div className="flex flex-row items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div className="shrink-0">
                        <RoleBadge roleKey={entry.key} />
                      </div>
                      <div className="min-w-0">
                        <p className="m-0 text-sm font-semibold text-[#e2e8f0]">{entry.label}</p>
                        <p className="m-0 mt-0.5 text-[10px] uppercase tracking-wide text-violet-200/75">VIP track</p>
                        {entry.badgeRequirementLabel ? (
                          <p className="m-0 mt-1 text-xs text-rose-200/90">
                            {entry.badgeRequirementLabel}
                            {entry.meetsBadgeRequirement === false ? (
                              <span className="text-muted"> — not met yet</span>
                            ) : (
                              <span className="text-emerald-300/90"> — OK</span>
                            )}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2">
                      {entry.owned ? (
                        <span className="px-4 py-2 text-sm font-semibold text-emerald-300/95 border border-emerald-500/35 rounded-lg bg-emerald-950/20 text-center">
                          Owned
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleClaimVip(entry)}
                          disabled={
                            !canUseWebsiteShop ||
                            rankBusyKey === `vip:${entry.key}` ||
                            !entry.canClaimNow ||
                            entry.meetsBadgeRequirement === false
                          }
                          className="px-4 py-2 text-base pixel-btn-primary disabled:opacity-50"
                        >
                          {entry.locked || entry.meetsBadgeRequirement === false
                            ? 'Locked'
                            : rankBusyKey === `vip:${entry.key}`
                              ? 'Claiming…'
                              : 'Claim'}
                        </button>
                      )}
                    </div>
                  </div>
                  {entry.perks ? (
                    <div className="border-t border-violet-500/20 pt-3">
                      <RolePerksSummary perks={entry.perks} />
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-muted m-0">VIP catalog unavailable. Run users_owned_roles_and_vip.sql if needed.</p>
            )}
          </div>

          <h2 className="text-lg font-medium text-[#e2e8f0] m-0 mb-2">Rank requests</h2>
          <p className="text-xs text-muted m-0 mb-3">
            Premium and partner ranks are request-only. After staff accept, the rank goes into your Inventory — you choose
            what to display in-game.
          </p>
          <div className="mb-4 space-y-3">
            {(roleCat?.grantOnly ?? []).map((g) => {
              const isSelected = grantRolePick === g.key
              return (
              <div
                key={g.key}
                className={`w-full flex flex-col gap-3 rounded-xl border px-3 py-3 sm:px-4 transition-[border-color,background,box-shadow] duration-150 ${
                  g.owned
                    ? 'border-emerald-500/40 bg-emerald-950/15'
                    : isSelected
                      ? 'border-emerald-500/55 bg-emerald-950/20 ring-2 ring-emerald-500/25'
                      : 'border-border/70 bg-[#0a0f18]/40'
                }`}
              >
                <div className="flex flex-row items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setGrantRolePick(g.key)}
                    disabled={Boolean(g.owned)}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left bg-transparent border-0 p-0 cursor-pointer disabled:cursor-default"
                  >
                    <div className="shrink-0">
                      <RoleBadge roleKey={g.key} />
                    </div>
                    <div className="min-w-0">
                      <p className="m-0 text-sm font-semibold text-[#e2e8f0]">{g.label}</p>
                      <p className="m-0 mt-0.5 text-[10px] uppercase tracking-wide text-amber-200/75">
                        {g.owned ? 'Owned · set display in Inventory' : 'By request'}
                      </p>
                    </div>
                  </button>
                  {g.owned ? (
                    <span className="shrink-0 self-start px-3 py-1.5 text-xs font-semibold rounded-full border border-emerald-400/60 bg-emerald-500/15 text-emerald-200">
                      Owned
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setGrantRolePick(g.key)}
                      className={`shrink-0 self-start px-3 py-1.5 text-xs font-semibold rounded-full border ${
                        isSelected
                          ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-200'
                          : 'border-border/80 bg-[#0f172a]/80 text-muted'
                      }`}
                    >
                      {isSelected ? 'Selected' : 'Select'}
                    </button>
                  )}
                </div>
                <div className="w-full border-t border-border/45 pt-3">
                  <RolePerksSummary perks={g.perks} />
                </div>
              </div>
              )
            })}
          </div>
          <div className="mb-6 rounded-xl border border-emerald-500/20 bg-gradient-to-b from-emerald-950/15 via-[#0a0f18]/50 to-[#0a0f18]/80 p-5 sm:p-6 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-[#e2e8f0] m-0">Submit your request</h3>
              <p className="text-xs text-muted m-0 mt-1 leading-relaxed">
                One pending request at a time. Include links or context so staff can review faster.
              </p>
            </div>
            {roleStatus?.pending ? (
              <div
                className="rounded-lg border border-amber-500/35 bg-amber-950/25 px-4 py-3"
                role="status"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-200/90 m-0 mb-1">
                  Pending approval
                </p>
                <p className="text-sm text-[#e2e8f0] m-0">
                  <strong className="text-amber-100">{roleStatus.pending.requested_role}</strong>
                  <span className="text-muted"> · sent {new Date(roleStatus.pending.created_at).toLocaleString()}</span>
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitGrant} className="space-y-4">
                <div className="rounded-lg border border-white/[0.07] bg-slate-950/45 px-4 py-3 space-y-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted m-0">Selected rank</p>
                  {grantRolePick ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <RoleBadge roleKey={grantRolePick} />
                      <span className="text-sm font-semibold text-[#e2e8f0]">
                        {(roleCat?.grantOnly ?? []).find((g) => g.key === grantRolePick)?.label ?? grantRolePick}
                      </span>
                    </div>
                  ) : (
                    <p className="text-sm text-amber-200/85 m-0">Choose a rank from the list above first.</p>
                  )}
                  <CustomSelect
                    id="grant-role-pick"
                    value={grantRolePick}
                    onChange={(v) => setGrantRolePick(v)}
                    placeholder="Pick a rank…"
                    options={(roleCat?.grantOnly ?? []).map((g) => ({
                      value: g.key,
                      label: g.label,
                    }))}
                  />
                </div>
                <div>
                  <label htmlFor="grant-req-msg" className="block text-[10px] font-semibold uppercase tracking-wide text-muted mb-1.5">
                    Message <span className="normal-case font-normal text-muted/80">(optional)</span>
                  </label>
                  <textarea
                    id="grant-req-msg"
                    value={grantMessage}
                    onChange={(e) => setGrantMessage(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    className="w-full px-3 py-2.5 rounded-lg bg-[#08080f] border border-border/80 text-[#e2e8f0] text-sm leading-relaxed placeholder:text-muted/70 focus:outline-none focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15 resize-y min-h-[5rem]"
                    placeholder="e.g. TikTok / YouTube link, follower count, why you need this rank…"
                  />
                </div>
                <button
                  type="submit"
                  disabled={grantSubmitting || !grantRolePick || Boolean(roleStatus?.pending)}
                  className="w-full sm:w-auto min-w-[10rem] py-2.5 px-5 pixel-btn-primary disabled:opacity-50 text-base font-semibold"
                >
                  {grantSubmitting ? 'Sending…' : 'Submit request'}
                </button>
              </form>
            )}
            {roleStatus?.lastResolved ? (
              <div className="rounded-lg border border-border/60 bg-[#0f172a]/40 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted m-0 mb-1">Latest request</p>
                <p className="text-xs text-[#e2e8f0]/90 m-0 leading-relaxed">
                  <span
                    className={
                      roleStatus.lastResolved.status === 'approved'
                        ? 'text-emerald-300 font-semibold'
                        : roleStatus.lastResolved.status === 'rejected'
                          ? 'text-red-300 font-semibold'
                          : 'text-muted font-semibold'
                    }
                  >
                    {roleStatus.lastResolved.status}
                  </span>
                  {' · '}
                  {roleStatus.lastResolved.requested_role}
                  {roleStatus.lastResolved.resolved_at
                    ? ` · ${new Date(roleStatus.lastResolved.resolved_at).toLocaleString()}`
                    : ''}
                  {roleStatus.lastResolved.admin_note ? (
                    <span className="block mt-1.5 text-muted">Note: {roleStatus.lastResolved.admin_note}</span>
                  ) : null}
                </p>
              </div>
            ) : null}
          </div>

          {rankSuccess && <p className="text-sm text-emerald-300 mb-2 m-0">{rankSuccess}</p>}
          {rankError && <p className="text-sm text-error mb-2 m-0">{rankError}</p>}
        </>
      )}

      {activeTab === 'account' && (
        <>
          {isAuthenticated && (
            <div className="mb-8 pixel-well p-4 space-y-3">
              <h2 className="text-lg font-medium text-[#e2e8f0] m-0">Account verification</h2>
              <p className="text-xs text-muted m-0">
                Verified accounts unlock Team Builder AI analysis, the website shop, gacha, and monthly tournament
                registration.
              </p>
              {vError && !vLoading && (
                <p className="text-sm text-red-400 m-0">
                  {vError}
                </p>
              )}
              {user?.is_admin ? (
                <p className="text-sm text-emerald-200/90 m-0">Your account has full access.</p>
              ) : vLoading ? (
                <p className="text-sm text-muted m-0">Loading status...</p>
              ) : vStatus?.verified || isAccountVerified(user) ? (
                <p className="text-sm text-emerald-200/90 m-0 flex flex-wrap items-center gap-2">
                  Account verified.
                  <VerifiedAccountBadge className="w-5 h-5" />
                </p>
              ) : (
                <>
                  {vStatus?.pending ? (
                    <p className="text-sm text-amber-200/90 m-0">
                      Request pending review ·{' '}
                      {new Date(vStatus.pending.created_at).toLocaleString('vi-VN')}
                      {vStatus.pending.message ? (
                        <span className="block mt-2 text-muted">Message: {vStatus.pending.message}</span>
                      ) : null}
                    </p>
                  ) : null}
                  {vStatus?.lastResolved?.status === 'rejected' ? (
                    <div className="rounded-lg border border-red-500/30 bg-red-950/20 p-3 text-sm">
                      <p className="text-red-200/95 m-0 font-medium">Previous request was rejected</p>
                      {vStatus.lastResolved.admin_note ? (
                        <p className="text-red-100/90 m-0 mt-2 text-xs">
                          Note: {vStatus.lastResolved.admin_note}
                        </p>
                      ) : null}
                      <p className="text-muted m-0 mt-2 text-xs">You can submit a new request below.</p>
                    </div>
                  ) : null}
                  {!vStatus?.pending ? (
                    <form onSubmit={handleVerificationSubmit} className="space-y-2">
                      {vError ? (
                        <p className="text-sm text-red-400 m-0">{vError}</p>
                      ) : null}
                      <label htmlFor="verify-req-msg" className="block text-xs text-muted mb-1">
                        Message (optional)
                      </label>
                      <textarea
                        id="verify-req-msg"
                        value={vRequestNote}
                        onChange={(e) => setVRequestNote(e.target.value)}
                        rows={3}
                        maxLength={2000}
                        placeholder="e.g. in-game IGN, Discord, proof..."
                        className="w-full px-3 py-2 rounded-lg bg-[#0f0a1a] border border-border text-[#e2e8f0] text-sm"
                      />
                      <button
                        type="submit"
                        disabled={vSubmitting}
                        className="py-2 px-4 pixel-btn-primary disabled:opacity-50 text-base"
                      >
                        {vSubmitting ? 'Sending...' : 'Submit verification request'}
                      </button>
                    </form>
                  ) : null}
                </>
              )}
            </div>
          )}

          <h2 className="text-lg font-medium text-[#e2e8f0] m-0 mb-4">Change password</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-error/15 border border-error/30 text-error text-sm">{error}</div>
        )}
        {success && (
          <div className="p-3 rounded-lg bg-emerald/15 border border-emerald/30 text-emerald text-sm">
            Password updated successfully.
          </div>
        )}
        <div>
          <label htmlFor="current-password" className="block text-xs text-muted mb-1">
            Current password
          </label>
          <input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-[#0f0a1a] border border-border text-[#e2e8f0] text-sm"
            required
          />
        </div>
        <div>
          <label htmlFor="new-password" className="block text-xs text-muted mb-1">
            New password
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-[#0f0a1a] border border-border text-[#e2e8f0] text-sm"
            required
            minLength={8}
          />
          <p className="text-xs text-muted mt-1">At least 8 characters.</p>
        </div>
        <div>
          <label htmlFor="confirm-password" className="block text-xs text-muted mb-1">
            Confirm new password
          </label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-[#0f0a1a] border border-border text-[#e2e8f0] text-sm"
            required
            minLength={8}
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="w-full sm:w-auto py-2.5 px-6 pixel-btn-primary disabled:opacity-50"
        >
          {submitting ? 'Updating...' : 'Update password'}
        </button>
          </form>
        </>
      )}
      </PageSection>
    </PageShell>
  )
}
