import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  fetchGachaPools,
  fetchPoolCurrency,
  fetchPoolRewards,
  fetchGachaHistory,
  gachaPull,
  fetchExchangeRates,
  exchangeTickets,
  fetchUserCurrencies,
  type GachaPool,
  type GachaRewardResult,
  type PoolReward,
  type GachaHistoryEntry,
  type ExchangeRate,
} from '../authApi'
import { AuthModal } from './AuthModal'

const CHEST_OPEN_MS = 1800
const REWARD_REVEAL_MS = 500

function getRarity(weight: number, totalWeight: number): { label: string; className: string } {
  const pct = totalWeight > 0 ? (weight / totalWeight) * 100 : 0
  if (pct < 1) return { label: 'Super Rare', className: 'bg-red-500/25 text-red-300 border-red-400/50' }
  if (weight <= 2) return { label: 'Very Rare', className: 'bg-netherite/30 text-netherite border-netherite/50' }
  if (weight <= 5) return { label: 'Rare', className: 'bg-gold/20 text-gold border-gold/50' }
  if (weight <= 10) return { label: 'Uncommon', className: 'bg-emerald/20 text-emerald border-emerald/50' }
  return { label: 'Common', className: 'bg-muted/20 text-muted border-border' }
}

export function Gacha() {
  const { isAuthenticated } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  const [pools, setPools] = useState<GachaPool[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPool, setSelectedPool] = useState<GachaPool | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const [pulling, setPulling] = useState(false)
  const [lastReward, setLastReward] = useState<GachaRewardResult | null>(null)
  const [chestPhase, setChestPhase] = useState<'idle' | 'opening' | 'reveal'>('idle')
  const [poolRewards, setPoolRewards] = useState<PoolReward[]>([])
  const [history, setHistory] = useState<GachaHistoryEntry[]>([])
  const [exchangeRates, setExchangeRates] = useState<ExchangeRate[]>([])
  const [currencies, setCurrencies] = useState<{ currency_type: string; balance: number }[]>([])
  const [exchanging, setExchanging] = useState<string | null>(null)
  const openStartRef = useRef(0)
  const pendingRewardRef = useRef<GachaRewardResult | null>(null)
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    if (!isAuthenticated) return
    fetchGachaPools()
      .then(({ pools: p }) => setPools(p))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load pools'))
      .finally(() => setLoading(false))
  }, [isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated || !selectedPool) {
      setBalance(null)
      setPoolRewards([])
      return
    }
    fetchPoolCurrency(selectedPool.id)
      .then(({ balance: b }) => setBalance(b))
      .catch(() => setBalance(0))
    fetchPoolRewards(selectedPool.id)
      .then(({ rewards }) => setPoolRewards(rewards))
      .catch(() => setPoolRewards([]))
  }, [isAuthenticated, selectedPool])

  useEffect(() => {
    if (!isAuthenticated) return
    fetchGachaHistory(30)
      .then(({ history: h }) => setHistory(h))
      .catch(() => setHistory([]))
  }, [isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated) return
    fetchExchangeRates().then(({ rates }) => setExchangeRates(rates)).catch(() => setExchangeRates([]))
    fetchUserCurrencies().then(({ currencies: c }) => setCurrencies(c)).catch(() => setCurrencies([]))
  }, [isAuthenticated])

  const refetchCurrencies = () => {
    fetchUserCurrencies().then(({ currencies: c }) => setCurrencies(c)).catch(() => {})
    if (selectedPool) {
      fetchPoolCurrency(selectedPool.id).then(({ balance: b }) => setBalance(b)).catch(() => {})
    }
  }

  const handleExchange = async (toCurrency: string) => {
    if (exchanging) return
    setExchanging(toCurrency)
    setError(null)
    try {
      await exchangeTickets(toCurrency)
      refetchCurrencies()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Exchange failed')
    } finally {
      setExchanging(null)
    }
  }

  const triggerReveal = () => {
    const result = pendingRewardRef.current
    if (result) {
      setLastReward(result)
      setBalance(result.newBalance)
    }
    setChestPhase('reveal')
    const t = setTimeout(() => setChestPhase('idle'), REWARD_REVEAL_MS)
    timeoutsRef.current.push(t)
  }

  useEffect(() => {
    return () => timeoutsRef.current.forEach(clearTimeout)
  }, [])

  const handlePull = async () => {
    if (!selectedPool || pulling || chestPhase !== 'idle') return
    setError(null)
    setLastReward(null)
    setPulling(true)
    setChestPhase('opening')
    pendingRewardRef.current = null
    openStartRef.current = Date.now()

    const minOpenT = setTimeout(() => {
      if (pendingRewardRef.current != null) triggerReveal()
    }, CHEST_OPEN_MS)
    timeoutsRef.current.push(minOpenT)

    try {
      const result = await gachaPull(selectedPool.id)
      pendingRewardRef.current = result
      fetchGachaHistory(30).then(({ history: h }) => setHistory(h)).catch(() => {})
      const elapsed = Date.now() - openStartRef.current
      if (elapsed >= CHEST_OPEN_MS) triggerReveal()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pull failed')
      setChestPhase('idle')
      setPulling(false)
    } finally {
      setPulling(false)
    }
  }

  const cost = selectedPool?.config && typeof (selectedPool.config as { cost?: number }).cost === 'number'
    ? (selectedPool.config as { cost: number }).cost
    : 100
  const currencyType = (selectedPool?.config as { currency_type?: string } | undefined)?.currency_type ?? 'gems'

  if (!isAuthenticated) {
    return (
      <>
        <div className="w-full max-w-2xl mx-auto py-8 sm:py-12 px-4">
          <div className="rounded-2xl bg-surface/80 border border-border p-8 sm:p-10 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-[#e2e8f0] mb-2">Log in to use Gacha</h2>
            <p className="text-muted mb-6 max-w-sm mx-auto">
              Sign in or create an account to open loot and collect rewards.
            </p>
            <button
              type="button"
              onClick={() => setShowAuth(true)}
              className="px-6 py-3 rounded-xl bg-accent text-[#0f0a1a] font-semibold hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-[#0f0a1a]"
            >
              Log in / Sign up
            </button>
          </div>
        </div>
        {showAuth && <AuthModal onClose={() => setShowAuth(false)} defaultMode="login" />}
      </>
    )
  }

  return (
    <div className="w-full max-w-2xl mx-auto py-6 sm:py-10 px-4">
      <h1 className="text-2xl font-bold text-[#e2e8f0] mb-6">Gacha</h1>

      {loading && (
        <p className="text-muted text-center py-8">Loading pools…</p>
      )}
      {error && (
        <div className="mb-4 p-4 rounded-xl bg-error/15 border border-error/30 text-error text-sm">
          {error}
        </div>
      )}

      {!loading && pools.length === 0 && !error && (
        <div className="rounded-2xl bg-surface/80 border border-border p-8 text-center text-muted">
          No gacha pools available yet. Check back later!
        </div>
      )}

      {!loading && pools.length > 0 && (
        <div className="space-y-6">
          {exchangeRates.length > 0 && (
            <div className="rounded-2xl bg-surface/80 border border-border p-4 sm:p-6">
              <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">Exchange tickets</h3>
              <div className="mb-4">
                <p className="text-xs text-muted uppercase tracking-wider mb-2">Your currencies</p>
                <div className="flex flex-wrap gap-2">
                  {currencies.length === 0 ? (
                    <span className="text-sm text-muted">No currency yet</span>
                  ) : (
                    currencies.map((c) => (
                      <span
                        key={c.currency_type}
                        className="inline-flex items-center px-3 py-1.5 rounded-lg bg-[#0f0a1a]/50 border border-border/50 text-sm"
                      >
                        <span className="text-muted">{c.currency_type.replace(/_/g, ' ')}:</span>
                        <span className="ml-1.5 font-medium text-[#e2e8f0]">{c.balance}</span>
                      </span>
                    ))
                  )}
                </div>
              </div>
              <ul className="space-y-2">
                {exchangeRates.map((rate) => {
                  const ticketsBalance = currencies.find((c) => c.currency_type === 'tickets')?.balance ?? 0
                  const canAfford = ticketsBalance >= rate.cost_tickets
                  const busy = exchanging === rate.to_currency
                  return (
                    <li key={rate.to_currency} className="flex flex-wrap items-center justify-between gap-3 py-2 px-3 rounded-lg bg-[#0f0a1a]/50 border border-border/50">
                      <span className="text-[#e2e8f0] text-sm">
                        {rate.cost_tickets} tickets → <span className="font-medium text-accent">{rate.label}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleExchange(rate.to_currency)}
                        disabled={!canAfford || !!exchanging}
                        className="px-3 py-1.5 rounded-lg bg-accent/20 text-accent text-sm font-medium border border-accent/40 hover:bg-accent/30 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {busy ? '…' : 'Exchange'}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {pools.map((pool) => (
              <button
                key={pool.id}
                type="button"
                onClick={() => { setSelectedPool(pool); setLastReward(null); }}
                className={`text-left p-4 rounded-xl border transition-all touch-manipulation ${
                  selectedPool?.id === pool.id
                    ? 'bg-surface-hover border-accent/60 ring-2 ring-accent/30'
                    : 'bg-surface/80 border-border hover:border-accent/40'
                }`}
              >
                <span className="font-semibold text-[#e2e8f0]">{pool.name}</span>
                <span className="block text-sm text-muted mt-0.5">{pool.type || 'Open loot'}</span>
              </button>
            ))}
          </div>

          {selectedPool && (
            <div className="rounded-2xl bg-surface/80 border border-border p-6 sm:p-8">
              <h2 className="text-lg font-semibold text-[#e2e8f0] mb-4">{selectedPool.name}</h2>
              <p className="text-muted text-sm mb-4">
                Cost: <span className="text-accent font-medium">{cost} {currencyType}</span> per pull
                {balance !== null && (
                  <> · Your balance: <span className="text-[#e2e8f0]">{balance} {currencyType}</span></>
                )}
              </p>
              <button
                type="button"
                onClick={handlePull}
                disabled={pulling || chestPhase !== 'idle' || (balance !== null && balance < cost)}
                className="w-full sm:w-auto min-w-[180px] py-3 px-6 rounded-xl bg-accent text-[#0f0a1a] font-semibold hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface transition-colors touch-manipulation"
              >
                {chestPhase !== 'idle' || pulling ? 'Opening…' : 'Open chest'}
              </button>

              {poolRewards.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">Rates (this banner)</h3>
                  <ul className="space-y-2">
                    {(() => {
                      const totalWeight = poolRewards.reduce((s, r) => s + r.weight, 0)
                      return poolRewards.map((r) => {
                      const { label, className } = getRarity(r.weight, totalWeight)
                      return (
                        <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 px-3 rounded-lg bg-[#0f0a1a]/50 border border-border/50">
                          <span className="text-[#e2e8f0] text-sm">{r.reward_type}</span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded border ${className}`}>{label}</span>
                        </li>
                      )
                    })
                    })()}
                  </ul>
                </div>
              )}

              {/* Chest open overlay */}
              {(chestPhase === 'opening' || chestPhase === 'reveal') && (
                <div
                  className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm px-4"
                  aria-hidden="true"
                >
                  {chestPhase === 'opening' && (
                    <div className="gacha-chest-glow flex flex-col items-center">
                      <div className="gacha-chest-wrap gacha-chest-shake relative w-48 h-32 sm:w-64 sm:h-40">
                        {/* Golden light beam when lid opens */}
                        <div
                          className="absolute inset-0 pointer-events-none gacha-chest-beam"
                          style={{
                            background: 'radial-gradient(ellipse 80% 60% at 50% 45%, rgba(201, 162, 39, 0.4) 0%, transparent 70%)',
                          }}
                          aria-hidden
                        />
                        <svg
                          viewBox="0 0 160 100"
                          className="absolute inset-0 w-full h-full"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <defs>
                            <linearGradient id="chest-wood" x1="0%" y1="0%" x2="0%" y2="100%">
                              <stop offset="0%" stopColor="#7a5c2e" />
                              <stop offset="35%" stopColor="#a67c4a" />
                              <stop offset="100%" stopColor="#5c3d1e" />
                            </linearGradient>
                            <linearGradient id="chest-lid-wood" x1="0%" y1="0%" x2="0%" y2="100%">
                              <stop offset="0%" stopColor="#8b6914" />
                              <stop offset="50%" stopColor="#b8862e" />
                              <stop offset="100%" stopColor="#6b4423" />
                            </linearGradient>
                            <linearGradient id="chest-metal" x1="0%" y1="0%" x2="0%" y2="100%">
                              <stop offset="0%" stopColor="#d4af37" />
                              <stop offset="30%" stopColor="#c9a227" />
                              <stop offset="100%" stopColor="#8b6914" />
                            </linearGradient>
                            <filter id="chest-shadow" x="-20%" y="-20%" width="140%" height="140%">
                              <feDropShadow dx="0" dy="4" stdDeviation="3" floodOpacity="0.35" />
                            </filter>
                          </defs>
                          {/* Body – rounded box */}
                          <rect
                            x="26"
                            y="52"
                            width="108"
                            height="38"
                            rx="6"
                            ry="6"
                            fill="url(#chest-wood)"
                            stroke="#4a3520"
                            strokeWidth="2"
                            filter="url(#chest-shadow)"
                          />
                          {/* Metal bands on body */}
                          <path d="M28 62h104" stroke="url(#chest-metal)" strokeWidth="4" strokeLinecap="round" />
                          <path d="M28 78h104" stroke="url(#chest-metal)" strokeWidth="4" strokeLinecap="round" />
                          <rect x="48" y="52" width="8" height="36" rx="2" fill="url(#chest-metal)" stroke="#8b6914" strokeWidth="1" />
                          <rect x="104" y="52" width="8" height="36" rx="2" fill="url(#chest-metal)" stroke="#8b6914" strokeWidth="1" />
                          {/* Lid – arched top, opens upward */}
                          <g className="gacha-chest-lid-open">
                            <path
                              d="M32 52 L32 28 Q80 8 128 28 L128 52 Z"
                              fill="url(#chest-lid-wood)"
                              stroke="#4a3520"
                              strokeWidth="2"
                            />
                            <path d="M38 52 L38 34 Q80 18 122 34 L122 52" stroke="url(#chest-metal)" strokeWidth="3" fill="none" strokeLinecap="round" />
                          </g>
                          {/* Lock – disappears before lid opens */}
                          <g className="gacha-chest-lock-hide">
                            <rect x="72" y="44" width="16" height="14" rx="3" fill="url(#chest-metal)" stroke="#8b6914" strokeWidth="1.5" />
                            <circle cx="80" cy="52" r="2" fill="#2a1810" />
                          </g>
                        </svg>
                      </div>
                      <p className="text-muted mt-6 text-sm font-medium">Opening chest...</p>
                    </div>
                  )}
                  {chestPhase === 'reveal' && lastReward && (
                    <div className="gacha-reward-pop gacha-reward-shine rounded-2xl bg-surface border-2 border-accent/60 p-6 sm:p-8 text-center max-w-sm shadow-[0_0_40px_rgba(167,139,250,0.35)]">
                      <p className="text-accent font-semibold text-sm uppercase tracking-wider mb-2">You got</p>
                      <p className="text-xl sm:text-2xl font-bold text-[#e2e8f0]">{lastReward.reward.reward_type}</p>
                      <p className="text-muted text-sm mt-3">Balance: {lastReward.newBalance} {currencyType}</p>
                    </div>
                  )}
                </div>
              )}

              {lastReward && chestPhase === 'idle' && (
                <div className="mt-6 p-4 rounded-xl bg-accent/10 border border-accent/30">
                  <p className="text-sm text-muted mb-2">You got:</p>
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="text-[#e2e8f0] font-medium">{lastReward.reward.reward_type}</span>
                    <span className="text-muted text-sm">New balance: {lastReward.newBalance} {currencyType}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {isAuthenticated && (
            <div className="mt-8 rounded-2xl bg-surface/80 border border-border p-4 sm:p-6">
              <h3 className="text-lg font-semibold text-[#e2e8f0] mb-3">Your pull history</h3>
              {history.length === 0 ? (
                <p className="text-muted text-sm">No pulls yet. Open a chest to see your rewards here.</p>
              ) : (
                <ul className="space-y-2 max-h-64 overflow-y-auto">
                  {history.map((entry) => (
                    <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2 px-3 rounded-lg bg-[#0f0a1a]/50 border border-border/50 text-sm">
                      <span className="text-[#e2e8f0]">{entry.rewardType}</span>
                      <span className="text-muted text-xs">
                        {entry.poolName} · {new Date(entry.pulledAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
