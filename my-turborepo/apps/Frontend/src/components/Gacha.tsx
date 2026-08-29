import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  fetchGachaPools,
  fetchPoolCurrency,
  fetchPoolRewards,
  fetchGachaHistory,
  gachaPull,
  claimGachaPull,
  fetchUserCurrencies,
  type GachaPool,
  type GachaRewardResult,
  type PoolReward,
  type GachaHistoryEntry,
} from '../authApi'
import { AuthModal } from './AuthModal'
import { isAccountVerified, VerifiedAccountBadge } from './VerifiedAccountBadge.tsx'
import { PageHeader, PageShell } from './PageLayout.tsx'
import {
  showdownSpriteFallbackUrls,
} from '../pokemonApi'
import { usePokemonSpriteSrc } from '../usePokemonSpriteSrc'

type GachaSpeciesSpriteUrls = { urls: string[]; slug: string }

/** Min time on “rolling” before the strip appears (feels fair even on fast API). */
const MIN_LOOT_MS = 2200
/** Seconds for the horizontal ease-out roll (CS:GO-style). */
const GACHA_SPIN_SEC = 8.8
const GACHA_ITEM_WIDTH_PX = 120
const GACHA_ITEM_GAP_PX = 8
const GACHA_ITEM_STRIDE = GACHA_ITEM_WIDTH_PX + GACHA_ITEM_GAP_PX

function stripMinecraftFormatting(value: string): string {
  return value.replace(/§[0-9a-fk-or]/gi, '').trim()
}

function parseCobbledollarsRewardLabel(label: string): number | null {
  const m = /^(?:asterynpoints|cobbledollars)\s*:\s*([0-9]{1,13})$/i.exec(stripMinecraftFormatting(label))
  if (!m) return null
  const amount = parseInt(m[1] ?? '', 10)
  if (!Number.isInteger(amount) || amount < 1) return null
  return amount
}

/**
 * Showdown Gen 5 pixel PNG + slug for HOME / PokéAPI fallback.
 * Shiny when the label contains the word "shiny" (case-insensitive).
 */
function gachaShowdownSpriteUrls(rawLabel: string): GachaSpeciesSpriteUrls | null {
  const label = stripMinecraftFormatting(rawLabel).trim()
  if (!label || label.startsWith('item|') || label.startsWith('currency|')) return null
  const shiny = /\bshiny\b/i.test(label)
  const base = label.replace(/\bshiny\b/gi, ' ').replace(/\s+/g, ' ').trim()
  if (!base) return null
  const slug = base
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  if (!slug) return null
  if (shiny) {
    return {
      urls: showdownSpriteFallbackUrls(slug, { shiny: true }),
      slug,
    }
  }
  return {
    urls: showdownSpriteFallbackUrls(slug),
    slug,
  }
}

function GachaStripSprite({
  label,
  urls,
  imgClassName,
}: {
  label: string
  urls: GachaSpeciesSpriteUrls | null
  imgClassName?: string
}) {
  const display = formatGachaRewardLabel(label)
  const [showText, setShowText] = useState(!urls)
  const { src, onError } = usePokemonSpriteSrc(urls?.slug ?? '', {
    urls: urls?.urls,
    onExhausted: () => setShowText(true),
  })

  useEffect(() => {
    setShowText(!urls)
  }, [urls])

  if (!urls || showText) {
    return <span className="gacha-strip-fallback">{display}</span>
  }

  return (
    <img
      src={src ?? urls.urls[0]}
      alt={display}
      className={imgClassName}
      draggable={false}
      onError={onError}
    />
  )
}

function buildLootStrip(winType: string, pool: PoolReward[]): { items: string[]; winIndex: number } {
  const types = pool.length > 0 ? pool.map((r) => r.reward_type) : [winType]
  const winIndex = 22 + Math.floor(Math.random() * 14)
  const items: string[] = []
  for (let i = 0; i < winIndex; i++) {
    items.push(types[Math.floor(Math.random() * types.length)]!)
  }
  items.push(winType)
  for (let k = 0; k < 20; k++) {
    items.push(types[Math.floor(Math.random() * types.length)]!)
  }
  return { items, winIndex }
}

function stripRarityClass(label: string, pool: PoolReward[], totalWeight: number): string {
  const key = gachaMatchKey(label)
  const row = pool.find((r) => gachaMatchKey(r.reward_type) === key)
  const w = row?.weight ?? Math.max(1, Math.floor(totalWeight / 10))
  return getRarity(w, totalWeight).className
}

function formatGachaRewardLabel(raw: string): string {
  const t = stripMinecraftFormatting(raw)
  const parts = t.split('|')
  if (parts[0] === 'item' && parts.length >= 3) {
    const label = (parts[3] ?? parts[1] ?? 'Item').trim()
    const n = (parts[2] ?? '1').trim()
    return `${label} ×${n}`
  }
  if (parts[0] === 'currency' && parts.length >= 3) {
    const label = (parts[3] ?? parts[1] ?? 'Ticket').trim()
    const n = (parts[2] ?? '1').trim()
    return `${label} ×${n}`
  }
  const cobble = parseCobbledollarsRewardLabel(t)
  if (cobble != null) return `Asteryn Coin +${cobble.toLocaleString()}`
  return t
}

function gachaMatchKey(raw: string): string {
  const parts = stripMinecraftFormatting(raw).split('|')
  if (parts[0] === 'item' && parts[1]) return `item|${parts[1]}`
  if (parts[0] === 'currency' && parts[1]) return `currency|${parts[1]}`
  return stripMinecraftFormatting(raw).toLowerCase()
}

function isAutoCreditReward(raw: string): boolean {
  const t = stripMinecraftFormatting(raw)
  return parseCobbledollarsRewardLabel(t) != null || t.startsWith('currency|')
}

function getRarity(weight: number, totalWeight: number): { label: string; className: string } {
  const pct = totalWeight > 0 ? (weight / totalWeight) * 100 : 0
  if (pct < 0.002) return { label: 'Super Rare', className: 'bg-red-500/25 text-red-300 border-red-400/50' }
  if (pct < 0.1) return { label: 'Very Rare', className: 'bg-netherite/30 text-netherite border-netherite/50' }
  if (pct < 0.5) return { label: 'Rare', className: 'bg-gold/20 text-gold border-gold/50' }
  if (pct < 2) return { label: 'Uncommon', className: 'bg-emerald/20 text-emerald border-emerald/50' }
  return { label: 'Common', className: 'bg-muted/20 text-muted border-border' }
}

export function Gacha() {
  const { isAuthenticated, user } = useAuth()
  const canUseGacha = Boolean(user?.is_admin) || isAccountVerified(user)
  const [showAuth, setShowAuth] = useState(false)
  const [pools, setPools] = useState<GachaPool[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPool, setSelectedPool] = useState<GachaPool | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const [pulling, setPulling] = useState(false)
  const [lastReward, setLastReward] = useState<GachaRewardResult | null>(null)
  const [lootPhase, setLootPhase] = useState<'idle' | 'fetching' | 'spinning' | 'result'>('idle')
  const [stripItems, setStripItems] = useState<string[]>([])
  const [winIndex, setWinIndex] = useState(-1)
  const [stripTranslate, setStripTranslate] = useState(0)
  const [stripTransition, setStripTransition] = useState('none')
  const [stripSpriteUrls, setStripSpriteUrls] = useState<
    Record<string, GachaSpeciesSpriteUrls | null>
  >({})
  const [poolRewards, setPoolRewards] = useState<PoolReward[]>([])
  const [history, setHistory] = useState<GachaHistoryEntry[]>([])
  const [currencies, setCurrencies] = useState<{ currency_type: string; balance: number }[]>([])
  const [claimingId, setClaimingId] = useState<number | null>(null)
  const [claimPending, setClaimPending] = useState<{ pullId: number; rewardLabel: string } | null>(null)
  const [historyTab, setHistoryTab] = useState<'claim' | 'auto'>('claim')
  const [pullCooldownUntilMs, setPullCooldownUntilMs] = useState(0)
  const [nowMs, setNowMs] = useState(Date.now())
  const pendingRewardRef = useRef<GachaRewardResult | null>(null)
  const stripViewportRef = useRef<HTMLDivElement>(null)
  const spinSettledRef = useRef(false)

  const completeLootSpin = useCallback(() => {
    if (spinSettledRef.current) return
    spinSettledRef.current = true
    const result = pendingRewardRef.current
    if (result) {
      setLastReward(result)
      setBalance(result.newBalance)
    }
    pendingRewardRef.current = null
    setLootPhase('result')
    setPulling(false)
  }, [])

  const dismissGachaResult = useCallback(() => {
    const startCooldownUntil = Date.now() + 5_000
    setPullCooldownUntilMs(startCooldownUntil)
    setNowMs(Date.now())
    setLootPhase('idle')
    setStripItems([])
    setWinIndex(-1)
    setStripTransition('none')
    setStripTranslate(0)
    setStripSpriteUrls({})
    spinSettledRef.current = false
  }, [])

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
    fetchUserCurrencies().then(({ currencies: c }) => setCurrencies(c)).catch(() => setCurrencies([]))
  }, [isAuthenticated])

  const executeClaim = async () => {
    if (!claimPending) return
    if (!canUseGacha) {
      setClaimPending(null)
      setError('Account verification required to claim gacha rewards.')
      return
    }
    const { pullId } = claimPending
    setClaimPending(null)
    setClaimingId(pullId)
    setError(null)
    try {
      await claimGachaPull(pullId)
      const { history: h } = await fetchGachaHistory(30)
      setHistory(h)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Claim failed')
    } finally {
      setClaimingId(null)
    }
  }

  useLayoutEffect(() => {
    if (lootPhase !== 'spinning' || stripItems.length === 0 || winIndex < 0) return
    const el = stripViewportRef.current
    if (!el) return

    const vw = el.offsetWidth
    const finalT = vw / 2 - GACHA_ITEM_WIDTH_PX / 2 - winIndex * GACHA_ITEM_STRIDE
    const extraSlots = 32 + Math.floor(Math.random() * 22)
    const startT = finalT + extraSlots * GACHA_ITEM_STRIDE

    let alive = true
    setStripTransition('none')
    setStripTranslate(startT)

    const t = window.setTimeout(() => {
      if (!alive) return
      setStripTransition(`transform ${GACHA_SPIN_SEC}s cubic-bezier(0.06, 0.75, 0.12, 1)`)
      setStripTranslate(finalT)
    }, 48)

    return () => {
      alive = false
      window.clearTimeout(t)
    }
  }, [lootPhase, stripItems, winIndex])

  const handleStripTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.propertyName !== 'transform' || e.target !== e.currentTarget) return
    completeLootSpin()
  }

  useEffect(() => {
    if (lootPhase !== 'idle') return
    if (pullCooldownUntilMs <= Date.now()) return
    const id = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [pullCooldownUntilMs, lootPhase])

  useEffect(() => {
    if (lootPhase !== 'spinning') return
    const ms = Math.ceil(GACHA_SPIN_SEC * 1000) + 600
    const t = window.setTimeout(() => completeLootSpin(), ms)
    return () => window.clearTimeout(t)
  }, [lootPhase, completeLootSpin])

  const handlePull = async () => {
    if (!selectedPool || pulling || lootPhase !== 'idle') return
    const cooldownLeftSec = Math.max(0, Math.ceil((pullCooldownUntilMs - nowMs) / 1000))
    if (cooldownLeftSec > 0) {
      setError(`Please wait ${cooldownLeftSec}s before opening again.`)
      return
    }
    if (!canUseGacha) {
      setError('Account verification required to use gacha.')
      return
    }
    setError(null)
    setLastReward(null)
    setPulling(true)
    spinSettledRef.current = false
    setLootPhase('fetching')
    pendingRewardRef.current = null
    setStripItems([])
    setWinIndex(-1)

    const started = Date.now()
    try {
      const result = await gachaPull(selectedPool.id)
      pendingRewardRef.current = result
      fetchGachaHistory(30).then(({ history: h }) => setHistory(h)).catch(() => {})

      const elapsed = Date.now() - started
      if (elapsed < MIN_LOOT_MS) {
        await new Promise((r) => setTimeout(r, MIN_LOOT_MS - elapsed))
      }

      const { items, winIndex: wIdx } = buildLootStrip(result.reward.reward_type, poolRewards)
      const unique = [...new Set(items)]
      setStripSpriteUrls(
        Object.fromEntries(unique.map((label) => [label, gachaShowdownSpriteUrls(label)])),
      )
      setStripItems(items)
      setWinIndex(wIdx)
      setLootPhase('spinning')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Pull failed'
      const m = /wait\s+(\d+)s/i.exec(msg)
      if (m) {
        const sec = Number.parseInt(m[1] ?? '0', 10)
        if (Number.isFinite(sec) && sec > 0) {
          const until = Date.now() + sec * 1000
          setPullCooldownUntilMs(until)
          setNowMs(Date.now())
        }
      }
      setError(msg)
      setLootPhase('idle')
      setPulling(false)
      pendingRewardRef.current = null
    }
  }

  const cost = selectedPool?.config && typeof (selectedPool.config as { cost?: number }).cost === 'number'
    ? (selectedPool.config as { cost: number }).cost
    : 100
  const cooldownLeftSec = Math.max(0, Math.ceil((pullCooldownUntilMs - nowMs) / 1000))
  const resultSpriteUrls = useMemo(
    () => (lastReward ? gachaShowdownSpriteUrls(lastReward.reward.reward_type) : null),
    [lastReward?.reward.reward_type]
  )
  const currencyType = (selectedPool?.config as { currency_type?: string } | undefined)?.currency_type ?? 'gems'

  const historyAutoCount = useMemo(
    () => history.filter((e) => isAutoCreditReward(e.rewardType)).length,
    [history],
  )
  const historyClaimCount = history.length - historyAutoCount
  const filteredHistory = useMemo(() => {
    const isAuto = (e: GachaHistoryEntry) => isAutoCreditReward(e.rewardType)
    return historyTab === 'auto' ? history.filter(isAuto) : history.filter((e) => !isAuto(e))
  }, [history, historyTab])

  if (!isAuthenticated) {
    return (
      <>
        <PageShell max="2xl" className="py-4">
          <PageHeader
            accent="gold"
            eyebrow="Rewards"
            title="Gacha"
            description="Sign in to spin the ticket wheel and claim items in-game."
          />
          <div className="pixel-panel-soft p-8 sm:p-10 text-center text-base">
            <button
              type="button"
              onClick={() => setShowAuth(true)}
              className="px-6 py-3 pixel-btn-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#141210]"
            >
              Log in / Sign up
            </button>
          </div>
        </PageShell>
        {showAuth && <AuthModal onClose={() => setShowAuth(false)} defaultMode="login" />}
      </>
    )
  }

  return (
    <PageShell max="2xl" className="space-y-4">
      <PageHeader
        accent="gold"
        eyebrow="Rewards"
        title="Gacha"
        description="Spend tickets on the wheel. Rare tickets only drop from pulls — they cannot be exchanged."
      />
      {!canUseGacha ? (
        <div
          className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
          role="status"
        >
          <p className="m-0 font-medium">Gacha requires a verified account</p>
          <p className="m-0 mt-1 text-xs text-amber-100/90">
            Verify your account under Account to pull and claim rewards in-game. You can still browse
            pools and history.
          </p>
        </div>
      ) : null}

      {loading && (
        <p className="text-muted text-center py-8">Loading pools…</p>
      )}
      {error && (
        <div className="mb-4 p-4 text-error text-base bg-[#1a0f16] border-2 border-error/45 rounded-sm">
          {error}
        </div>
      )}

      {!loading && pools.length === 0 && !error && (
        <div className="pixel-panel-soft p-8 text-center text-muted text-base">
          No reward pools are available at this time.
        </div>
      )}

      {!loading && pools.length > 0 && (
        <div className="space-y-6">
          {currencies.length > 0 && (
            <div className="pixel-panel-soft p-4 sm:p-6">
              <p className="text-xs text-muted uppercase tracking-wider mb-2">Your currencies</p>
              <div className="flex flex-wrap gap-2">
                {currencies.map((c) => (
                  <span
                    key={c.currency_type}
                    className="inline-flex items-center px-3 py-1.5 pixel-well text-base"
                  >
                    <span className="text-muted">{c.currency_type.replace(/_/g, ' ')}:</span>
                    <span className="ml-1.5 font-medium text-[#f5efe6]">{c.balance}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {pools.map((pool) => (
              <button
                key={pool.id}
                type="button"
                onClick={() => { setSelectedPool(pool); setLastReward(null); }}
                className={`text-left p-4 pixel-panel transition-[filter] duration-150 touch-manipulation ${
                  selectedPool?.id === pool.id ? 'ring-2 ring-accent/50 brightness-110' : 'hover:brightness-110'
                }`}
              >
                <span className="font-semibold text-[#f5efe6]">{pool.name}</span>
                <span className="block text-sm text-muted mt-0.5">{pool.type || 'Open loot'}</span>
              </button>
            ))}
          </div>

          {selectedPool && (
            <div className="pixel-panel-soft p-6 sm:p-8">
              <h2 className="text-lg font-semibold text-[#f5efe6] mb-4">{selectedPool.name}</h2>
              <p className="text-muted text-sm mb-4">
                Cost: <span className="text-accent font-medium">{cost} {currencyType}</span> per pull
                {balance !== null && (
                  <> · Your balance: <span className="text-[#f5efe6]">{balance} {currencyType}</span></>
                )}
              </p>
              <button
                type="button"
                onClick={handlePull}
                disabled={
                  !canUseGacha ||
                  pulling ||
                  lootPhase !== 'idle' ||
                  cooldownLeftSec > 0 ||
                  (balance !== null && balance < cost)
                }
                className="w-full sm:w-auto min-w-[180px] py-3 px-6 pixel-btn-primary disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1f1c18] touch-manipulation"
              >
                {pulling
                  ? lootPhase === 'spinning'
                    ? 'Spinning…'
                    : 'Opening…'
                  : cooldownLeftSec > 0
                    ? `Cooldown ${cooldownLeftSec}s`
                    : 'Open loot'}
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
                        <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 px-3 pixel-well">
                          <span className="text-[#f5efe6] text-sm">{formatGachaRewardLabel(r.reward_type)}</span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded border ${className}`}>{label}</span>
                        </li>
                      )
                    })
                    })()}
                  </ul>
                </div>
              )}

              {/* CS:GO-style horizontal loot roll */}
              {lootPhase !== 'idle' && (
                <div
                  className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 px-3 py-6"
                  role={lootPhase === 'result' ? 'dialog' : 'presentation'}
                  aria-modal={lootPhase === 'result' ? true : undefined}
                  aria-labelledby={lootPhase === 'result' ? 'gacha-result-title' : undefined}
                  aria-live="polite"
                >
                  {lootPhase === 'fetching' && (
                    <div className="text-center max-w-sm">
                      <p className="gacha-loot-wait-dots text-lg sm:text-xl font-bold text-amber-300 uppercase tracking-[0.2em]">
                        Opening loot
                      </p>
                      <p className="text-muted text-base mt-3 m-0">Fetching your drop from the server…</p>
                    </div>
                  )}
                  {lootPhase === 'result' && lastReward && (
                    <div
                      className="w-full max-w-md mx-auto pixel-panel-soft p-6 sm:p-8 text-center ring-2 ring-accent/40 shadow-[4px_4px_0_#0a0618]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <h2 id="gacha-result-title" className="text-sm font-bold text-amber-400 uppercase tracking-widest m-0 mb-4">
                        Drop secured
                      </h2>
                      <div className="flex flex-col items-center gap-4 mb-6">
                        <div className="w-[120px] h-[120px] flex items-center justify-center pixel-well rounded-sm overflow-hidden">
                          <GachaStripSprite
                            label={lastReward.reward.reward_type}
                            urls={resultSpriteUrls}
                            imgClassName="max-h-[112px] max-w-[112px] w-auto h-auto object-contain"
                          />
                        </div>
                        <p className="text-[#f5efe6] text-lg font-semibold m-0 px-2">
                          {stripMinecraftFormatting(lastReward.reward.reward_type)}
                        </p>
                        <p className="text-muted text-sm m-0">
                          New balance:{' '}
                          <span className="text-[#f5efe6] font-medium">
                            {lastReward.newBalance} {currencyType}
                          </span>
                        </p>
                        {lastReward.cobbledollarsReward && (
                          <p className="text-sm m-0 text-emerald-300">
                            Auto credited +{lastReward.cobbledollarsReward.amount.toLocaleString()} Asteryn Coin
                            {lastReward.cobbledollarsReward.newBalance != null ? (
                              <>
                                {' '}
                                (wallet: {lastReward.cobbledollarsReward.newBalance.toLocaleString()})
                              </>
                            ) : null}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={dismissGachaResult}
                        className="w-full py-3 px-6 pixel-btn-primary text-base uppercase tracking-wide touch-manipulation"
                      >
                        Continue
                      </button>
                    </div>
                  )}
                  {lootPhase === 'spinning' && stripItems.length > 0 && (
                    <div className="w-full max-w-xl mx-auto">
                      <p className="text-center text-sm font-bold text-amber-400 uppercase tracking-widest mb-4 m-0">
                        Case opening
                      </p>
                      <div ref={stripViewportRef} className="gacha-strip-viewport">
                        <div
                          className="pointer-events-none absolute inset-y-0 left-0 w-12 sm:w-16 z-10 bg-gradient-to-r from-[#141210] via-[#141210]/92 to-transparent"
                          aria-hidden
                        />
                        <div
                          className="pointer-events-none absolute inset-y-0 right-0 w-12 sm:w-16 z-10 bg-gradient-to-l from-[#141210] via-[#141210]/92 to-transparent"
                          aria-hidden
                        />
                        <div
                          className="pointer-events-none absolute left-1/2 top-0 bottom-0 z-20 w-1 -translate-x-1/2 bg-amber-500 shadow-[0_0_14px_rgba(232,168,56,0.75)]"
                          aria-hidden
                        />
                        <div
                          className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-1 z-20 text-amber-400 text-xs leading-none"
                          aria-hidden
                        >
                          ▼
                        </div>
                        <div
                          className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-1 z-20 text-amber-400 text-xs leading-none rotate-180"
                          aria-hidden
                        >
                          ▼
                        </div>
                        <div
                          className="flex h-full items-center gap-2 py-2"
                          style={{
                            transform: `translateX(${stripTranslate}px)`,
                            transition: stripTransition,
                            willChange: stripTransition !== 'none' ? 'transform' : undefined,
                          }}
                          onTransitionEnd={handleStripTransitionEnd}
                        >
                          {(() => {
                            const totalW = poolRewards.reduce((s, r) => s + r.weight, 0) || 1
                            return stripItems.map((label, i) => {
                              const sprite = stripSpriteUrls[label]
                              const display = formatGachaRewardLabel(label)
                              return (
                                <div
                                  key={`${i}-${label}`}
                                  className={`gacha-strip-item ${stripRarityClass(label, poolRewards, totalW)}`}
                                  title={display}
                                >
                                  <GachaStripSprite
                                    label={label}
                                    urls={sprite}
                                    imgClassName="gacha-strip-sprite"
                                  />
                                </div>
                              )
                            })
                          })()}
                        </div>
                      </div>
                      <p className="text-center text-muted text-sm mt-4 m-0">
                        Sprites scroll past — your reward stops in the center.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {lastReward && lootPhase === 'idle' && (
                <div className="mt-6 p-4 pixel-panel-soft ring-2 ring-accent/35">
                  <p className="text-sm text-muted mb-2">You got:</p>
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="text-[#f5efe6] font-medium">
                      {lastReward.reward.label ?? formatGachaRewardLabel(lastReward.reward.reward_type)}
                    </span>
                    <span className="text-muted text-sm">New balance: {lastReward.newBalance} {currencyType}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {isAuthenticated && (
            <div className="mt-8 pixel-panel-soft p-4 sm:p-6">
              <h3 className="text-lg font-semibold text-[#f5efe6] mb-1">Your pull history</h3>
              {history.length === 0 ? (
                <>
                  <p className="text-xs text-muted mb-3 m-0">
                    Claim sends items to your in-game inventory. You must be{' '}
                    <strong className="text-[#f5efe6]">online</strong>, and your Minecraft name must match your website
                    username. Rare tickets credit your wallet automatically.
                  </p>
                  <p className="text-muted text-sm m-0">No pulls yet. Open loot to see your rewards here.</p>
                </>
              ) : (
                <>
                  <div role="tablist" aria-label="Reward type" className="flex flex-wrap gap-2 mb-3">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={historyTab === 'claim'}
                      onClick={() => setHistoryTab('claim')}
                      className={`py-2.5 px-4 text-base font-semibold transition-[filter] duration-150 ${
                        historyTab === 'claim' ? 'pixel-pill pixel-pill-active-accent' : 'pixel-pill'
                      }`}
                    >
                      Items ({historyClaimCount})
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={historyTab === 'auto'}
                      onClick={() => setHistoryTab('auto')}
                      className={`py-2.5 px-4 text-base font-semibold transition-[filter] duration-150 ${
                        historyTab === 'auto' ? 'pixel-pill pixel-pill-active-accent' : 'pixel-pill'
                      }`}
                    >
                      Tickets ({historyAutoCount})
                    </button>
                  </div>
                  {historyTab === 'claim' ? (
                    <p className="text-xs text-muted mb-3 m-0">
                      Claim sends the item to your in-game inventory. You must be{' '}
                      <strong className="text-[#f5efe6]">online</strong>, and your Minecraft name must match your website
                      username.
                    </p>
                  ) : (
                    <p className="text-xs text-muted mb-3 m-0">
                      Ticket and Point drops credit your website wallet automatically — no in-game claim.
                    </p>
                  )}
                  {filteredHistory.length === 0 ? (
                    <p className="text-muted text-sm m-0">
                      {historyTab === 'auto' ? 'No ticket drops in recent pulls.' : 'No item rewards in recent pulls.'}
                    </p>
                  ) : (
                    <ul className="space-y-2 max-h-64 overflow-y-auto">
                      {filteredHistory.map((entry) => (
                        <li
                          key={entry.id}
                          className="flex flex-wrap items-center justify-between gap-2 py-2 px-3 pixel-well text-base"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="text-[#f5efe6] block">
                              {entry.rewardLabel ?? formatGachaRewardLabel(entry.rewardType)}
                            </span>
                            <span className="text-muted text-xs">
                              {entry.poolName} ·{' '}
                              {new Date(entry.pulledAt).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            {entry.fulfilledAt && (
                              <span className="block text-xs text-emerald-400/90 mt-1">
                                {isAutoCreditReward(entry.rewardType)
                                  ? 'Auto credited to website wallet'
                                  : 'Claimed in-game'}
                              </span>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {entry.claimable && !entry.fulfilledAt && (
                              <button
                                type="button"
                                onClick={() =>
                                  setClaimPending({ pullId: entry.id, rewardLabel: entry.rewardType })
                                }
                                disabled={!canUseGacha || claimingId !== null}
                                className="px-3 py-2 pixel-btn-gold disabled:opacity-50 touch-manipulation text-sm"
                              >
                                {claimingId === entry.id ? '…' : 'Claim'}
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {claimPending && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="claim-modal-title"
          onClick={() => setClaimPending(null)}
        >
          <div
            className="w-full max-w-md pixel-panel overflow-hidden shadow-[4px_4px_0_#0a0618]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 sm:p-8">
              <h2 id="claim-modal-title" className="text-lg font-bold text-[#f5efe6] m-0 mb-3">
                Claim in-game?
              </h2>
              <p className="text-sm text-[#f5efe6] m-0 mb-4">
                Send <span className="font-semibold text-amber-200/95">“{formatGachaRewardLabel(claimPending.rewardLabel)}”</span> to your
                inventory on the Minecraft server.
              </p>
              <div className="pixel-panel-soft ring-2 ring-amber-500/30 px-4 py-3 mb-6">
                <p className="text-sm text-amber-100/90 m-0 leading-relaxed">
                  You must be <strong className="text-amber-50">online</strong> on the server. Your in-game name must
                  match your site account:{' '}
                  <span className="inline-flex items-center gap-1">
                    <strong className="font-mono text-amber-50">{user?.username ?? '—'}</strong>
                    {user && isAccountVerified(user) ? (
                      <VerifiedAccountBadge className="w-4 h-4 sm:w-5 sm:h-5" title="Verified account" />
                    ) : null}
                  </span>
                  . If you are offline or
                  your IGN differs, delivery will fail.
                </p>
              </div>
              <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
                <button
                  type="button"
                  onClick={() => setClaimPending(null)}
                  className="w-full sm:w-auto px-4 py-2.5 pixel-btn text-base touch-manipulation"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void executeClaim()}
                  disabled={!canUseGacha}
                  className="w-full sm:w-auto px-4 py-2.5 pixel-btn-gold text-base touch-manipulation disabled:opacity-50"
                >
                  Claim now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  )
}
