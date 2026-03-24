import { useEffect, useState } from 'react'
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
  type DailyLoginStatus,
  type PokemonShopOffer,
  type PokemonShopPurchase,
  type UserPvpRank,
  type ShopItem,
} from '../authApi'
import { AuthModal } from './AuthModal'

export function Account() {
  type AccountTab = 'account' | 'daily' | 'shop' | 'inventory'
  const { isAuthenticated, user } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [daily, setDaily] = useState<DailyLoginStatus | null>(null)
  const [dailyLoading, setDailyLoading] = useState(false)
  const [dailyBusy, setDailyBusy] = useState(false)
  const [dailyError, setDailyError] = useState<string | null>(null)
  const [dailySuccess, setDailySuccess] = useState<string | null>(null)
  const [inventory, setInventory] = useState<{ item_key: string; quantity: number }[]>([])
  const [shopItems, setShopItems] = useState<ShopItem[]>([])
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

  const displayItemName = (key: string): string => {
    const map: Record<string, string> = {
      exp_candy_xl: 'EXP Candy XL',
      ancient_origin_ball: 'Ancient Origin Ball',
      origin_ball: 'Origin Ball',
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
    if (!isAuthenticated) return
    setDailyLoading(true)
    setDailyError(null)
    Promise.all([
      fetchDailyLoginStatus(),
      fetchUserInventory(),
      fetchShopItems(),
      fetchUserCurrencies(),
      fetchUserPvpRank(),
      fetchPokemonShopOffers(),
      fetchPokemonShopPurchases(20),
    ])
      .then(([d, inv, shop, currencies, pvpRank, pOffers, pPurchases]) => {
        setDaily(d)
        setInventory(inv.inventory ?? [])
        setShopItems(shop.items ?? [])
        setCobbleBalance(
          currencies.currencies.find((c) => c.currency_type === 'cobbledollars')?.balance ?? 0
        )
        setUserPvpRank(pvpRank)
        setPokemonOffers(pOffers.offers ?? [])
        setPokemonWindowEnd(pOffers.windowEnd ?? null)
        setPokemonPurchases(pPurchases.purchases ?? [])
      })
      .catch((e) => setDailyError(e instanceof Error ? e.message : 'Failed to load daily rewards'))
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
      <div className="max-w-lg mx-auto rounded-2xl bg-surface/80 border border-border p-8 text-center">
        <h1 className="text-2xl font-semibold text-[#e2e8f0] m-0 mb-2">Account</h1>
        <p className="text-muted text-sm mb-6">Log in to change your password.</p>
        <button
          type="button"
          onClick={() => setShowAuth(true)}
          className="py-2.5 px-6 rounded-xl bg-accent text-[#0f0a1a] font-semibold hover:bg-accent/90"
        >
          Log in
        </button>
        {showAuth && <AuthModal onClose={() => setShowAuth(false)} defaultMode="login" />}
      </div>
    )
  }

  const handleClaimDaily = async (e: React.FormEvent) => {
    e.preventDefault()
    setDailyError(null)
    setDailySuccess(null)
    setDailyBusy(true)
    try {
      const result = await claimDailyLoginReward()
      setDailySuccess(result.message)
      const [d, inv, currencies] = await Promise.all([
        fetchDailyLoginStatus(),
        fetchUserInventory(),
        fetchUserCurrencies(),
      ])
      setDaily(d)
      setInventory(inv.inventory ?? [])
      setCobbleBalance(currencies.currencies.find((c) => c.currency_type === 'cobbledollars')?.balance ?? 0)
    } catch (err) {
      setDailyError(err instanceof Error ? err.message : 'Claim failed')
    } finally {
      setDailyBusy(false)
    }
  }

  const handleBuyItem = async (item: ShopItem) => {
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
    setPokemonWindowEnd(offers.windowEnd ?? null)
    setPokemonPurchases(purchases.purchases ?? [])
  }

  const handleBuyPokemon = async (offer: PokemonShopOffer) => {
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

  return (
    <div className="max-w-lg mx-auto rounded-2xl bg-surface/80 border border-border p-6 sm:p-8">
      <h1 className="text-2xl font-semibold text-[#e2e8f0] m-0 mb-1">Account</h1>
      <p className="text-muted text-sm mb-6">
        Signed in as <span className="text-[#e2e8f0]">{user?.username}</span>
        <span className="block mt-1">
          PVP rank:{' '}
          <span className="text-[#e2e8f0]">
            {userPvpRank?.rank != null ? `#${userPvpRank.rank}` : 'Unranked'}
          </span>
        </span>
        {user?.email && (
          <span className="block mt-1 truncate" title={user.email}>
            {user.email}
          </span>
        )}
      </p>

      <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {([
          ['daily', 'Daily'],
          ['shop', 'Shop'],
          ['inventory', 'Inventory'],
          ['account', 'Account'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`rounded-lg px-3 py-2 text-sm font-medium border transition-colors ${
              activeTab === id
                ? 'bg-accent/20 text-accent border-accent/50'
                : 'bg-[#0f0a1a]/60 text-muted border-border hover:text-[#e2e8f0]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'daily' && (
        <>
          <h2 className="text-lg font-medium text-[#e2e8f0] m-0 mb-3">Daily streak rewards</h2>
          {dailyLoading ? (
            <p className="text-sm text-muted mb-6">Loading daily rewards…</p>
          ) : (
            <div className="mb-6 rounded-xl border border-border bg-[#0f0a1a]/50 p-4">
              <p className="text-sm text-muted m-0">
                Reset: 00:00 ({daily?.timeZone ?? 'Asia/Ho_Chi_Minh'}) · Date: {daily?.date ?? '—'}
              </p>
              <p className="text-sm text-violet-200 mt-2 mb-2">
                Next: Day {daily?.streak.nextDay ?? 1} · {daily?.streak.nextReward?.label ?? 'Reward'}
              </p>
              <p className={`text-sm mt-0 mb-3 ${daily?.eligible ? 'text-emerald-300' : 'text-amber-300'}`}>
                {daily?.eligible
                  ? 'Eligible today: you have been online at least once after reset.'
                  : 'Not eligible yet today. Join server first.'}
              </p>
              {daily?.claim?.status === 'success' ? (
                <p className="text-sm text-emerald-300 m-0">
                  Claimed today (Day {daily.claim.streakDay ?? '?'}) — {daily.claim.selectedReward ?? 'Reward'}
                </p>
              ) : (
                <form onSubmit={handleClaimDaily}>
                  <button
                    type="submit"
                    disabled={dailyBusy || !daily?.eligible}
                    className="py-2 px-4 rounded-lg bg-accent text-[#0f0a1a] font-semibold hover:bg-accent/90 disabled:opacity-50"
                  >
                    {dailyBusy ? 'Claiming…' : 'Claim daily reward'}
                  </button>
                </form>
              )}
              {dailySuccess && <p className="text-sm text-emerald-300 mt-3 mb-0">{dailySuccess}</p>}
              {dailyError && <p className="text-sm text-error mt-3 mb-0">{dailyError}</p>}
            </div>
          )}
        </>
      )}

      {activeTab === 'inventory' && (
        <>
          <h2 className="text-lg font-medium text-[#e2e8f0] m-0 mb-3">Website inventory</h2>
          <div className="mb-6 rounded-xl border border-border bg-[#0f0a1a]/50 p-4">
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
                      className="shrink-0 py-1.5 px-3 rounded-lg bg-accent text-[#0f0a1a] font-semibold hover:bg-accent/90 disabled:opacity-50 text-sm"
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
                  {displayItemName(it.item_key)} claimed to server at{' '}
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

          <h2 className="text-lg font-medium text-[#e2e8f0] m-0 mb-3">Shop</h2>
          <div className="mb-6 rounded-xl border border-border bg-[#0f0a1a]/50 p-4">
            <div className="space-y-2">
              {shopItems.map((item) => (
                <div key={item.itemKey} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm text-[#e2e8f0] m-0">{item.label}</p>
                    <p className="text-xs text-muted m-0">Cost: {item.cost.toLocaleString()} Cobble$</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleBuyItem(item)}
                    disabled={shopBusyItem === item.itemKey || cobbleBalance < item.cost}
                    className="shrink-0 py-1.5 px-3 rounded-lg bg-accent text-[#0f0a1a] font-semibold hover:bg-accent/90 disabled:opacity-50 text-sm"
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
          <div className="mb-6 rounded-xl border border-border bg-[#0f0a1a]/50 p-4">
            <p className="text-sm text-muted m-0 mb-3">Refresh in: {pokemonCountdown}</p>
            <div className="space-y-2">
              {pokemonOffers.map((offer) => (
                <div key={offer.slot} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm text-[#e2e8f0] m-0">Shiny {displayItemName(offer.species)}</p>
                    <p className="text-xs text-muted m-0">
                      {offer.category.replace(/_/g, ' ')} · {offer.price.toLocaleString()} Cobble$
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleBuyPokemon(offer)}
                    disabled={offer.purchased || pokemonBusy === `buy-${offer.slot}` || cobbleBalance < offer.price}
                    className="shrink-0 py-1.5 px-3 rounded-lg bg-accent text-[#0f0a1a] font-semibold hover:bg-accent/90 disabled:opacity-50 text-sm"
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
                          {displayItemName(p.species)} claimed to server at{' '}
                          {new Date(pokemonClaimedToServerAt[p.id] ?? p.claimedAt ?? '').toLocaleTimeString()}.
                        </p>
                      )}
                    </div>
                    {p.claimedAt ? null : (
                      <button
                        type="button"
                        onClick={() => handleClaimPokemon(p.id)}
                        disabled={pokemonBusy === `claim-${p.id}`}
                        className="shrink-0 py-1.5 px-3 rounded-lg bg-accent text-[#0f0a1a] font-semibold hover:bg-accent/90 disabled:opacity-50 text-sm"
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

      {activeTab === 'account' && (
        <>
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
          className="w-full sm:w-auto py-2.5 px-6 rounded-xl bg-accent text-[#0f0a1a] font-semibold hover:bg-accent/90 disabled:opacity-50"
        >
          {submitting ? 'Updating…' : 'Update password'}
        </button>
          </form>
        </>
      )}
    </div>
  )
}
