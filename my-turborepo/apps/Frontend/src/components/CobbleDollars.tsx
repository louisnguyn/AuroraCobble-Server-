import { useCallback, useEffect, useState } from 'react'
import { fetchCobbleDollarsLeaderboard } from '../api'
import type { CobbleDollarsLeaderboardResponse } from '../types'
import { useAuth } from '../contexts/AuthContext'
import { depositCobbledollars, fetchUserCurrencies } from '../authApi'

export function CobbleDollars() {
  const { isAuthenticated } = useAuth()
  const [data, setData] = useState<CobbleDollarsLeaderboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [walletBalance, setWalletBalance] = useState<number | null>(null)
  const [walletLoading, setWalletLoading] = useState(false)
  const [depositAmount, setDepositAmount] = useState('')
  const [depositBusy, setDepositBusy] = useState(false)
  const [depositError, setDepositError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchCobbleDollarsLeaderboard()
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const loadWallet = useCallback(() => {
    if (!isAuthenticated) {
      setWalletBalance(null)
      return
    }
    setWalletLoading(true)
    fetchUserCurrencies()
      .then(({ currencies }) => {
        const row = currencies.find((c) => c.currency_type === 'cobbledollars')
        setWalletBalance(row?.balance ?? 0)
      })
      .catch(() => setWalletBalance(null))
      .finally(() => setWalletLoading(false))
  }, [isAuthenticated])

  useEffect(() => {
    loadWallet()
  }, [loadWallet])

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault()
    setDepositError(null)
    const n = parseInt(depositAmount.replace(/,/g, ''), 10)
    if (!Number.isFinite(n) || n < 1) {
      setDepositError('Enter a whole number ≥ 1.')
      return
    }
    setDepositBusy(true)
    try {
      const { newBalance } = await depositCobbledollars(n)
      setWalletBalance(newBalance)
      setDepositAmount('')
    } catch (err) {
      setDepositError(err instanceof Error ? err.message : 'Deposit failed')
    } finally {
      setDepositBusy(false)
    }
  }

  const panelClass = 'p-8 text-center rounded-lg bg-surface border border-border'

  if (loading) return <div className={panelClass}>Loading Cobble$ leaderboard…</div>
  if (error) return <div className={`${panelClass} text-error`}>Error: {error}</div>
  if (!data) return <div className={panelClass}>No data.</div>

  return (
    <div className="w-full max-w-xl mx-auto space-y-10">
      {isAuthenticated && (
        <section className="rounded-xl border border-border bg-surface/80 p-5 sm:p-6 text-left">
          <h2 className="text-lg font-semibold m-0 mb-1 text-[#e2e8f0]">Your website Cobble$</h2>
          <p className="text-sm text-muted m-0 mb-4">
            Earn Cobble$ on the site (rewards, grants, etc.), then deposit into your in-game balance. Your
            site username must match your Minecraft name.
          </p>
          {walletLoading ? (
            <p className="text-sm text-muted m-0">Loading wallet…</p>
          ) : (
            <>
              <p className="text-2xl font-bold tabular-nums text-[#fbbf24] m-0 mb-4">
                {walletBalance != null ? Number(walletBalance).toLocaleString() : '—'}
              </p>
              <form onSubmit={handleDeposit} className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
                <label className="flex-1 min-w-0">
                  <span className="block text-xs text-muted mb-1">Deposit amount</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9,]*"
                    value={depositAmount}
                    onChange={(ev) => setDepositAmount(ev.target.value)}
                    placeholder="e.g. 5000"
                    className="w-full rounded-lg border border-border bg-[#0f0a1a]/80 px-3 py-2 text-[#e2e8f0] text-sm"
                    disabled={depositBusy}
                  />
                </label>
                <button
                  type="submit"
                  disabled={depositBusy || walletBalance == null || walletBalance < 1}
                  className="shrink-0 rounded-lg px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 border border-white/10 disabled:opacity-50"
                >
                  {depositBusy ? 'Depositing…' : 'Deposit to server'}
                </button>
              </form>
              {depositError && <p className="text-sm text-error m-0 mt-3">{depositError}</p>}
            </>
          )}
        </section>
      )}

      {!isAuthenticated && (
        <p className="text-sm text-muted text-center m-0">
          Log in to see your website Cobble$ balance and send it to the Minecraft server.
        </p>
      )}

      {data.disabled ? (
        <div className="p-8 text-center rounded-lg bg-surface border border-border text-muted">
          Cobble$ leaderboard is not available on this site right now.
        </div>
      ) : data.error ? (
        <div className="p-8 text-center rounded-lg bg-surface border border-border text-error text-sm">
          Could not load server balances: {data.error}
        </div>
      ) : data.top10.length === 0 ? (
        <div className="p-8 text-center rounded-lg bg-surface border border-border text-muted">
          No Cobble$ balances returned yet. Play on the server to appear on the leaderboard.
        </div>
      ) : (
        <>
          <header className="mb-6">
            <h1 className="text-2xl font-semibold m-0 mb-1 text-[#e2e8f0]">Cobble$ top 10</h1>
            <p className="text-sm text-muted m-0">
              Richest players on the Minecraft server (from the in-game CobbleDollars leaderboard).
            </p>
            {data.updatedAt && (
              <p className="text-xs text-muted/80 m-0 mt-2">
                Last refreshed: {new Date(data.updatedAt).toLocaleString()} · updates about every ~90 seconds here
              </p>
            )}
          </header>

          <ol className="list-none m-0 p-0 space-y-2">
            {data.top10.map((row, i) => (
              <li
                key={`${row.name}-${row.balance}-${i}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface/80 px-4 py-3"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-sm font-bold tabular-nums text-accent">
                    {i + 1}
                  </span>
                  <span className="font-mono text-sm text-[#e2e8f0] truncate" title={row.name}>
                    {row.name}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-[#fbbf24]">
                  {Number(row.balance).toLocaleString()}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}
