import { useState } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { Home } from './components/Home.tsx'
import { UsageStats } from './components/UsageStats.tsx'
import { Leaderboard } from './components/Leaderboard.tsx'
import { Wiki } from './components/Wiki.tsx'
import { Rules } from './components/Rules.tsx'
import { Gacha } from './components/Gacha.tsx'
import { AuthModal } from './components/AuthModal.tsx'
import { Account } from './components/Account.tsx'
import { Spawn } from './components/Spawn.tsx'
import { Tournament } from './components/Tournament.tsx'
import { TournamentTeamDetail } from './components/TournamentTeamDetail.tsx'
type Page =
  | 'main'
  | 'leaderboard'
  | 'usage'
  | 'wiki'
  | 'rules'
  | 'gacha'
  | 'spawn'
  | 'account'
  | 'tournament'

const PAGES: { id: Page; label: string }[] = [
  { id: 'main', label: 'Main' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'usage', label: 'Usage Stats' },
  { id: 'wiki', label: 'Wiki' },
  { id: 'rules', label: 'Rules' },
  { id: 'gacha', label: 'Gacha' },
  { id: 'spawn', label: 'Spawn' },
  { id: 'account', label: 'Account' },
  { id: 'tournament', label: 'Tournament' },
]

function AppContent() {
  const [page, setPage] = useState<Page>('main')
  const [menuOpen, setMenuOpen] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const { isAuthenticated, user, logout } = useAuth()
  const [tournamentNav, setTournamentNav] = useState<{ slug: string; participantId?: number }>({
    slug: '',
  })

  const goTo = (p: Page) => {
    setPage(p)
    setMenuOpen(false)
  }

  return (
    <div className="min-h-screen flex flex-col relative">
      <Analytics />
      <header className="arcade-header sticky top-0 z-20 flex items-center justify-between gap-2 px-3 py-3 sm:px-6 sm:py-4">
        <button
          type="button"
          onClick={() => goTo('main')}
          aria-label="Go to homepage"
          className="shrink-0"
        >
          <img
            src="/logo.png"
            alt="Aurora Cobble"
            className="block h-24 w-auto max-w-[200px] sm:max-w-[280px] object-contain object-left shrink-0"
          />
        </button>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {isAuthenticated && user ? (
            <>
              <span className="text-base text-muted truncate max-w-[100px] sm:max-w-[160px]" title={user.email}>
                {user.username}
              </span>
              <button type="button" onClick={logout} className="pixel-btn text-base py-2 px-3 sm:px-4">
                Log out
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setShowAuth(true)}
              className="pixel-btn-primary text-base py-2 px-3 sm:px-4"
            >
              Log in
            </button>
          )}
          <button
            type="button"
            className={`flex flex-col justify-center gap-1 w-12 h-12 p-2 pixel-btn text-[#e6edf3] ${menuOpen ? 'burger-open' : ''}`}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span className="block w-[22px] h-[3px] bg-current transition-all duration-200 origin-center" />
            <span className="block w-[22px] h-[3px] bg-current transition-opacity duration-200" />
            <span className="block w-[22px] h-[3px] bg-current transition-all duration-200 origin-center" />
          </button>
        </div>
      </header>

      <div
        className={`fixed inset-0 bg-black/55 z-30 transition-opacity duration-300 ${menuOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}
        aria-hidden={!menuOpen}
        onClick={() => setMenuOpen(false)}
      />
      <nav
        className={`fixed top-0 right-0 w-[min(280px,85vw)] max-w-full h-screen py-16 px-2 pb-6 pixel-drawer z-40 overflow-y-auto transition-transform duration-300 ease-out md:w-[260px] ${menuOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <ul className="list-none m-0 p-0">
          {PAGES.map(({ id, label }) => (
            <li key={id} className="m-0 mb-1.5">
              <button
                type="button"
                className={`block w-full py-3 px-4 text-left text-base border-none cursor-pointer pixel-pill ${page === id ? 'pixel-pill-active-gold' : 'text-muted'}`}
                onClick={() => goTo(id)}
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} defaultMode="login" />}
      <main className="flex-1 p-4 sm:p-6 min-w-0">
        {page === 'main' && <Home onNavigate={goTo} />}
        {page === 'usage' && <UsageStats />}
        {page === 'leaderboard' && <Leaderboard />}
        {page === 'wiki' && <Wiki />}
        {page === 'rules' && <Rules />}
        {page === 'gacha' && <Gacha />}
        {page === 'spawn' && <Spawn />}
        {page === 'account' && <Account />}
        {page === 'tournament' &&
          (tournamentNav.participantId != null ? (
            <TournamentTeamDetail
              slug={tournamentNav.slug}
              participantId={tournamentNav.participantId}
              onBack={() => setTournamentNav({ slug: tournamentNav.slug })}
            />
          ) : (
            <Tournament
              slug={tournamentNav.slug}
              onSlugChange={(s) => setTournamentNav({ slug: s })}
              onOpenPlayer={(id) => setTournamentNav({ slug: tournamentNav.slug, participantId: id })}
            />
          ))}
      </main>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
