import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { fetchUserCurrencies } from '../authApi'
import { websitePointsBalance } from '../currencyLabel'
import { showdownSpriteFallbackUrls } from '../pokemonApi'
import { usePokemonSpriteSrc } from '../usePokemonSpriteSrc'
import { usePokerWebSocket } from '../usePokerWebSocket'
import {
  fetchPokerConfig,
  formatCobble,
  PHASE_LABEL,
  RARITY_LABEL,
  rankDisplay,
  REGION_DOT,
  REGION_LABEL,
  type HoldemAction,
  type HoldemConfig,
  type HoldemRoomState,
  type PokemonCardData,
  type PokemonRarity,
} from '../pokerApi'
import { AuthModal } from './AuthModal'
import { PageHeader, PageNotice, PageSection, PageShell } from './PageLayout'
import { isAccountVerified } from './VerifiedAccountBadge'

const RARITY_BORDER: Record<PokemonRarity, string> = {
  rare: 'pk-card-rare',
  paradox: 'pk-card-paradox',
  ultra_beast: 'pk-card-ultra',
  mythical: 'pk-card-mythical',
  legendary: 'pk-card-legendary',
}

const BTN_FOCUS =
  'poker-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f0a1a]'

function PokemonCardFace({ card, size = 'md' }: { card: PokemonCardData; size?: 'sm' | 'md' | 'lg' }) {
  const hidden = card.hidden
  const sizeClass = size === 'lg' ? 'pk-card-lg' : size === 'sm' ? 'pk-card-sm' : ''
  const urls = card.slug ? showdownSpriteFallbackUrls(card.slug, { shiny: card.shiny }) : []
  const { src, onError } = usePokemonSpriteSrc(card.slug, {
    urls,
    onExhausted: () => {},
  })

  if (hidden) {
    return (
      <div className={`pk-card pk-card-hidden ${sizeClass}`}>
        <span className="pk-card-back-mark">?</span>
      </div>
    )
  }

  return (
    <div
      className={`pk-card ${RARITY_BORDER[card.rarity]} ${card.shiny ? 'pk-card-shiny' : ''} ${sizeClass}`}
    >
      <div className="pk-card-corner pk-card-corner-tl">
        <span className="pk-card-rank">{rankDisplay(card.rank)}</span>
        <span className="pk-card-region">
          {REGION_DOT[card.region]} {REGION_LABEL[card.region]}
        </span>
      </div>
      <div className="pk-card-art-wrap">
        {src ? (
          <img src={src} alt={card.pokemon} className="pk-card-art" onError={onError} draggable={false} />
        ) : (
          <span className="pk-card-name-fallback">{card.pokemon}</span>
        )}
      </div>
      <div className="pk-card-footer">
        <span className="pk-card-pokemon-name">{card.pokemon}</span>
        <span className="pk-card-rarity">{RARITY_LABEL[card.rarity].toUpperCase()}</span>
      </div>
      {card.shiny && <span className="pk-card-shiny-spark" aria-hidden />}
    </div>
  )
}

function ConnectionBadge({ connected }: { connected: boolean }) {
  return (
    <span className={`poker-live-badge ${connected ? 'poker-live-badge--on' : 'poker-live-badge--off'}`}>
      <span className="poker-live-dot" />
      {connected ? 'Live' : 'Connecting…'}
    </span>
  )
}

function TurnCountdown({ endsAt }: { endsAt: number | null }) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!endsAt) return
    const id = setInterval(() => tick((n) => n + 1), 500)
    return () => clearInterval(id)
  }, [endsAt])
  if (!endsAt) return null
  const sec = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
  return <span className="text-xs text-amber-200 tabular-nums">{sec}s</span>
}

export function Poker() {
  const { isAuthenticated, user } = useAuth()
  const [authOpen, setAuthOpen] = useState(false)
  const [config, setConfig] = useState<HoldemConfig | null>(null)
  const [room, setRoom] = useState<HoldemRoomState | null>(null)
  const [walletBalance, setWalletBalance] = useState<number | null>(null)
  const [joinCode, setJoinCode] = useState('')
  const [joinPassword, setJoinPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [tableName, setTableName] = useState('Pokémon Table')
  const [buyIn, setBuyIn] = useState('50000')
  const [smallBlind, setSmallBlind] = useState('250')
  const [bigBlind, setBigBlind] = useState('500')
  const [createPassword, setCreatePassword] = useState('')
  const [raiseTo, setRaiseTo] = useState('')

  const maxPlayers = config?.maxPlayers ?? 6
  const minPlayers = config?.minPlayers ?? 2
  const canUsePoker = Boolean(user?.is_admin) || isAccountVerified(user)

  const loadWallet = useCallback(() => {
    if (!isAuthenticated) return setWalletBalance(null)
    fetchUserCurrencies()
      .then(({ currencies }) => {
        setWalletBalance(websitePointsBalance(currencies))
      })
      .catch(() => setWalletBalance(null))
  }, [isAuthenticated])

  const handleWsEvent = useCallback(
    (data: { type?: string; room?: unknown; message?: string }) => {
      if (data.type === 'room_state' && data.room) {
        setRoom(data.room as HoldemRoomState)
        setError(null)
        loadWallet()
      } else if (data.type === 'error') {
        setError(data.message ?? 'Error')
      } else if (data.type === 'left') {
        setRoom(null)
        loadWallet()
      } else if (data.type === 'connected') {
        setError(null)
      }
    },
    [loadWallet]
  )

  const { connected, send } = usePokerWebSocket(canUsePoker ? user?.id : undefined, handleWsEvent)

  const mySeatIdx = useMemo(() => {
    if (!room || !user) return -1
    return room.seats.findIndex((s) => s?.userId === user.id)
  }, [room, user])

  const mySeat = mySeatIdx >= 0 ? room?.seats[mySeatIdx] : null
  const isMyTurn = room != null && mySeatIdx >= 0 && room.activeSeat === mySeatIdx
  const inHand = room != null && room.phase !== 'lobby' && room.phase !== 'hand_over'

  useEffect(() => {
    if (!canUsePoker) return
    fetchPokerConfig()
      .then((c) => {
        setConfig(c)
        setBuyIn(String(c.defaultBuyIn))
        setSmallBlind(String(c.defaultSmallBlind))
        setBigBlind(String(c.defaultBigBlind))
      })
      .catch(() => setConfig(null))
    loadWallet()
  }, [loadWallet, canUsePoker])

  useEffect(() => {
    if (!room || mySeatIdx < 0) return
    const toCall = room.currentBet - (mySeat?.betRound ?? 0)
    const minRaiseTo = room.currentBet + room.minRaise
    setRaiseTo(String(Math.min((mySeat?.chips ?? 0) + (mySeat?.betRound ?? 0), minRaiseTo + toCall)))
  }, [room?.currentBet, room?.minRaise, mySeat?.betRound, mySeat?.chips, mySeatIdx, room, mySeat])

  const sendAction = (kind: HoldemAction, amount?: number) => {
    setError(null)
    if (!send({ type: 'action', kind, amount })) {
      setError('Not connected — wait for Live status or refresh the page.')
    }
  }

  const sendSafe = (msg: Record<string, unknown>) => {
    setError(null)
    if (!send(msg)) setError('Not connected — wait for Live status or refresh the page.')
  }

  const toCall = room && mySeat ? Math.max(0, room.currentBet - mySeat.betRound) : 0

  if (!isAuthenticated) {
    return (
      <>
        <PageShell max="4xl" className="space-y-4">
          <PageHeader
            accent="gold"
            eyebrow="Mini-games"
            title="Pokémon Poker"
            description="Texas Hold'em with Pokémon cards. Virtual Asteryn Coin only — no real-money gambling."
          />
          <div className="pixel-panel-soft p-8 text-center">
            <button
              type="button"
              className={`poker-btn-primary pixel-btn-primary ${BTN_FOCUS}`}
              onClick={() => setAuthOpen(true)}
            >
              Log in / Sign up
            </button>
          </div>
        </PageShell>
        {authOpen && <AuthModal onClose={() => setAuthOpen(false)} defaultMode="login" />}
      </>
    )
  }

  if (!canUsePoker) {
    return (
      <PageShell max="4xl" className="space-y-4">
        <PageHeader
          accent="gold"
          eyebrow="Mini-games"
          title="Pokémon Poker"
          description="Texas Hold'em with Pokémon cards. Verified players only."
        />
        <div
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
          role="status"
        >
          <p className="m-0 font-medium">Pokémon Poker requires a verified account</p>
          <p className="m-0 mt-1 text-xs text-amber-100/90">
            Verify your account under <strong>Account</strong> to create or join tables and play with Asteryn Coin.
          </p>
        </div>
      </PageShell>
    )
  }

  const minBuy = config?.minBuyIn ?? 10_000
  const maxBuy = config?.maxBuyIn ?? 100_000

  return (
    <PageShell max="6xl" className="space-y-4">
      <PageHeader
        accent="gold"
        eyebrow="Mini-games"
        title="Pokémon Poker"
        description={`Texas Hold'em — up to ${maxPlayers} players. 2 hole cards, 5 community cards, best hand wins.`}
        aside={
          <div className="flex flex-col items-end gap-2">
            <ConnectionBadge connected={connected} />
            <div className="pixel-well px-4 py-3 text-right min-w-[9rem]">
              <p className="text-[10px] uppercase tracking-wider text-muted m-0">Wallet</p>
              <p className="text-xl font-bold text-[#fbbf24] m-0 tabular-nums">
                {walletBalance != null ? formatCobble(walletBalance) : '—'}
              </p>
            </div>
          </div>
        }
      />

      {error && <PageNotice variant="warn">{error}</PageNotice>}

      {!room ? (
        <PageSection
          title="Find a table"
          description={`Host or join a table (${minPlayers}–${maxPlayers} players). Buy-in is taken from your wallet.`}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="pixel-panel p-5 sm:p-6 space-y-4">
              <h3 className="text-lg font-semibold text-[#f5efe6] m-0">Create table</h3>
              <label className="poker-form-label">
                Table name
                <input
                  className="w-full mt-1.5 pixel-field px-3 py-2.5 text-[#e2e8f0]"
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                />
              </label>
              <label className="poker-form-label">
                Buy-in ({formatCobble(minBuy)}–{formatCobble(maxBuy)})
                <input
                  className="w-full mt-1.5 pixel-field px-3 py-2.5 tabular-nums"
                  value={buyIn}
                  onChange={(e) => setBuyIn(e.target.value)}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="poker-form-label">
                  Small blind
                  <input
                    className="w-full mt-1.5 pixel-field px-3 py-2.5 tabular-nums"
                    value={smallBlind}
                    onChange={(e) => setSmallBlind(e.target.value)}
                  />
                </label>
                <label className="poker-form-label">
                  Big blind
                  <input
                    className="w-full mt-1.5 pixel-field px-3 py-2.5 tabular-nums"
                    value={bigBlind}
                    onChange={(e) => setBigBlind(e.target.value)}
                  />
                </label>
              </div>
              <label className="poker-form-label">
                Password (optional)
                <input
                  className="w-full mt-1.5 pixel-field px-3 py-2.5"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                />
              </label>
              <button
                type="button"
                className={`w-full poker-btn-primary pixel-btn-primary disabled:opacity-50 disabled:cursor-not-allowed ${BTN_FOCUS}`}
                disabled={!connected}
                onClick={() => {
                  setError(null)
                  sendSafe({
                    type: 'create_room',
                    name: tableName,
                    buyIn: parseInt(buyIn, 10),
                    smallBlind: parseInt(smallBlind, 10),
                    bigBlind: parseInt(bigBlind, 10),
                    maxPlayers,
                    password: createPassword || undefined,
                  })
                }}
              >
                {connected ? 'Create & buy in' : 'Connecting…'}
              </button>
            </div>

            <div className="pixel-panel-soft p-5 sm:p-6 space-y-4">
              <h3 className="text-lg font-semibold text-[#f5efe6] m-0">Join with code</h3>
              <label className="poker-form-label">
                Room code
                <input
                  className="w-full mt-1.5 pixel-field px-4 py-3 text-center text-lg tracking-[0.3em] uppercase font-semibold"
                  placeholder="ABCDEF"
                  maxLength={6}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                />
              </label>
              <label className="poker-form-label">
                Password (if required)
                <input
                  className="w-full mt-1.5 pixel-field px-3 py-2.5"
                  placeholder="Optional"
                  value={joinPassword}
                  onChange={(e) => setJoinPassword(e.target.value)}
                />
              </label>
              <button
                type="button"
                className={`w-full poker-btn pixel-btn disabled:opacity-50 disabled:cursor-not-allowed ${BTN_FOCUS}`}
                disabled={!connected || joinCode.length < 4}
                onClick={() => {
                  setError(null)
                  sendSafe({ type: 'join_room', code: joinCode, password: joinPassword || undefined })
                }}
              >
                Join & buy in
              </button>
            </div>
          </div>
        </PageSection>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="poker-stat-bar">
              <span className="poker-stat-pill">
                <span className="poker-stat-pill__label">Table</span>
                <span className="poker-stat-pill__value">{room.name}</span>
              </span>
              <span className="poker-stat-pill poker-stat-pill--accent">
                <span className="poker-stat-pill__label">Code</span>
                <span className="poker-stat-pill__value font-mono">{room.code}</span>
              </span>
              <span className="poker-stat-pill">
                <span className="poker-stat-pill__label">Phase</span>
                <span className="poker-stat-pill__value">{PHASE_LABEL[room.phase]}</span>
              </span>
              <span className="poker-stat-pill poker-stat-pill--gold">
                <span className="poker-stat-pill__label">Pot</span>
                <span className="poker-stat-pill__value">{formatCobble(room.pot)}</span>
              </span>
            </div>
            <button
              type="button"
              className={`poker-btn pixel-btn ${BTN_FOCUS}`}
              onClick={() => sendSafe({ type: 'leave_room' })}
            >
              Leave table
            </button>
          </div>

          {room.message && <PageNotice>{room.message}</PageNotice>}

          <div className="holdem-table-wrap pixel-panel-soft p-4 sm:p-6">
            <div className="holdem-oval">
              <div className="holdem-community">
                {room.community.length === 0 ? (
                  <span className="text-sm text-muted/70 italic">Community cards appear here</span>
                ) : (
                  room.community.map((c, i) => <PokemonCardFace key={i} card={c} size="lg" />)
                )}
              </div>
              <div className="holdem-pot-label">
                {formatCobble(room.pot)} Asteryn Coin
                {room.turnEndsAt && inHand && (
                  <span className="ml-2 opacity-90">
                    · <TurnCountdown endsAt={room.turnEndsAt} />
                  </span>
                )}
              </div>
            </div>

            <div className="holdem-seats">
              {room.seats.map((seat, i) =>
                seat ? (
                  <div
                    key={seat.userId}
                    className={`holdem-seat pixel-well p-4 sm:p-5 ${seat.userId === user?.id ? 'holdem-seat-you' : ''} ${room.activeSeat === i ? 'holdem-seat-active' : ''} ${seat.folded ? 'opacity-55' : ''}`}
                  >
                    <div className="flex justify-between gap-2 mb-3">
                      <div>
                        <p className="font-semibold text-[#f5efe6] m-0">{seat.username}</p>
                        <p className="text-xs text-muted m-0 mt-0.5">
                          {formatCobble(seat.chips)} chips
                          {seat.isDealer && ' · Dealer'}
                          {seat.isSmallBlind && ' · SB'}
                          {seat.isBigBlind && ' · BB'}
                        </p>
                      </div>
                      {seat.ready && (room.phase === 'lobby' || room.phase === 'hand_over') && (
                        <span className="text-[10px] uppercase tracking-wide text-emerald-400 font-bold px-2 py-1 rounded-md bg-emerald-950/40 border border-emerald-500/25">
                          Ready
                        </span>
                      )}
                    </div>
                    {seat.hole.length > 0 && (
                      <div className="holdem-hole-row">
                        {seat.hole.map((c, ci) => (
                          <PokemonCardFace key={ci} card={c} size="md" />
                        ))}
                      </div>
                    )}
                    {seat.betRound > 0 && (
                      <p className="text-xs text-muted m-0 mt-2 text-center">Bet: {formatCobble(seat.betRound)}</p>
                    )}
                    {seat.lastAction && (
                      <p className="text-xs text-cyan-200/85 m-0 mt-1.5 text-center">{seat.lastAction}</p>
                    )}
                    {seat.handLabel && (
                      <p className="text-sm text-amber-200 m-0 mt-1.5 text-center font-semibold">{seat.handLabel}</p>
                    )}
                  </div>
                ) : (
                  <div
                    key={`e-${i}`}
                    className="holdem-seat holdem-seat-empty pixel-well p-4 flex items-center justify-center text-sm text-muted"
                  >
                    Open seat
                  </div>
                )
              )}
            </div>
          </div>

          {room.lastResults.length > 0 && (
            <PageSection title="Last hand">
              <ul className="list-none m-0 p-0 space-y-2">
                {room.lastResults.map((line, i) => (
                  <li key={i} className="text-sm text-muted pixel-well px-3 py-2.5 rounded-lg">
                    {line}
                  </li>
                ))}
              </ul>
            </PageSection>
          )}

          {(room.phase === 'lobby' || room.phase === 'hand_over') && mySeat && (
            <PageSection title="Ready up">
              <p className="text-sm text-muted m-0 mb-4">
                All seated players must tap Ready to start ({minPlayers}–{maxPlayers} players).
              </p>
              <button
                type="button"
                className={`poker-btn-primary pixel-btn-primary disabled:opacity-50 disabled:cursor-not-allowed ${BTN_FOCUS}`}
                disabled={mySeat.ready}
                onClick={() => sendSafe({ type: 'ready' })}
              >
                {mySeat.ready ? 'Waiting for others…' : 'Ready'}
              </button>
            </PageSection>
          )}

          {inHand && mySeat && !mySeat.folded && mySeat.allIn && (
            <PageNotice>All-in — dealing remaining cards…</PageNotice>
          )}

          {inHand && mySeat && !mySeat.folded && !mySeat.allIn && isMyTurn && (
            <PageSection title="Your action">
              <p className="text-sm text-muted m-0 mb-4">
                To call: <span className="text-[#f5efe6] font-semibold">{formatCobble(toCall)}</span>
                {' · '}
                Min raise to:{' '}
                <span className="text-[#f5efe6] font-semibold">{formatCobble(room.currentBet + room.minRaise)}</span>
              </p>

              <div className="poker-action-grid mb-4">
                <button type="button" className={`poker-btn-danger ${BTN_FOCUS}`} onClick={() => sendAction('fold')}>
                  Fold
                </button>
                {toCall === 0 ? (
                  <button type="button" className={`poker-btn pixel-btn ${BTN_FOCUS}`} onClick={() => sendAction('check')}>
                    Check
                  </button>
                ) : (
                  <button type="button" className={`poker-btn pixel-btn ${BTN_FOCUS}`} onClick={() => sendAction('call')}>
                    Call {formatCobble(toCall)}
                  </button>
                )}
                <button
                  type="button"
                  className={`poker-btn-primary pixel-btn-primary ${BTN_FOCUS}`}
                  onClick={() => sendAction('all_in')}
                >
                  All in
                </button>
              </div>

              <div className="flex flex-wrap items-end gap-3 max-w-lg">
                <label className="flex-1 min-w-[10rem] poker-form-label">
                  Raise to (total this round)
                  <input
                    className="w-full mt-1.5 pixel-field px-3 py-2.5 tabular-nums"
                    value={raiseTo}
                    onChange={(e) => setRaiseTo(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className={`poker-btn-primary pixel-btn-primary ${BTN_FOCUS}`}
                  onClick={() => sendAction('raise', parseInt(raiseTo, 10))}
                >
                  Raise
                </button>
                {room.currentBet === 0 && (
                  <button
                    type="button"
                    className={`poker-btn pixel-btn ${BTN_FOCUS}`}
                    onClick={() => sendAction('bet', parseInt(raiseTo, 10))}
                  >
                    Bet
                  </button>
                )}
              </div>
            </PageSection>
          )}

          {inHand && mySeat && !isMyTurn && !mySeat.folded && !mySeat.allIn && (
            <PageNotice>Waiting for other players…</PageNotice>
          )}
        </>
      )}
    </PageShell>
  )
}
