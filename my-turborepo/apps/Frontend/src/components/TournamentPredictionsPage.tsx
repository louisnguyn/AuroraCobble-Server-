import { useEffect, useState } from 'react'
import { fetchUserCurrencies } from '../authApi'
import { websitePointsBalance } from '../currencyLabel'
import { useAuth } from '../contexts/AuthContext'
import { AuthModal } from './AuthModal'
import { PageHeader, PageShell } from './PageLayout.tsx'
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
        setCobbleBalance(websitePointsBalance(currencies))
      })
      .catch(() => setCobbleBalance(0))
  }, [isAuthenticated])

  return (
    <PageShell max="3xl" className="!pb-12">
      {showAuth ? <AuthModal onClose={() => setShowAuth(false)} defaultMode="login" /> : null}

      <button type="button" onClick={onBack} className="pixel-btn text-sm py-2 px-4 -mt-2">
        ← Back to bracket
      </button>

      <PageHeader
        accent="violet"
        eyebrow={eventTitle ? 'Placing predictions for' : 'Tournament predictions'}
        title={eventTitle ?? 'Predictions'}
        description="Bet website Asteryn Point on who wins champion and runner-up. Results settle when the final is decided in the bracket."
      />

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
    </PageShell>
  )
}
