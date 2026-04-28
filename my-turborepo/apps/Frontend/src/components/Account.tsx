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
  fetchPvpTopPrediction,
  submitPvpTopPrediction,
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
  type PvpTopPredictionStatus,
  type ShopItem,
} from '../authApi'
import { AuthModal } from './AuthModal'
import { CobbleWebsiteWallet } from './CobbleWebsiteWallet.tsx'
import { CustomSelect } from './CustomSelect.tsx'
import { isAccountVerified, VerifiedAccountBadge } from './VerifiedAccountBadge.tsx'
import { RoleBadge } from './RoleBadge.tsx'

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
            <span className="text-emerald-300 font-semibold tabular-nums">−{d}%</span>
          ) : (
            <span className="text-slate-500">0%</span>
          )}
          <span className="text-slate-500 block sm:inline sm:ml-1 text-[10px] sm:text-[11px] mt-0.5 sm:mt-0">
            Items &amp; Pokémon
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
  type AccountTab = 'account' | 'daily' | 'predict' | 'shop' | 'ranks' | 'inventory' | 'cobble'
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
  const [dailyResetCountdown, setDailyResetCountdown] = useState('—')
  const [inventory, setInventory] = useState<{ item_key: string; quantity: number }[]>([])
  const [shopItems, setShopItems] = useState<ShopItem[]>([])
  const [shopDiscountPercent, setShopDiscountPercent] = useState(0)
  const [shopBusyItem, setShopBusyItem] = useState<string | null>(null)
  const [shopError, setShopError] = useState<string | null>(null)
  const [shopSuccess, setShopSuccess] = useState<string | null>(null)
  const [cobbleBalance, setCobbleBalance] = useState(0)
  const [claimBusyItem, setClaimBusyItem] = useState<string | null>(null)
  const [claimError, setClaimError] = useState<string | null>(null)
  const [claimedToServerAt, setClaimedToServerAt] = useState<Record<string, string>>({})
  const [activeTab, setActiveTab] = useState<AccountTab>('daily')
  const [pokemonOffers, setPokemonOffers] = useState<PokemonShopOffer[]>([])
  const [pokemonWindowEnd, setPokemonWindowEnd] = useState<string | null>(null)
  const [pokemonCountdown, setPokemonCountdown] = useState('—')
  const [pokemonPurchases, setPokemonPurchases] = useState<PokemonShopPurchase[]>([])
  const [pokemonBusy, setPokemonBusy] = useState<string | null>(null)
  const [pokemonError, setPokemonError] = useState<string | null>(null)
  const [pokemonSuccess, setPokemonSuccess] = useState<string | null>(null)
  const [pokemonClaimedToServerAt, setPokemonClaimedToServerAt] = useState<Record<number, string>>({})
  const [userPvpRank, setUserPvpRank] = useState<UserPvpRank | null>(null)
  const [pvpPredict, setPvpPredict] = useState<PvpTopPredictionStatus | null>(null)
  const [predictPick1, setPredictPick1] = useState('')
  const [predictPick2, setPredictPick2] = useState('')
  const [predictPick3, setPredictPick3] = useState('')
  const [predictStakeFull, setPredictStakeFull] = useState('')
  const [predictPickOnly1, setPredictPickOnly1] = useState('')
  const [predictPickOnly2, setPredictPickOnly2] = useState('')
  const [predictPickOnly3, setPredictPickOnly3] = useState('')
  const [predictStakeOnly1, setPredictStakeOnly1] = useState('')
  const [predictStakeOnly2, setPredictStakeOnly2] = useState('')
  const [predictStakeOnly3, setPredictStakeOnly3] = useState('')
  const [predictBusy, setPredictBusy] = useState(false)
  const [predictError, setPredictError] = useState<string | null>(null)
  const [predictSuccess, setPredictSuccess] = useState<string | null>(null)
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

  const PVP_DAILY_REWARD_BY_RANK: Record<number, number> = {
    1: 50_000,
    2: 45_000,
    3: 40_000,
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
          setVError(err instanceof Error ? err.message : 'Không tải được trạng thái xác minh.')
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
      fetchPvpTopPrediction().catch(() => null),
      fetchRoleCatalog().catch(() => null),
      fetchRoleRequestStatus().catch(() => null),
    ])
      .then(([d, inv, shop, currencies, pvpRank, pOffers, pPurchases, predict, roles, rStatus]) => {
        setDaily(d)
        setInventory(inv.inventory ?? [])
        setShopItems(shop.items ?? [])
        setShopDiscountPercent(shop.shopDiscountPercent ?? pOffers.shopDiscountPercent ?? 0)
        setCobbleBalance(
          currencies.currencies.find((c) => c.currency_type === 'cobbledollars')?.balance ?? 0
        )
        setUserPvpRank(pvpRank)
        setPokemonOffers(pOffers.offers ?? [])
        setPokemonWindowEnd(pOffers.windowEnd ?? null)
        setPokemonPurchases(pPurchases.purchases ?? [])
        if (predict) setPvpPredict(predict)
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
      setPokemonCountdown('—')
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
      setVError(err instanceof Error ? err.message : 'Không gửi được yêu cầu.')
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
      <div className="max-w-lg mx-auto pixel-panel-soft p-8 text-center">
        <h1 className="text-3xl font-bold text-[#e2e8f0] m-0 mb-2">Account</h1>
        <p className="text-muted text-base mb-6">Log in to change your password.</p>
        <button
          type="button"
          onClick={() => setShowAuth(true)}
          className="py-2.5 px-6 pixel-btn-primary"
        >
          Log in
        </button>
        {showAuth && <AuthModal onClose={() => setShowAuth(false)} defaultMode="login" />}
      </div>
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
      setRewardsClaimSuccess(r.message)
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

  const handleBuyItem = async (item: ShopItem) => {
    if (!canUseWebsiteShop) {
      setShopError('Cần xác minh tài khoản trên web để mua ở shop (admin được miễn).')
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
      setPokemonError('Cần xác minh tài khoản trên web để mua ở shop (admin được miễn).')
      return
    }
    setPokemonError(null)
    setPokemonSuccess(null)
    setPokemonBusy(`buy-${offer.slot}`)
    try {
      const res = await buyPokemonShopOffer(offer.slot)
      setPokemonSuccess(`Purchased Shiny ${res.species}. Claim it from purchase list below.`)
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
      setRankError('Cần xác minh tài khoản trên web để mua rank (admin được miễn).')
      return
    }
    setRankError(null)
    setRankSuccess(null)
    setRankBusyKey(entry.key)
    try {
      const out = await buyRank(entry.key)
      setRankSuccess(`Đã mua rank ${entry.label} — sẽ có hiệu lực trong game sau vài giây.`)
      setCobbleBalance(out.newBalance)
      void refreshUser()
      const [shopUp, pOffersUp, rs] = await Promise.all([
        fetchShopItems(),
        fetchPokemonShopOffers(),
        fetchRoleRequestStatus().catch(() => null),
      ])
      setShopItems(shopUp.items ?? [])
      setShopDiscountPercent(shopUp.shopDiscountPercent ?? pOffersUp.shopDiscountPercent ?? 0)
      setPokemonOffers(pOffersUp.offers ?? [])
      setPokemonWindowEnd(pOffersUp.windowEnd ?? null)
      if (rs) setRoleStatus(rs)
    } catch (err) {
      setRankError(err instanceof Error ? err.message : 'Mua rank thất bại')
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
      setRankSuccess('Đã gửi yêu cầu rank — staff sẽ duyệt hoặc từ chối.')
    } catch (err) {
      setRankError(err instanceof Error ? err.message : 'Không gửi được yêu cầu')
    } finally {
      setGrantSubmitting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg md:max-w-3xl pixel-panel-soft p-6 sm:p-8">
      <h1 className="text-3xl font-bold text-[#e2e8f0] m-0 mb-1">Account</h1>
      <p className="text-muted text-base mb-6">
        Signed in as{' '}
        <span className="inline-flex items-center gap-1.5 flex-wrap align-middle">
          <RoleBadge roleKey={user?.minecraft_role ?? 'member'} />
          <span className="text-[#e2e8f0]">{user?.username}</span>
          {user && isAccountVerified(user) ? <VerifiedAccountBadge className="w-5 h-5" /> : null}
        </span>
        {user?.email && (
          <span className="block mt-1 truncate" title={user.email}>
            {user.email}
          </span>
        )}
      </p>

      <div className="mb-6 grid grid-cols-2 sm:grid-cols-3 gap-2">
        {(
          [
            ['daily', 'Daily'],
            ['predict', 'PVP predict'],
            ['shop', 'Shop'],
            ['ranks', 'Ranks'],
            ['inventory', 'Inventory'],
            ['cobble', 'C$ balance'],
            ['account', 'Account'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`px-3 py-2 text-base font-bold ${
              activeTab === id ? 'pixel-pill pixel-pill-active-accent' : 'pixel-pill'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'cobble' && <CobbleWebsiteWallet onBalanceUpdated={refreshWebsiteCobbleBalance} />}

      {activeTab === 'daily' && (
        <>
          <div className="mb-4 rounded-lg border border-amber-500/30 bg-[#0a1020] px-4 py-3 shadow-[inset_0_1px_0_0_rgba(251,191,36,0.08)]">
            <h3 className="text-sm font-semibold text-amber-200/95 m-0 mb-2 tracking-tight">PVP leaderboard</h3>
            <p className="text-sm text-[#e2e8f0] m-0">
              Current rank:{' '}
              <span className="text-[#fbbf24] font-medium">
                {userPvpRank?.rank != null
                  ? `#${userPvpRank.rank}${userPvpRank.tier ? ` (${displayItemName(userPvpRank.tier)})` : ''}`
                  : 'Unranked'}
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
                    — if you&apos;re still in the top 3 after the next reset
                  </span>
                </span>
              ) : (
                <span className="text-slate-500">— For top 3 only. Credited to your site balance automatically.</span>
              )}
            </p>
            <p className="text-xs text-slate-500 m-0 mt-2 leading-relaxed">
              Not part of the daily claim below — only your streak and role bonuses use that button.
            </p>
          </div>

          <h2 className="text-lg font-medium text-[#e2e8f0] m-0 mb-3">Daily login &amp; role</h2>
          {dailyLoading ? (
            <p className="text-sm text-muted mb-6">Loading rewards…</p>
          ) : dailyLoadError ? (
            <p className="text-sm text-error mb-6">{dailyLoadError}</p>
          ) : !daily ? (
            <p className="text-sm text-muted mb-6">No reward data.</p>
          ) : (
            <div className="mb-6 pixel-well p-4 space-y-4">
              <p className="text-sm text-muted m-0">
                Reset: 00:00 ({daily.timeZone}) · Date: {daily.date}
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
                  Next step: Day {daily.streak.nextDay} · {daily.streak.nextReward?.label ?? '—'}
                </p>
                <p className="text-xs text-muted mt-1 m-0">
                  Base Cobble$ from streak (before rank extras):{' '}
                  {rewardsBreakdown.nr?.kind === 'cobbledollars' ? (
                    <span className="tabular-nums text-slate-300">
                      {rewardsBreakdown.streakLadderCobble.toLocaleString()}
                    </span>
                  ) : (
                    <span className="text-slate-400">
                      — (today&apos;s reward: {rewardsBreakdown.nr?.label ?? '—'})
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
                    Claimed today (Day {daily.claim?.streakDay ?? '?'}) — {daily.claim?.selectedReward ?? 'Reward'}
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
                  {' · '}
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
                  {rewardsClaimBusy ? 'Claiming…' : 'Claim daily reward'}
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

      {activeTab === 'predict' && (
        <>
          <h2 className="text-lg font-medium text-[#e2e8f0] m-0 mb-2">PVP predictions</h2>
          <p className="text-sm text-muted m-0 mb-4">
            Exact order #1–#3: win {pvpPredict?.winMultiplierFull ?? 4}× that stake if all three are correct.
            Or bet separately on who finishes #1, #2, or #3 — each pays {pvpPredict?.winMultiplierSlot ?? 2}× that
            line if correct. Per-line stake {pvpPredict?.minStake ?? 100}–{pvpPredict?.maxStake ?? 20_000}{' '}
            Cobble$. Resets 00:00 ({pvpPredict?.resetTimeZone ?? 'Asia/Ho_Chi_Minh'}). Top-3 payouts go to your site
            balance automatically — round: {pvpPredict?.forPayoutDate ?? '—'}.
          </p>
          {!pvpPredict ? (
            <p className="text-sm text-amber-200/90 m-0">Predictions are unavailable right now. Try again later.</p>
          ) : pvpPredict.rankedPlayers.length < 3 ? (
            <p className="text-sm text-muted m-0">
              Predictions open once there are at least three ranked players on the leaderboard.
            </p>
          ) : (
            <div className="mb-6 pixel-well p-4 space-y-4">
              <p className="text-xs text-muted m-0">
                Per line: {pvpPredict.minStake.toLocaleString()}–{pvpPredict.maxStake.toLocaleString()} Cobble$ ·
                Wallet: <span className="tabular-nums text-[#fbbf24]">{cobbleBalance.toLocaleString()}</span>
                {!pvpPredict.windowOpen && (
                  <span className="block mt-2 text-amber-300">
                    Locked for {pvpPredict.forPayoutDate}. Next round after reset.
                  </span>
                )}
              </p>
              {pvpPredict.entry ? (
                <div className="text-sm text-[#e2e8f0] space-y-3">
                  <p className="m-0 font-medium">Your entry (locked)</p>
                  {pvpPredict.entry.stake > 0 && (
                    <div className="rounded-lg border border-border/60 p-3 space-y-1">
                      <p className="text-xs text-muted m-0">
                        Full top 3 order (×{pvpPredict.winMultiplierFull})
                      </p>
                      <p className="m-0">
                        #1 {pvpPredict.entry.pick_rank1_name} · #2 {pvpPredict.entry.pick_rank2_name} · #3{' '}
                        {pvpPredict.entry.pick_rank3_name}
                      </p>
                      <p className="m-0 tabular-nums text-[#fbbf24]">
                        Stake {Number(pvpPredict.entry.stake).toLocaleString()} Cobble$
                      </p>
                    </div>
                  )}
                  {[1, 2, 3].map((rank) => {
                    const locked = pvpPredict.entry!
                    const sk =
                      rank === 1
                        ? (locked.stake_rank1_only ?? 0)
                        : rank === 2
                          ? (locked.stake_rank2_only ?? 0)
                          : (locked.stake_rank3_only ?? 0)
                    const pk =
                      rank === 1
                        ? locked.pick_rank1_only
                        : rank === 2
                          ? locked.pick_rank2_only
                          : locked.pick_rank3_only
                    if (!sk) return null
                    return (
                      <div
                        key={`locked-only-${rank}`}
                        className="rounded-lg border border-border/60 p-3 space-y-1"
                      >
                        <p className="text-xs text-muted m-0">
                          #{rank} only (×{pvpPredict.winMultiplierSlot})
                        </p>
                        <p className="m-0">{pk ?? '—'}</p>
                        <p className="m-0 tabular-nums text-[#fbbf24]">
                          Stake {Number(sk).toLocaleString()} Cobble$
                        </p>
                      </div>
                    )
                  })}
                  <p className="m-0">
                    Result:{' '}
                    <span
                      className={
                        pvpPredict.entry.result === 'won'
                          ? 'text-emerald-300'
                          : pvpPredict.entry.result === 'lost'
                            ? 'text-rose-300'
                            : 'text-muted'
                      }
                    >
                      {pvpPredict.entry.result === 'pending'
                        ? `Pending until 00:00 ${pvpPredict.resetTimeZone ?? 'Asia/Ho_Chi_Minh'}`
                        : pvpPredict.entry.result === 'won'
                          ? `Won — +${Number(pvpPredict.entry.payout_amount ?? 0).toLocaleString()} Cobble$`
                          : 'Lost'}
                    </span>
                  </p>
                </div>
              ) : pvpPredict.windowOpen ? (
                <form
                  className="space-y-5"
                  onSubmit={async (e) => {
                    e.preventDefault()
                    setPredictError(null)
                    setPredictSuccess(null)
                    const parseN = (s: string) => parseInt(s.replace(/,/g, ''), 10)
                    const sf = parseN(predictStakeFull)
                    const s1 = parseN(predictStakeOnly1)
                    const s2 = parseN(predictStakeOnly2)
                    const s3 = parseN(predictStakeOnly3)
                    const na = (v: number) => !Number.isFinite(v) || !Number.isInteger(v) || v < 0
                    if (na(sf) || na(s1) || na(s2) || na(s3)) {
                      setPredictError('Use whole-number stakes (0 to skip a line).')
                      return
                    }
                    const { minStake, maxStake } = pvpPredict
                    const checkBand = (x: number, label: string) => {
                      if (x === 0) return null
                      if (x < minStake || x > maxStake) return `${label}: ${minStake}–${maxStake}`
                      return null
                    }
                    const bandErr =
                      checkBand(sf, 'Full combo') ||
                      checkBand(s1, '#1 only') ||
                      checkBand(s2, '#2 only') ||
                      checkBand(s3, '#3 only')
                    if (bandErr) {
                      setPredictError(bandErr)
                      return
                    }
                    const total = sf + s1 + s2 + s3
                    if (total <= 0) {
                      setPredictError('Stake at least one line.')
                      return
                    }
                    if (sf > 0 && (!predictPick1 || !predictPick2 || !predictPick3)) {
                      setPredictError('Full combo: pick #1, #2, #3 when stake > 0.')
                      return
                    }
                    if (sf > 0) {
                      const a = predictPick1.toLowerCase()
                      const b = predictPick2.toLowerCase()
                      const c = predictPick3.toLowerCase()
                      if (a === b || b === c || a === c) {
                        setPredictError('Full combo: three different players.')
                        return
                      }
                    }
                    if (s1 > 0 && !predictPickOnly1) {
                      setPredictError('Pick someone for #1-only.')
                      return
                    }
                    if (s2 > 0 && !predictPickOnly2) {
                      setPredictError('Pick someone for #2-only.')
                      return
                    }
                    if (s3 > 0 && !predictPickOnly3) {
                      setPredictError('Pick someone for #3-only.')
                      return
                    }
                    if (cobbleBalance < total) {
                      setPredictError(`Need ${total.toLocaleString()} Cobble$ (wallet too low).`)
                      return
                    }
                    setPredictBusy(true)
                    try {
                      const res = await submitPvpTopPrediction({
                        pickRank1: sf > 0 ? predictPick1 : '',
                        pickRank2: sf > 0 ? predictPick2 : '',
                        pickRank3: sf > 0 ? predictPick3 : '',
                        stake: sf,
                        stakeRank1Only: s1,
                        pickRank1Only: s1 > 0 ? predictPickOnly1 : '',
                        stakeRank2Only: s2,
                        pickRank2Only: s2 > 0 ? predictPickOnly2 : '',
                        stakeRank3Only: s3,
                        pickRank3Only: s3 > 0 ? predictPickOnly3 : '',
                      })
                      setPredictSuccess(`Submitted for ${res.forPayoutDate}.`)
                      setCobbleBalance(res.newBalance)
                      setPredictStakeFull('')
                      setPredictStakeOnly1('')
                      setPredictStakeOnly2('')
                      setPredictStakeOnly3('')
                      const next = await fetchPvpTopPrediction()
                      setPvpPredict(next)
                    } catch (err) {
                      setPredictError(err instanceof Error ? err.message : 'Submit failed')
                    } finally {
                      setPredictBusy(false)
                    }
                  }}
                >
                  <div className="space-y-3 rounded-lg border border-violet-500/25 bg-violet-950/20 p-3">
                    <p className="text-xs font-medium text-violet-200 m-0">
                      Exact #1 → #2 → #3 order — ×{pvpPredict.winMultiplierFull}{' '}
                      <span className="font-normal text-muted">(optional)</span>
                    </p>
                    {(['1st', '2nd', '3rd'] as const).map((label, i) => {
                      const value = i === 0 ? predictPick1 : i === 1 ? predictPick2 : predictPick3
                      const set =
                        i === 0 ? setPredictPick1 : i === 1 ? setPredictPick2 : setPredictPick3
                      return (
                        <label key={label} className="block">
                          <span className="block text-xs text-muted mb-1">{label} place</span>
                          <CustomSelect
                            value={value}
                            onChange={(v) => set(v)}
                            disabled={predictBusy}
                            options={[
                              { value: '', label: '— Select —' },
                              ...pvpPredict.rankedPlayers.map((p) => ({
                                value: p.playerName,
                                label: `#${p.rank} ${p.playerName}`,
                              })),
                            ]}
                            buttonClassName="w-full rounded-lg border border-border bg-[#0f0a1a]/80 px-3 py-2 text-sm text-[#e2e8f0]"
                          />
                        </label>
                      )
                    })}
                    <label className="block">
                      <span className="block text-xs text-muted mb-1">Stake (0 = skip)</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={predictStakeFull}
                        onChange={(e) => setPredictStakeFull(e.target.value)}
                        placeholder="0"
                        className="w-full rounded-lg border border-border bg-[#0f0a1a]/80 px-3 py-2 text-sm text-[#e2e8f0] tabular-nums"
                        disabled={predictBusy}
                      />
                    </label>
                  </div>
                  {[1, 2, 3].map((rank) => {
                    const pick =
                      rank === 1
                        ? predictPickOnly1
                        : rank === 2
                          ? predictPickOnly2
                          : predictPickOnly3
                    const setPick =
                      rank === 1
                        ? setPredictPickOnly1
                        : rank === 2
                          ? setPredictPickOnly2
                          : setPredictPickOnly3
                    const stakeVal =
                      rank === 1
                        ? predictStakeOnly1
                        : rank === 2
                          ? predictStakeOnly2
                          : predictStakeOnly3
                    const setStake =
                      rank === 1
                        ? setPredictStakeOnly1
                        : rank === 2
                          ? setPredictStakeOnly2
                          : setPredictStakeOnly3
                    return (
                      <div
                        key={`only-${rank}`}
                        className="space-y-2 rounded-lg border border-border/70 bg-[#0f0a1a]/40 p-3"
                      >
                        <p className="text-xs font-medium text-[#e2e8f0] m-0">
                          Who finishes #{rank}? only — ×{pvpPredict.winMultiplierSlot}
                        </p>
                        <label className="block">
                          <span className="block text-xs text-muted mb-1">Player</span>
                          <CustomSelect
                            value={pick}
                            onChange={(v) => setPick(v)}
                            disabled={predictBusy}
                            options={[
                              { value: '', label: '— Select —' },
                              ...pvpPredict.rankedPlayers.map((p) => ({
                                value: p.playerName,
                                label: `#${p.rank} ${p.playerName}`,
                              })),
                            ]}
                            buttonClassName="w-full rounded-lg border border-border bg-[#0f0a1a]/80 px-3 py-2 text-sm text-[#e2e8f0]"
                          />
                        </label>
                        <label className="block">
                          <span className="block text-xs text-muted mb-1">Stake (0 = skip)</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={stakeVal}
                            onChange={(e) => setStake(e.target.value)}
                            placeholder="0"
                            className="w-full rounded-lg border border-border bg-[#0f0a1a]/80 px-3 py-2 text-sm tabular-nums text-[#e2e8f0]"
                            disabled={predictBusy}
                          />
                        </label>
                      </div>
                    )
                  })}
                  <button
                    type="submit"
                    disabled={predictBusy || !pvpPredict.windowOpen}
                    className="py-2 px-4 pixel-btn-primary disabled:opacity-50"
                  >
                    {predictBusy ? 'Submitting…' : 'Lock predictions'}
                  </button>
                  {predictSuccess && <p className="text-sm text-emerald-300 m-0">{predictSuccess}</p>}
                  {predictError && <p className="text-sm text-error m-0">{predictError}</p>}
                </form>
              ) : (
                <p className="text-sm text-muted m-0">No entry — window closed for this round.</p>
              )}
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
                      {claimBusyItem === it.item_key ? 'Claiming…' : 'Claim'}
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
              <p className="m-0 font-medium">Shop chỉ dùng sau khi xác minh tài khoản</p>
              <p className="m-0 mt-1 text-xs text-amber-100/90">
                Chưa verified thì không mua được trên website (Shop / Pokémon Shop). Hãy gửi yêu cầu xác minh ở tab
                Account. Trừ admin.
              </p>
              <p className="m-0 mt-1 text-xs text-amber-100/75">
                Verified accounts only can purchase on the web shop; browse prices as usual.
              </p>
            </div>
          ) : null}

          <h2 className="text-lg font-medium text-[#e2e8f0] m-0 mb-3">Shop</h2>
          {shopDiscountPercent > 0 ? (
            <p className="text-sm text-emerald-300/95 m-0 mb-3">
              Rank discount: −{shopDiscountPercent}% on Cobble$ (item shop + Pokémon shop).
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
                    {shopBusyItem === item.itemKey ? 'Buying…' : 'Buy'}
                  </button>
                </div>
              ))}
            </div>
            {shopSuccess && <p className="text-sm text-emerald-300 mt-3 mb-0">{shopSuccess}</p>}
            {shopError && <p className="text-sm text-error mt-3 mb-0">{shopError}</p>}
          </div>

          <h2 className="text-lg font-medium text-[#e2e8f0] m-0 mb-3">Pokemon Shop (Shiny)</h2>
          <div className="mb-6 pixel-well p-4">
            <p className="text-sm text-muted m-0 mb-3">Refresh in: {pokemonCountdown}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {pokemonOffers.map((offer) => (
                <div key={offer.slot} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm text-[#e2e8f0] m-0">Shiny {displayItemName(offer.species)}</p>
                    <p className="text-xs text-muted m-0">
                      {offer.category.replace(/_/g, ' ')} ·{' '}
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
                      offer.purchased ||
                      pokemonBusy === `buy-${offer.slot}` ||
                      cobbleBalance < offer.price
                    }
                    className="shrink-0 py-2 px-3 pixel-btn-primary disabled:opacity-50 text-base"
                  >
                    {offer.purchased ? 'Purchased' : pokemonBusy === `buy-${offer.slot}` ? 'Buying…' : 'Buy'}
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
                        {p.shiny ? 'Shiny ' : ''}{displayItemName(p.species)}
                      </p>
                      <p className="text-xs text-muted m-0">
                        {new Date(p.purchasedAt).toLocaleString()} · {p.price.toLocaleString()} Cobble$
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
                        {pokemonBusy === `claim-${p.id}` ? 'Claiming…' : 'Claim'}
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
            Rank hiện tại:{' '}
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
              <p className="m-0 font-medium">Mua rank cần tài khoản đã xác minh</p>
              <p className="m-0 mt-1 text-xs text-amber-100/85">
                Verified accounts only can purchase ranks; you can still request staff-granted ranks below (pending
                review).
              </p>
            </div>
          ) : null}

          <h2 className="text-lg font-medium text-[#e2e8f0] m-0 mb-3">Mua rank (Cobble$)</h2>
          <p className="text-xs text-muted m-0 mb-3">
            Bên dưới là quyền lợi đang áp dụng cho rank của bạn. Các thẻ tiếp theo để xem hoặc mua nâng rank.
          </p>
          {roleCat ? (
            <div className="mb-4 rounded-lg border border-emerald-600/40 bg-emerald-950/25 px-3 py-2">
              <p className="text-[11px] font-medium text-emerald-200/95 m-0 mb-1">
                Quyền lợi của bạn —{' '}
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
          <p className="text-xs text-muted m-0 mb-3">Sau khi thanh toán, rank được cập nhật trong game sau vài giây.</p>
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
                      {rankBusyKey === entry.key ? 'Buying…' : 'Buy'}
                    </button>
                  </div>
                  <div className="w-full border-t border-border/45 pt-3">
                    <RolePerksSummary perks={entry.perks} />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted m-0">Không tải được danh sách rank (kiểm tra API / database).</p>
            )}
          </div>

          <h2 className="text-lg font-medium text-[#e2e8f0] m-0 mb-2">Rank chỉ admin cấp / xin cấp</h2>
          <p className="text-xs text-muted m-0 mb-3">
            Legend, Ultimate, Overlord, God và các rank staff/partner (Champion, Helper, Mod, TikTok, Youtuber, Builder) —
            không mua Cobble$ trên web. Gửi yêu cầu; staff duyệt sẽ cập nhật rank cho bạn.
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
                        Grant / request
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
                    {grantRolePick === g.key ? 'Đã chọn' : 'Chọn'}
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
                Đang chờ duyệt: <strong>{roleStatus.pending.requested_role}</strong> (gửi lúc{' '}
                {new Date(roleStatus.pending.created_at).toLocaleString()})
              </p>
            ) : (
              <form onSubmit={handleSubmitGrant} className="space-y-2">
                <label className="block text-sm text-[#e2e8f0]">
                  Rank đã chọn
                  <CustomSelect
                    value={grantRolePick}
                    onChange={(v) => setGrantRolePick(v)}
                    options={[
                      { value: '', label: '— Chọn ở danh sách trên hoặc tại đây —' },
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
                  Lời nhắn (tuỳ chọn)
                  <textarea
                    value={grantMessage}
                    onChange={(e) => setGrantMessage(e.target.value)}
                    rows={2}
                    className="mt-1 block w-full rounded border border-border bg-[#0f172a] px-2 py-2 text-base text-[#e2e8f0]"
                    placeholder="Ví dụ: link TikTok / lý do cần rank…"
                  />
                </label>
                <button
                  type="submit"
                  disabled={grantSubmitting || !grantRolePick || Boolean(roleStatus?.pending)}
                  className="py-2 px-4 pixel-btn-primary disabled:opacity-50"
                >
                  {grantSubmitting ? 'Sending…' : 'Gửi yêu cầu'}
                </button>
              </form>
            )}
            {roleStatus?.lastResolved ? (
              <p className="text-xs text-muted m-0 border-t border-border/60 pt-2">
                Gần nhất: {roleStatus.lastResolved.status} — {roleStatus.lastResolved.requested_role}
                {roleStatus.lastResolved.resolved_at
                  ? ` · ${new Date(roleStatus.lastResolved.resolved_at).toLocaleString()}`
                  : ''}
                {roleStatus.lastResolved.admin_note ? ` — Note: ${roleStatus.lastResolved.admin_note}` : ''}
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
              <h2 className="text-lg font-medium text-[#e2e8f0] m-0">Account verification (verified)</h2>
              <p className="text-xs text-muted m-0">
                Once approved, you receive the verified badge and can use AI analysis in Team Builder, buy items and
                Pokemon on the website, use gacha, and join the monthly tournament.
              </p>
              {vError && !vLoading && (
                <p className="text-sm text-red-400 m-0">
                  {vError}
                </p>
              )}
              {user?.is_admin ? (
                <p className="text-sm text-emerald-200/90 m-0">Admin accounts do not need to submit a request.</p>
              ) : vLoading ? (
                <p className="text-sm text-muted m-0">Đang tải trạng thái…</p>
              ) : vStatus?.verified || isAccountVerified(user) ? (
                <p className="text-sm text-emerald-200/90 m-0 flex flex-wrap items-center gap-2">
                  Tài khoản đã được xác minh.
                  <VerifiedAccountBadge className="w-5 h-5" />
                </p>
              ) : (
                <>
                  {vStatus?.pending ? (
                    <p className="text-sm text-amber-200/90 m-0">
                      Đã gửi yêu cầu · đang chờ quản trị viên ·{' '}
                      {new Date(vStatus.pending.created_at).toLocaleString('vi-VN')}
                      {vStatus.pending.message ? (
                        <span className="block mt-2 text-muted">Nội dung: {vStatus.pending.message}</span>
                      ) : null}
                    </p>
                  ) : null}
                  {vStatus?.lastResolved?.status === 'rejected' ? (
                    <div className="rounded-lg border border-red-500/30 bg-red-950/20 p-3 text-sm">
                      <p className="text-red-200/95 m-0 font-medium">Yêu cầu trước bị từ chối</p>
                      {vStatus.lastResolved.admin_note ? (
                        <p className="text-red-100/90 m-0 mt-2 text-xs">
                          Ghi chú: {vStatus.lastResolved.admin_note}
                        </p>
                      ) : null}
                      <p className="text-muted m-0 mt-2 text-xs">Bạn có thể gửi yêu cầu mới bên dưới.</p>
                    </div>
                  ) : null}
                  {!vStatus?.pending ? (
                    <form onSubmit={handleVerificationSubmit} className="space-y-2">
                      {vError ? (
                        <p className="text-sm text-red-400 m-0">{vError}</p>
                      ) : null}
                      <label htmlFor="verify-req-msg" className="block text-xs text-muted mb-1">
                        Lời nhắn (không bắt buộc)
                      </label>
                      <textarea
                        id="verify-req-msg"
                        value={vRequestNote}
                        onChange={(e) => setVRequestNote(e.target.value)}
                        rows={3}
                        maxLength={2000}
                        placeholder="Ví dụ: IGN trong game, Discord, minh chứng…"
                        className="w-full px-3 py-2 rounded-lg bg-[#0f0a1a] border border-border text-[#e2e8f0] text-sm"
                      />
                      <button
                        type="submit"
                        disabled={vSubmitting}
                        className="py-2 px-4 pixel-btn-primary disabled:opacity-50 text-base"
                      >
                        {vSubmitting ? 'Đang gửi…' : 'Gửi yêu cầu xác minh'}
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
          {submitting ? 'Updating…' : 'Update password'}
        </button>
          </form>
        </>
      )}
    </div>
  )
}
