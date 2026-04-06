import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  depositCobbledollars,
  fetchCobbledollarsLedger,
  fetchUserCurrencies,
  type CobbledollarLedgerRow,
} from '../authApi'

const LEDGER_KIND_LABEL: Record<string, string> = {
  deposit_to_server: 'Deposit to Minecraft',
  shop: 'Item shop',
  pokemon_shop: 'Shiny Pokémon shop',
  daily_login: 'Daily streak',
  pvp_rank_daily: 'PvP rank reward',
  pvp_prediction_stake: 'PVP top-3 prediction (stake)',
  pvp_prediction_win: 'PVP top-3 prediction (win)',
  admin_grant: 'Staff grant',
}

/**
 * Website Cobble$ wallet: balance, deposit to server, recent ledger (Account → C$ balance).
 */
export function CobbleWebsiteWallet({ onBalanceUpdated }: { onBalanceUpdated?: () => void }) {
  const { isAuthenticated } = useAuth()
  const [walletBalance, setWalletBalance] = useState<number | null>(null)
  const [walletLoading, setWalletLoading] = useState(false)
  const [depositAmount, setDepositAmount] = useState('')
  const [depositBusy, setDepositBusy] = useState(false)
  const [depositError, setDepositError] = useState<string | null>(null)
  const [ledger, setLedger] = useState<CobbledollarLedgerRow[]>([])
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [ledgerError, setLedgerError] = useState<string | null>(null)

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

  const loadLedger = useCallback(() => {
    if (!isAuthenticated) {
      setLedger([])
      return
    }
    setLedgerLoading(true)
    setLedgerError(null)
    fetchCobbledollarsLedger(10)
      .then(({ transactions }) => setLedger(transactions ?? []))
      .catch((e) => {
        setLedger([])
        setLedgerError(e instanceof Error ? e.message : 'Could not load history')
      })
      .finally(() => setLedgerLoading(false))
  }, [isAuthenticated])

  useEffect(() => {
    loadWallet()
  }, [loadWallet])

  useEffect(() => {
    loadLedger()
  }, [loadLedger])

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
      void loadLedger()
      onBalanceUpdated?.()
    } catch (err) {
      setDepositError(err instanceof Error ? err.message : 'Deposit failed')
    } finally {
      setDepositBusy(false)
    }
  }

  if (!isAuthenticated) return null

  return (
    <section className="pixel-well p-5 sm:p-6 text-left">
      <h2 className="text-lg font-semibold m-0 mb-1 text-[#e2e8f0]">C$ balance</h2>
      <p className="text-sm text-muted m-0 mb-4">
        Website Cobble$ — earn on the site, then deposit into your in-game balance. Your site username must match
        your Minecraft name.
      </p>
      {walletLoading ? (
        <p className="text-sm text-muted m-0">Loading balance…</p>
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
                className="w-full pixel-field px-3 py-2.5 text-[#e2e8f0] text-base"
                disabled={depositBusy}
              />
            </label>
            <button
              type="submit"
              disabled={depositBusy || walletBalance == null || walletBalance < 1}
              className="shrink-0 px-4 py-2.5 pixel-btn-primary text-base disabled:opacity-50"
            >
              {depositBusy ? 'Depositing…' : 'Deposit to server'}
            </button>
          </form>
          {depositError && <p className="text-sm text-error m-0 mt-3">{depositError}</p>}

          <div className="mt-6 pt-5 border-t border-border/80">
            <h3 className="text-sm font-semibold text-[#e2e8f0] m-0 mb-2">Recent activity</h3>
            <p className="text-xs text-muted m-0 mb-3">Last 10 website Cobble$ changes (newest first).</p>
            {ledgerLoading ? (
              <p className="text-xs text-muted m-0">Loading history…</p>
            ) : ledgerError ? (
              <p className="text-xs text-error m-0">{ledgerError}</p>
            ) : ledger.length === 0 ? (
              <p className="text-xs text-muted m-0">
                No entries yet. Deposits, shop purchases, and rewards will appear here when recorded.
              </p>
            ) : (
              <ul className="list-none m-0 p-0 space-y-2 max-h-72 overflow-y-auto pr-1">
                {ledger.map((tx) => {
                  const sign = tx.delta >= 0 ? '+' : ''
                  const label = LEDGER_KIND_LABEL[tx.kind] ?? tx.kind.replace(/_/g, ' ')
                  return (
                    <li
                      key={tx.id}
                      className="rounded-lg border border-border/60 bg-[#0f0a1a]/50 px-3 py-2 text-left text-xs"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-[#e2e8f0] font-medium">{label}</span>
                        <span
                          className={`tabular-nums font-semibold shrink-0 ${
                            tx.delta >= 0 ? 'text-emerald-400' : 'text-rose-300'
                          }`}
                        >
                          {sign}
                          {Number(tx.delta).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 mt-1 text-muted">
                        <span className="truncate" title={tx.detail ?? undefined}>
                          {tx.detail || '—'}
                        </span>
                        <span className="tabular-nums shrink-0 text-[#fbbf24]/90">
                          Bal. {Number(tx.balance_after).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted/80 m-0 mt-1">
                        {new Date(tx.created_at).toLocaleString()}
                      </p>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  )
}
