import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  fetchGachaPools,
  fetchPoolCurrency,
  gachaPull,
  type GachaPool,
  type GachaRewardResult,
} from '../authApi'
import { AuthModal } from './AuthModal'

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
      return
    }
    fetchPoolCurrency(selectedPool.id)
      .then(({ balance: b }) => setBalance(b))
      .catch(() => setBalance(0))
  }, [isAuthenticated, selectedPool])

  const handlePull = async () => {
    if (!selectedPool || pulling) return
    setPulling(true)
    setLastReward(null)
    try {
      const result = await gachaPull(selectedPool.id)
      setLastReward(result)
      setBalance(result.newBalance)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pull failed')
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
                disabled={pulling || (balance !== null && balance < cost)}
                className="w-full sm:w-auto min-w-[180px] py-3 px-6 rounded-xl bg-accent text-[#0f0a1a] font-semibold hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface transition-colors touch-manipulation"
              >
                {pulling ? 'Opening…' : 'Open loot'}
              </button>

              {lastReward && (
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
        </div>
      )}
    </div>
  )
}
