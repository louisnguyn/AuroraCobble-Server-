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
import { CobbleDollars } from './components/CobbleDollars.tsx'

type Page =
  | 'main'
  | 'leaderboard'
  | 'cobbledollars'
  | 'usage'
  | 'wiki'
  | 'rules'
  | 'gacha'
  | 'spawn'
  | 'account'

const PAGES: { id: Page; label: string }[] = [
  { id: 'main', label: 'Main' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'cobbledollars', label: 'Cobble$' },
  { id: 'usage', label: 'Usage Stats' },
  { id: 'wiki', label: 'Wiki' },
  { id: 'rules', label: 'Rules' },
  { id: 'gacha', label: 'Gacha' },
  { id: 'spawn', label: 'Spawn' },
  { id: 'account', label: 'Account' },
]

function AppContent() {
  const [page, setPage] = useState<Page>('main')
  const [menuOpen, setMenuOpen] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const { isAuthenticated, user, logout } = useAuth()

  const goTo = (p: Page) => {
    setPage(p)
    setMenuOpen(false)
  }

  return (
    <div className="min-h-screen flex flex-col relative">
      <Analytics />
      <header className="sticky top-0 z-20 flex items-center justify-between gap-2 px-3 py-3 sm:px-6 sm:py-4 bg-surface/90 backdrop-blur-md border-b border-border">
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
              <span className="text-sm text-muted truncate max-w-[80px] sm:max-w-[140px]" title={user.email}>
                {user.username}
              </span>
              <button
                type="button"
                onClick={logout}
                className="text-xs sm:text-sm py-1.5 px-2 sm:px-3 rounded-lg border border-border text-muted hover:bg-surface-hover hover:text-[#e2e8f0] transition-colors touch-manipulation"
              >
                Log out
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setShowAuth(true)}
              className="text-sm py-1.5 px-2 sm:px-3 rounded-lg border border-accent/50 text-accent hover:bg-accent/15 transition-colors touch-manipulation"
            >
              Log in
            </button>
          )}
          <button
            type="button"
            className={`flex flex-col justify-center gap-[5px] w-11 h-11 p-2.5 rounded-lg bg-transparent text-[#e6edf3] cursor-pointer transition-colors hover:bg-surface-hover touch-manipulation ${menuOpen ? 'burger-open' : ''}`}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span className="block w-[22px] h-0.5 rounded bg-current transition-all duration-200 origin-center" />
            <span className="block w-[22px] h-0.5 rounded bg-current transition-opacity duration-200" />
            <span className="block w-[22px] h-0.5 rounded bg-current transition-all duration-200 origin-center" />
          </button>
        </div>
      </header>

      <div
        className={`fixed inset-0 bg-black/50 z-30 transition-opacity duration-300 ${menuOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}
        aria-hidden={!menuOpen}
        onClick={() => setMenuOpen(false)}
      />
      <nav
        className={`fixed top-0 right-0 w-[min(280px,85vw)] max-w-full h-screen py-16 px-2 pb-6 bg-surface/95 backdrop-blur-md border-l border-border z-40 overflow-y-auto transition-transform duration-300 ease-out md:w-[260px] ${menuOpen ? 'translate-x-0 shadow-[-4px_0_24px_rgba(0,0,0,0.3)]' : 'translate-x-full'}`}
      >
        <ul className="list-none m-0 p-0">
          {PAGES.map(({ id, label }) => (
            <li key={id} className="m-0">
              <button
                type="button"
                className={`block w-full py-3 px-4 text-left text-base border-none rounded-lg bg-transparent cursor-pointer transition-colors hover:text-[#e6edf3] hover:bg-surface-hover ${page === id ? 'text-accent bg-surface-hover font-semibold' : 'text-muted'}`}
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
        {page === 'cobbledollars' && <CobbleDollars />}
        {page === 'wiki' && <Wiki />}
        {page === 'rules' && <Rules />}
        {page === 'gacha' && <Gacha />}
        {page === 'spawn' && <Spawn />}
        {page === 'account' && <Account />}
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
