import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  buyPokemonShopOffer,
  buyShopItem,
  changePassword,
  claimDailyLoginReward,
  claimInventoryItem,
  claimPokemonShopPurchase,
  fetchDailyLoginStatus,
  fetchPokemonShopOffers,
  fetchPokemonShopPurchases,
  fetchShopItems,
  fetchUserPvpRank,
  fetchUserCurrencies,
  fetchUserInventory,
  fetchVerificationStatus,
  submitVerificationRequest,
  fetchRoleCatalog,
  buyRank,
  fetchRoleRequestStatus,
  submitRoleGrantRequest,
  type VerificationStatusResponse,
  type RoleCatalogEntry,
  type RoleWebsitePerks,
  type DailyLoginStatus,
  type PokemonShopOffer,
  type PokemonShopPurchase,
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
import { PageHeader, PageShell, PageSection, PageTabBar } from './PageLayout.tsx'

function formatPokemonShopCategory(category: string): string {
  const labels: Record<string, string> = {
    legend_high: 'Legend (high tier)',
    legend_low: 'Legend (low tier)',
    pseudo_legend: 'Pseudo-legend',
    ultra_beast: 'Ultra Beast',
  }
  return labels[category] ?? category.replace(/_/g, ' ')
}

function perksForMinecraftRole(
  cat: {
    purchasable: RoleCatalogEntry[]
    grantOnly: RoleCatalogEntry[]
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
          <span className="text-slate-500 block text-[10px] sm:text-[11px] mt-0.5">Extra Cobble$</span>
        </p>
      </div>
      <div className={cellClass}>
        <p className={labelClass}>Tickets</p>
        <p className="m-0">
          <span className="text-sky-200/95 font-medium tabular-nums">+{perks.dailyTickets}</span>
          <span className="text-slate-500 block text-[10px] sm:text-[11px] mt-0.5">Per daily claim</span>
        </p>
      </div>
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
  const [pokemonOffers, setPokemonOffers] = useState<PokemonShopOffer[]>([])
  const [pokemonWindowEnd, setPokemonWindowEnd] = useState<string | null>(null)
  const [pokemonCountdown, setPokemonCountdown] = useState('-')
  const [pokemonPurchases, setPokemonPurchases] = useState<PokemonShopPurchase[]>([])
  const [pokemonBusy, setPokemonBusy] = useState<string | null>(null)
  const [pokemonError, setPokemonError] = useState<string | null>(null)
  const [pokemonSuccess, setPokemonSuccess] = useState<string | null>(null)
  const [pokemonClaimedToServerAt, setPokemonClaimedToServerAt] = useState<Record<number, string>>({})
  const [userPvpRank, setUserPvpRank] = useState<UserPvpRank | null>(null)
  const [vStatus, setVStatus] = useState<VerificationStatusResponse | null>(null)
  const [vLoading, setVLoading] = useState(false)
  const [vError, setVError] = useState<string | null>(null)
  const [vRequestNote, setVRequestNote] = useState('')
  const [vSubmitting, setVSubmitting] = useState(false)
  const [roleCat, setRoleCat] = useState<{
    defaultRole: string
    memberPerks: RoleWebsitePerks
    purchasable: RoleCatalogEntry[]
    grantOnly: RoleCatalogEntry[]
  } | null>(null)
  const [roleStatus, setRoleStatus] = useState<Awaited<ReturnType<typeof fetchRoleRequestStatus>> | null>(null)
  const [rankBusyKey, setRankBusyKey] = useState<string | null>(null)
  const [rankError, setRankError] = useState<string | null>(null)
  const [rankSuccess, setRankSuccess] = useState<string | null>(null)
  const [grantRolePick, setGrantRolePick] = useState('')
  const [grantMessage, setGrantMessage] = useState('')
  const [grantSubmitting, setGrantSubmitting] = useState(false)
  const refreshWebsiteCobbleBalance = useCallback(() => {
    fetchUserCurrencies().then(({ currencies }) => {
      setCobbleBalance(currencies.find((c) => c.currency_type === 'cobbledollars')?.balance ?? 0)
    })
  }, [])

  /** Must match `PVP_DAILY_REWARDS` in backend (`apps/Backend/src/index.ts`). */
  const PVP_DAILY_REWARD_BY_RANK: Record<number, number> = {
    1: 100_000,
    2: 75_000,
    3: 50_000,
  }
  const PVP_DAILY_TICKETS_BY_RANK: Record<number, number> = {
    1: 2,
    2: 1,
    3: 1,
  }

  const displayItemName = (key: string): string => {
    const map: Record<string, string> = {
      exp_candy_xl: 'EXP Candy XL',
      ancient_origin_ball: 'Ancient Origin Ball',
      master_ball: 'Master Ball',
      gold_bottle_cap: 'Gold Bottle Cap',
    }
    if (map[key]) return map[key]
    return key
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  }

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
      fetchPokemonShopOffers(),
      fetchPokemonShopPurchases(20),
      fetchRoleCatalog().catch(() => null),
      fetchRoleRequestStatus().catch(() => null),
    ])
      .then(([d, inv, shop, currencies, pvpRank, pOffers, pPurchases, roles, rStatus]) => {
        setDaily(d)
        setInventory(inv.inventory ?? [])
        setShopItems(shop.items ?? [])
        setBattlePassShopItems(shop.battlePassItems ?? [])
        setShopDiscountPercent(shop.shopDiscountPercent ?? pOffers.shopDiscountPercent ?? 0)
        setCobbleBalance(
          currencies.currencies.find((c) => c.currency_type === 'cobbledollars')?.balance ?? 0
        )
        setUserPvpRank(pvpRank)
        setPokemonOffers(pOffers.offers ?? [])
        setPokemonWindowEnd(pOffers.windowEnd ?? null)
        setPokemonPurchases(pPurchases.purchases ?? [])
        if (roles) {
          setRoleCat({
            defaultRole: roles.defaultRole,
            memberPerks: roles.memberPerks,
            purchasable: roles.purchasable,
            grantOnly: roles.grantOnly,
          })
        }
        if (rStatus) setRoleStatus(rStatus)
      })
      .catch((e) => setDailyLoadError(e instanceof Error ? e.message : 'Failed to load daily rewards'))
      .finally(() => setDailyLoading(false))
  }, [isAuthenticated])

  useEffect(() => {
    if (!pokemonWindowEnd) {
      setPokemonCountdown('-')
      return
    }
    const update = () => {
      const diffMs = new Date(pokemonWindowEnd).getTime() - Date.now()
      if (diffMs <= 0) {
        setPokemonCountdown('Refreshing...')
        return
      }
      const total = Math.floor(diffMs / 1000)
      const h = Math.floor(total / 3600)
      const m = Math.floor((total % 3600) / 60)
      const s = total % 60
      setPokemonCountdown(`${h}h ${m}m ${s}s`)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [pokemonWindowEnd])

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
    const rk = userPvpRank?.rank ?? null
    const inTop3 = rk != null && rk >= 1 && rk <= 3
    const cobble = rk != null ? PVP_DAILY_REWARD_BY_RANK[rk] ?? 0 : 0
    const tickets = rk != null ? PVP_DAILY_TICKETS_BY_RANK[rk] ?? 0 : 0
    return { rk, inTop3, cobble, tickets }
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
    const streakLadderCobble = nr?.kind === 'cobbledollars' ? nr.amount : 0
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
        setCobbleBalance(currencies.currencies.find((c) => c.currency_type === 'cobbledollars')?.balance ?? 0)
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
      setCobbleBalance(currencies.currencies.find((c) => c.currency_type === 'cobbledollars')?.balance ?? 0)
    } catch (err) {
      setShopError(err instanceof Error ? err.message : 'Purchase failed')
    } finally {
      setShopBusyItem(null)
    }
  }

  const refreshPokemonShop = async () => {
    const [offers, purchases] = await Promise.all([fetchPokemonShopOffers(), fetchPokemonShopPurchases(20)])
    setPokemonOffers(offers.offers ?? [])
    setShopDiscountPercent(offers.shopDiscountPercent ?? 0)
    setPokemonWindowEnd(offers.windowEnd ?? null)
    setPokemonPurchases(purchases.purchases ?? [])
  }

  const handleBuyPokemon = async (offer: PokemonShopOffer) => {
    if (!canUseWebsiteShop) {
      setPokemonError('Account verification required to buy from the shop.')
      return
    }
    setPokemonError(null)
    setPokemonSuccess(null)
    setPokemonBusy(`buy-${offer.slot}`)
    try {
      const res = await buyPokemonShopOffer(offer.slot)
      setPokemonSuccess(
        `Purchased ${res.shiny ? 'Shiny' : 'Normal'} ${displayItemName(res.species)}. Claim it from the list below.`
      )
      const [currencies] = await Promise.all([fetchUserCurrencies(), refreshPokemonShop()])
      setCobbleBalance(currencies.currencies.find((c) => c.currency_type === 'cobbledollars')?.balance ?? 0)
    } catch (err) {
      setPokemonError(err instanceof Error ? err.message : 'Pokemon purchase failed')
    } finally {
      setPokemonBusy(null)
    }
  }

  const handleClaimPokemon = async (purchaseId: number) => {
    setPokemonError(null)
    setPokemonSuccess(null)
    setPokemonBusy(`claim-${purchaseId}`)
    try {
      await claimPokemonShopPurchase(purchaseId)
      setPokemonClaimedToServerAt((prev) => ({
        ...prev,
        [purchaseId]: new Date().toISOString(),
      }))
      await refreshPokemonShop()
    } catch (err) {
      setPokemonError(err instanceof Error ? err.message : 'Pokemon claim failed')
    } finally {
      setPokemonBusy(null)
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
    setRankError(null)
    setRankSuccess(null)
    setRankBusyKey(entry.key)
    try {
      const out = await buyRank(entry.key)
      setRankSuccess(`Purchased rank ${entry.label}. It should apply in-game within a few seconds.`)
      setCobbleBalance(out.newBalance)
      void refreshUser()
      const [shopUp, pOffersUp, rs] = await Promise.all([
        fetchShopItems(),
        fetchPokemonShopOffers(),
        fetchRoleRequestStatus().catch(() => null),
      ])
      setShopItems(shopUp.items ?? [])
      setBattlePassShopItems(shopUp.battlePassItems ?? [])
      setShopDiscountPercent(shopUp.shopDiscountPercent ?? pOffersUp.shopDiscountPercent ?? 0)
      setPokemonOffers(pOffersUp.offers ?? [])
      setPokemonWindowEnd(pOffersUp.windowEnd ?? null)
      if (rs) setRoleStatus(rs)
    } catch (err) {
      setRankError(err instanceof Error ? err.message : 'Rank purchase failed')
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
          <div className="mb-4 rounded-lg border border-amber-500/30 bg-[#0a1020] px-4 py-3 shadow-[inset_0_1px_0_0_rgba(251,191,36,0.08)]">
            <h3 className="text-sm font-semibold text-amber-200/95 m-0 mb-2 tracking-tight">PVP leaderboard</h3>
            <p className="text-sm text-[#e2e8f0] m-0">
              Current rank:{' '}
              <span className="text-[#fbbf24] font-medium inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
                {userPvpRank?.rank != null ? (
                  <>
                    <span className="tabular-nums">#{userPvpRank.rank}</span>
                    {userPvpRank.tier ? (
                      <>
                        <span className="text-slate-500 font-normal"> | </span>
                        <PvPTierBadge
                          slug={normalizePvpTierSlugForAssets(userPvpRank.tier)}
                          displayName={pvpTierHumanName(userPvpRank.tier)}
                          fallbackTextClassName="text-[#fbbf24]"
                          imgHeightClass="h-5"
                        />
                      </>
                    ) : null}
                  </>
                ) : (
                  'Unranked'
                )}
              </span>
            </p>
            <p className="text-sm m-0 mt-2">
              <span className="text-slate-400">Next reset reward: </span>
              {pvpLeaderboardPreview.inTop3 ? (
                <span className="text-amber-100/95">
                  <span className="tabular-nums font-semibold">
                    {pvpLeaderboardPreview.cobble.toLocaleString()} Cobble$
                  </span>
                  {pvpLeaderboardPreview.tickets > 0 ? (
                    <span> + {pvpLeaderboardPreview.tickets} normal ticket(s)</span>
                  ) : null}
                  <span className="text-slate-500 font-normal text-xs">
                    {' '}
                    - if you&apos;re still in the top 3 after the next reset
                  </span>
                </span>
              ) : (
                <span className="text-slate-500">- For top 3 only. Credited to your site balance automatically.</span>
              )}
            </p>
            <p className="text-xs text-slate-500 m-0 mt-2 leading-relaxed">
              Not part of the daily claim below - only your streak and role bonuses use that button.
            </p>
          </div>

          <h2 className="text-lg font-medium text-[#e2e8f0] m-0 mb-3">Daily login &amp; role</h2>
          {dailyLoading ? (
            <p className="text-sm text-muted mb-6">Loading rewards...</p>
          ) : dailyLoadError ? (
            <p className="text-sm text-error mb-6">{dailyLoadError}</p>
          ) : !daily ? (
            <p className="text-sm text-muted mb-6">No reward data.</p>
          ) : (
            <div className="mb-6 pixel-well p-4 space-y-4">
              <p className="text-sm text-muted m-0">
                Reset: 00:00 ({daily.timeZone})  |  Date: {daily.date}
              </p>
              <p className="text-sm text-muted mt-2 mb-0">Next reset in: {dailyResetCountdown}</p>

              <section>
                <h3 className="text-sm font-semibold text-[#cbd5e1] m-0 mb-2">Your rank perks</h3>
                <div className="text-xs text-muted space-y-1.5 border border-border/50 rounded-lg px-2 py-2 bg-[#0f172a]/50">
                  {rewardsBreakdown.rb ? (
                    <>
                      <p className="m-0 text-[#e2e8f0]">
                        Rank: <span className="text-slate-300">({rewardsBreakdown.rb.minecraftRole})</span>
                      </p>
                      {rewardsBreakdown.roleFlatCobble > 0 ? (
                        <p className="m-0">
                          <span className="text-slate-400">Extra Cobble$ (with daily claim): </span>
                          <span className="tabular-nums text-amber-200/95">
                            +{rewardsBreakdown.roleFlatCobble.toLocaleString()}
                          </span>
                        </p>
                      ) : (
                        <p className="m-0 text-slate-500">No extra Cobble$ from rank for this tier.</p>
                      )}
                      {rewardsBreakdown.roleTickets > 0 ? (
                        <p className="m-0">
                          <span className="text-slate-400">Extra tickets (with daily claim): </span>
                          <span className="tabular-nums text-sky-200/95">+{rewardsBreakdown.roleTickets}</span> normal
                          ticket(s)
                        </p>
                      ) : (
                        <p className="m-0 text-slate-500">No extra tickets from rank.</p>
                      )}
                      {rewardsBreakdown.claimedToday ? (
                        <p className="m-0 text-emerald-300/90 text-[11px]">
                          Role bonuses were included when you claimed today&apos;s daily reward.
                        </p>
                      ) : null}
                      {!rewardsBreakdown.canClaimDaily && !rewardsBreakdown.claimedToday && daily.eligible === false ? (
                        <p className="m-0 text-amber-300/90 text-[11px]">
                          Join the server after reset to unlock the daily bundle (streak + role together).
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="m-0 text-slate-500">Role bonus data unavailable.</p>
                  )}
                </div>
              </section>

              <section className="border-t border-border/50 pt-3">
                <h3 className="text-sm font-semibold text-[#cbd5e1] m-0 mb-2">Daily streak</h3>
                <p className="text-xs text-muted m-0 mb-1.5">
                  Total days claimed:{' '}
                  <span className="tabular-nums text-slate-300">
                    {(daily.totalClaimDays ?? 0).toLocaleString()}
                  </span>
                </p>
                <p className="text-sm text-violet-200 m-0">
                  Next step: Day {daily.streak.nextDay}  |  {daily.streak.nextReward?.label ?? '-'}
                </p>
                <p className="text-xs text-muted mt-1 m-0">
                  Base Cobble$ from streak (before rank extras):{' '}
                  {rewardsBreakdown.nr?.kind === 'cobbledollars' ? (
                    <span className="tabular-nums text-slate-300">
                      {rewardsBreakdown.streakLadderCobble.toLocaleString()}
                    </span>
                  ) : (
                    <span className="text-slate-400">
                      - (today&apos;s reward: {rewardsBreakdown.nr?.label ?? '-'})
                    </span>
                  )}
                </p>
                <p className={`text-sm mt-2 mb-0 ${daily.eligible ? 'text-emerald-300' : 'text-amber-300'}`}>
                  {daily.eligible
                    ? 'Eligible today: you have been online at least once after reset.'
                    : 'Not eligible yet today. Join the server first.'}
                </p>
                {rewardsBreakdown.claimedToday ? (
                  <p className="text-sm text-emerald-300 mt-2 m-0">
                    Claimed today (Day {daily.claim?.streakDay ?? '?'}) - {daily.claim?.selectedReward ?? 'Reward'}
                  </p>
                ) : null}
              </section>

              <section className="border-t border-border/40 pt-4">
                <h3 className="text-sm font-semibold text-[#cbd5e1] m-0 mb-2">Daily claim total</h3>
                <p className="text-sm m-0 text-[#e2e8f0]">
                  Cobble$:{' '}
                  <span className="tabular-nums text-[#fbbf24] font-semibold">
                    {rewardsBreakdown.totalCobble.toLocaleString()}
                  </span>
                  {'  |  '}
                  Tickets:{' '}
                  <span className="tabular-nums text-sky-200/95 font-semibold">{rewardsBreakdown.totalTickets}</span>
                </p>
                <p className="text-xs text-muted mt-2 mb-3">
                  Claims your <strong className="text-slate-400">daily streak</strong> and <strong className="text-slate-400">rank perks</strong> above. PVP rewards use the separate box.
                </p>
                <button
                  type="button"
                  onClick={() => void handleClaimDailyReward()}
                  disabled={rewardsClaimBusy || !rewardsBreakdown.hasClaimable}
                  className="py-2 px-4 pixel-btn-primary disabled:opacity-50"
                >
                  {rewardsClaimBusy ? 'Claiming...' : 'Claim daily reward'}
                </button>
                {rewardsClaimSuccess ? (
                  <p className="text-sm text-emerald-300 mt-3 mb-0">{rewardsClaimSuccess}</p>
                ) : null}
                {rewardsClaimError ? (
                  <p className="text-sm text-error mt-3 mb-0">{rewardsClaimError}</p>
                ) : null}
              </section>
            </div>
          )}
        </>
      )}

      {activeTab === 'inventory' && (
        <>
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
            Cobble$ balance:{' '}
            <span className="text-[#fbbf24] font-semibold tabular-nums">{cobbleBalance.toLocaleString()}</span>
          </p>
          {!canUseWebsiteShop ? (
            <div
              className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
              role="status"
            >
              <p className="m-0 font-medium">Shop available after account verification</p>
              <p className="m-0 mt-1 text-xs text-amber-100/90">
                If not verified, you cannot buy on the website (Shop, Battle pass, Pokemon Shop). Submit a verification request in the
                Account tab.
              </p>
            </div>
          ) : null}

          <h2 className="text-lg font-medium text-[#e2e8f0] m-0 mb-3">Shop</h2>
          {shopDiscountPercent > 0 ? (
            <p className="text-sm text-emerald-300/95 m-0 mb-3">
              Rank discount: -{shopDiscountPercent}% on Cobble$ (item shop, battle pass, and Pokemon shop).
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
                          <span className="text-[#fbbf24] tabular-nums">{item.discountedCost.toLocaleString()} Cobble$</span>
                        </>
                      ) : (
                        <>Cost: {item.cost.toLocaleString()} Cobble$</>
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
                          <span className="text-[#fbbf24] tabular-nums">{item.discountedCost.toLocaleString()} Cobble$</span>
                        </>
                      ) : (
                        <>Cost: {item.cost.toLocaleString()} Cobble$</>
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

          <h2 className="text-lg font-medium text-[#e2e8f0] m-0 mb-3">Pokemon Shop</h2>
          <div className="mb-6 pixel-well p-4">
            <p className="text-sm text-muted m-0 mb-3">
              Refresh in: {pokemonCountdown}. Each slot is <strong className="text-slate-300">one copy site-wide</strong>{' '}
              per rotation - 6 slots; first buyer takes each. Each slot rolls shiny or normal (~35% shiny).
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {pokemonOffers.map((offer) => (
                <div
                  key={offer.slot}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-[#e2e8f0] m-0">
                      {offer.shiny ? 'Shiny ' : 'Normal '}
                      {displayItemName(offer.species)}
                    </p>
                    <p className="text-xs text-muted m-0">
                      {formatPokemonShopCategory(offer.category)}  | {' '}
                      {shopDiscountPercent > 0 && offer.price < offer.listPrice ? (
                        <>
                          <span className="line-through opacity-70">{offer.listPrice.toLocaleString()}</span>{' '}
                          <span className="text-[#fbbf24] tabular-nums">{offer.price.toLocaleString()} Cobble$</span>
                        </>
                      ) : (
                        <span className="tabular-nums">{offer.price.toLocaleString()} Cobble$</span>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleBuyPokemon(offer)}
                    disabled={
                      !canUseWebsiteShop ||
                      offer.soldOut ||
                      pokemonBusy === `buy-${offer.slot}` ||
                      cobbleBalance < offer.price
                    }
                    className="shrink-0 py-2 px-3 pixel-btn-primary disabled:opacity-50 text-base"
                  >
                    {offer.soldOut && !offer.purchasedByYou
                      ? 'Sold out'
                      : offer.purchasedByYou
                        ? 'Yours'
                        : pokemonBusy === `buy-${offer.slot}`
                          ? 'Buying...'
                          : 'Buy'}
                  </button>
                </div>
              ))}
            </div>

            <p className="text-sm text-muted mt-4 mb-2">Purchased Pokemon</p>
            <div className="space-y-2">
              {pokemonPurchases.length === 0 ? (
                <p className="text-sm text-muted m-0">No Pokemon purchases yet.</p>
              ) : (
                pokemonPurchases.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm text-[#e2e8f0] m-0">
                        {p.shiny ? 'Shiny ' : 'Normal '}
                        {displayItemName(p.species)}
                      </p>
                      <p className="text-xs text-muted m-0">
                        {new Date(p.purchasedAt).toLocaleString()}  |  {p.price.toLocaleString()} Cobble$
                      </p>
                      {(p.claimedAt || pokemonClaimedToServerAt[p.id]) && (
                        <p className="text-xs text-emerald-300 m-0 mt-1">
                          {displayItemName(p.species)} delivered in-game at{' '}
                          {new Date(pokemonClaimedToServerAt[p.id] ?? p.claimedAt ?? '').toLocaleTimeString()}.
                        </p>
                      )}
                    </div>
                    {p.claimedAt ? null : (
                      <button
                        type="button"
                        onClick={() => handleClaimPokemon(p.id)}
                        disabled={pokemonBusy === `claim-${p.id}`}
                        className="shrink-0 py-2 px-3 pixel-btn-primary disabled:opacity-50 text-base"
                      >
                        {pokemonBusy === `claim-${p.id}` ? 'Claiming...' : 'Claim'}
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {pokemonSuccess && <p className="text-sm text-emerald-300 mt-3 mb-0">{pokemonSuccess}</p>}
            {pokemonError && <p className="text-sm text-error mt-3 mb-0">{pokemonError}</p>}
          </div>
        </>
      )}

      {activeTab === 'ranks' && (
        <>
          <p className="text-sm text-muted m-0 mb-2">
            Cobble$ balance:{' '}
            <span className="text-[#fbbf24] font-semibold tabular-nums">{cobbleBalance.toLocaleString()}</span>
          </p>
          <p className="text-sm text-muted m-0 mb-3">
            Current rank:{' '}
            <span className="inline-flex align-middle mr-1">
              <RoleBadge roleKey={roleStatus?.currentRole ?? user?.minecraft_role ?? 'member'} />
            </span>
            <span className="text-[#e2e8f0] font-medium">
              {(roleStatus?.currentRole ?? user?.minecraft_role ?? 'member').toUpperCase()}
            </span>
          </p>
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

          <h2 className="text-lg font-medium text-[#e2e8f0] m-0 mb-3">Buy rank (Cobble$)</h2>
          <p className="text-xs text-muted m-0 mb-3">
            Below are perks for your current rank. Use the cards to view or purchase higher ranks.
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
          <p className="text-xs text-muted m-0 mb-3">After payment, your rank updates in-game within a few seconds.</p>
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
                          {(entry.cost ?? 0).toLocaleString()} Cobble$
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleBuyRank(entry)}
                      disabled={
                        !canUseWebsiteShop || rankBusyKey === entry.key || cobbleBalance < (entry.cost ?? 0)
                      }
                      className="shrink-0 self-start px-4 py-2 text-base pixel-btn-primary disabled:opacity-50"
                    >
                      {rankBusyKey === entry.key ? 'Buying...' : 'Buy'}
                    </button>
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

          <h2 className="text-lg font-medium text-[#e2e8f0] m-0 mb-2">Rank requests</h2>
          <p className="text-xs text-muted m-0 mb-3">
            Premium and partner ranks are not available for direct purchase. Submit a request for staff review.
          </p>
          <div className="mb-4 space-y-3">
            {(roleCat?.grantOnly ?? []).map((g) => (
              <div
                key={g.key}
                className={`flex flex-col gap-3 rounded-lg border px-3 py-3 sm:px-4 transition-colors ${
                  grantRolePick === g.key
                    ? 'border-emerald-500/55 bg-emerald-950/15'
                    : 'border-border/70 bg-[#0a0f18]/40 hover:border-border'
                }`}
              >
                <div className="flex flex-row items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div className="shrink-0">
                      <RoleBadge roleKey={g.key} />
                    </div>
                    <div className="min-w-0">
                      <p className="m-0 text-sm font-semibold text-[#e2e8f0]">{g.label}</p>
                      <p className="m-0 mt-0.5 text-[10px] uppercase tracking-wide text-amber-200/75">
                        By request
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setGrantRolePick(g.key)}
                    className={`shrink-0 self-start px-3 py-2 text-xs rounded-md border text-[#e2e8f0] ${
                      grantRolePick === g.key
                        ? 'border-emerald-500/70 bg-emerald-950/30'
                        : 'border-border bg-[#0f172a] hover:bg-[#1e293b]'
                    }`}
                  >
                    {grantRolePick === g.key ? 'Selected' : 'Select'}
                  </button>
                </div>
                <div className="w-full border-t border-border/45 pt-3">
                  <RolePerksSummary perks={g.perks} />
                </div>
              </div>
            ))}
          </div>
          <div className="mb-6 pixel-well p-4 space-y-3">
            {roleStatus?.pending ? (
              <p className="text-sm text-amber-200 m-0">
                Pending approval: <strong>{roleStatus.pending.requested_role}</strong> (sent{' '}
                {new Date(roleStatus.pending.created_at).toLocaleString()})
              </p>
            ) : (
              <form onSubmit={handleSubmitGrant} className="space-y-2">
                <label className="block text-sm text-[#e2e8f0]">
                  Selected rank
                  <CustomSelect
                    value={grantRolePick}
                    onChange={(v) => setGrantRolePick(v)}
                    options={[
                      { value: '', label: '- Pick from the list above or here -' },
                      ...(roleCat?.grantOnly ?? []).map((g) => ({
                        value: g.key,
                        label: `${g.label} (${g.key})`,
                      })),
                    ]}
                    className="mt-1"
                    buttonClassName="block w-full rounded border border-border bg-[#0f172a] px-2 py-2 text-base text-[#e2e8f0]"
                  />
                </label>
                <label className="block text-sm text-[#e2e8f0]">
                  Message (optional)
                  <textarea
                    value={grantMessage}
                    onChange={(e) => setGrantMessage(e.target.value)}
                    rows={2}
                    className="mt-1 block w-full rounded border border-border bg-[#0f172a] px-2 py-2 text-base text-[#e2e8f0]"
                    placeholder="e.g. TikTok link / why you need this rank..."
                  />
                </label>
                <button
                  type="submit"
                  disabled={grantSubmitting || !grantRolePick || Boolean(roleStatus?.pending)}
                  className="py-2 px-4 pixel-btn-primary disabled:opacity-50"
                >
                  {grantSubmitting ? 'Sending...' : 'Submit request'}
                </button>
              </form>
            )}
            {roleStatus?.lastResolved ? (
              <p className="text-xs text-muted m-0 border-t border-border/60 pt-2">
                Latest: {roleStatus.lastResolved.status} - {roleStatus.lastResolved.requested_role}
                {roleStatus.lastResolved.resolved_at
                  ? `  |  ${new Date(roleStatus.lastResolved.resolved_at).toLocaleString()}`
                  : ''}
                {roleStatus.lastResolved.admin_note ? ` - Note: ${roleStatus.lastResolved.admin_note}` : ''}
              </p>
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
