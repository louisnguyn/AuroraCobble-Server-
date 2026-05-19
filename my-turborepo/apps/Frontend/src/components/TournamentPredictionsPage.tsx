import { useEffect, useState } from 'react'
import { fetchUserCurrencies } from '../authApi'
import { useAuth } from '../contexts/AuthContext'
import { AuthModal } from './AuthModal'
import { TournamentPredictionPanel } from './TournamentPredictionPanel.tsx'

export function TournamentPredictionsPage({
  slug,
  onBack,
}: {
  slug: string
  onBack: () => void
}) {
  const { isAuthenticated, user } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  const [cobbleBalance, setCobbleBalance] = useState(0)
  const [eventTitle, setEventTitle] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated) {
      setCobbleBalance(0)
      return
    }
    fetchUserCurrencies()
      .then(({ currencies }) => {
        setCobbleBalance(
          currencies.find((c) => c.currency_type === 'cobbledollars')?.balance ?? 0
        )
      })
      .catch(() => setCobbleBalance(0))
  }, [isAuthenticated])

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6 pb-12">
      {showAuth ? <AuthModal onClose={() => setShowAuth(false)} defaultMode="login" /> : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onBack} className="pixel-btn text-sm py-2 px-4">
          ← Back to bracket
        </button>
      </div>
      <header className="space-y-2">
        <p className="text-[10px] uppercase tracking-widest text-violet-300/90 font-semibold m-0">
          {eventTitle ? 'Placing predictions for' : 'Tournament predictions'}
        </p>
        <h1 className="text-2xl sm:text-3xl font-semibold text-[#f5efe6] m-0 leading-tight">
          {eventTitle ?? 'Predictions'}
        </h1>
        <p className="text-sm text-muted m-0">
          Bet website Cobble$ on who wins champion and runner-up. Results settle when the final is decided in the
          bracket.
        </p>
      </header>
      {!isAuthenticated ? (
        <div className="pixel-panel-soft p-4">
          <p className="text-sm text-muted m-0">
            <button type="button" className="text-accent hover:underline" onClick={() => setShowAuth(true)}>
              Log in
            </button>{' '}
            to place predictions.
          </p>
        </div>
      ) : null}
      <TournamentPredictionPanel
        embedded
        viewingSlug={slug}
        cobbleBalance={cobbleBalance}
        onBalanceChange={setCobbleBalance}
        canBet={isAuthenticated}
        highlightUsername={user?.username}
        onEventTitleChange={setEventTitle}
      />
    </div>
  )
}
