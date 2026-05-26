import { useEffect, useState } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { Home } from './components/Home.tsx'
import { UsageStats } from './components/UsageStats.tsx'
import { Leaderboard } from './components/Leaderboard.tsx'
import { Wiki } from './components/Wiki.tsx'
import { Restrictions } from './components/Restrictions.tsx'
import { Gacha } from './components/Gacha.tsx'
import { AuthModal } from './components/AuthModal.tsx'
import { Account } from './components/Account.tsx'
import { Spawn } from './components/Spawn.tsx'
import { Tournament } from './components/Tournament.tsx'
import { TournamentPredictionsPage } from './components/TournamentPredictionsPage.tsx'
import { TournamentTeamCompare } from './components/TournamentTeamCompare.tsx'
import { TournamentTeamDetail } from './components/TournamentTeamDetail.tsx'
import { TeamBuilder } from './components/TeamBuilder.tsx'
import { TeamPasteViewPage } from './components/TeamPasteViewPage.tsx'
import { parseProfileSlugFromHash, Profile } from './components/Profile.tsx'
import { isTeamPasteViewHash } from './teamPasteViewStorage.ts'
import { isAccountVerified, VerifiedAccountBadge } from './components/VerifiedAccountBadge.tsx'
type Page =
  | 'main'
  | 'leaderboard'
  | 'usage'
  | 'wiki'
  | 'restrictions'
  | 'gacha'
  | 'spawn'
  | 'account'
  | 'tournament'
  | 'teambuilder'
  | 'teampasteview'
  | 'profile'

const PAGES: { id: Page; label: string }[] = [
  { id: 'main', label: 'Home' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'usage', label: 'Usage Stats' },
  { id: 'wiki', label: 'Wiki' },
  { id: 'restrictions', label: 'Restrictions' },
  { id: 'teambuilder', label: 'Team Builder' },
  { id: 'gacha', label: 'Gacha' },
  { id: 'spawn', label: 'Spawn' },
  { id: 'account', label: 'Account' },
  { id: 'profile', label: 'Profile' },
  { id: 'tournament', label: 'Tournament' },
]

function NavIcon({ page }: { page: Page }) {
  const cls = 'w-[18px] h-[18px] shrink-0 opacity-90'
  switch (page) {
    case 'main':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={cls}>
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5.5 10.5V20h13V10.5" />
        </svg>
      )
    case 'leaderboard':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={cls}>
          <path d="M7 18V9m5 9V6m5 12v-7" />
          <path d="M4 20h16" />
        </svg>
      )
    case 'usage':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={cls}>
          <path d="M4 13h4l2-6 4 10 2-4h4" />
        </svg>
      )
    case 'wiki':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={cls}>
          <path d="M4 5h10a3 3 0 0 1 3 3v11H7a3 3 0 0 0-3 3V5z" />
          <path d="M17 19h3V8a3 3 0 0 0-3-3" />
        </svg>
      )
    case 'restrictions':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={cls}>
          <path d="M8 4h10v16H8l-2-2V6l2-2Z" />
          <path d="M10 9h6M10 13h6" />
        </svg>
      )
    case 'teambuilder':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={cls}>
          <path d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />
          <path d="M4 20a8 8 0 0 1 16 0" />
        </svg>
      )
    case 'gacha':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={cls}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 4v16M4 12h16" />
        </svg>
      )
    case 'spawn':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={cls}>
          <path d="M12 3v18M3 12h18" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )
    case 'account':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={cls}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20a8 8 0 0 1 16 0" />
        </svg>
      )
    case 'tournament':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={cls}>
          <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
          <path d="M9 17h6M12 13v4" />
        </svg>
      )
    case 'profile':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={cls}>
          <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
          <path d="M4 21a8 8 0 0 1 16 0" />
          <path d="M19 8h2M21 10v4M21 14h-2M19 14h2M19 17h2M17 21h4" opacity="0.85" strokeLinecap="round" />
        </svg>
      )
  }
}

function initialPageFromHash(): Page {
  if (typeof window === 'undefined') return 'main'
  if (parseProfileSlugFromHash()) return 'profile'
  if (isTeamPasteViewHash()) return 'teampasteview'
  return 'main'
}

function AppContent() {
  const [page, setPage] = useState<Page>(initialPageFromHash)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const { isAuthenticated, user, logout } = useAuth()
  const [hashProfileSlug, setHashProfileSlug] = useState<string | null>(() =>
    typeof window !== 'undefined' ? parseProfileSlugFromHash() : null
  )
  const [tournamentNav, setTournamentNav] = useState<{
    slug: string
    view?: 'predictions'
    participantId?: number
    compareWithId?: number
    comparePickFirst?: number
  }>({ slug: '' })

  useEffect(() => {
    const sync = () => {
      const slug = parseProfileSlugFromHash()
      setHashProfileSlug(slug)
      if (slug) {
        setPage('profile')
        return
      }
      if (isTeamPasteViewHash()) {
        setPage('teampasteview')
        return
      }
    }
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  const goTo = (p: Page) => {
    if (typeof window !== 'undefined') {
      const isProfileHash = window.location.hash.startsWith('#profile/')
      const isTeamPasteHash = isTeamPasteViewHash()
      if (isProfileHash && p !== 'profile') {
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
        setHashProfileSlug(null)
      } else if (p === 'profile' && isProfileHash) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
        setHashProfileSlug(null)
      } else if (p === 'profile' && !isProfileHash) {
        setHashProfileSlug(null)
      }
      if (isTeamPasteHash && p !== 'teampasteview') {
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      }
    }
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
            src="/logo_text.png"
            alt="Aurora Cobble"
            className="block h-24 w-auto max-w-[200px] sm:max-w-[280px] object-contain object-left shrink-0"
          />
        </button>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {isAuthenticated && user ? (
            <>
              <span
                className="flex items-center gap-2 min-w-0 text-base text-muted max-w-[min(100vw-12rem,280px)] sm:max-w-[320px]"
                title={user.email}
              >
                <span className="truncate text-[#e2e8f0]">{user.username}</span>
                {isAccountVerified(user) ? (
                  <VerifiedAccountBadge className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" title="Verified account" />
                ) : null}
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
        <p className="sidebar-section-label px-3 mb-2">User</p>
        <ul className="list-none m-0 p-0">
          {PAGES.map(({ id, label }) => (
            <li key={id} className="m-0 mb-1.5">
              <button
                type="button"
                className={`sidebar-nav-item block w-full py-3 px-4 text-left text-base border-none cursor-pointer ${page === id ? 'sidebar-nav-item-active' : ''}`}
                onClick={() => goTo(id)}
              >
                <span className="inline-flex items-center gap-3">
                  <span className="sidebar-nav-icon">
                    <NavIcon page={id} />
                  </span>
                  <span>{label}</span>
                </span>
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
        {page === 'restrictions' && <Restrictions />}
        {page === 'teambuilder' && <TeamBuilder />}
        {page === 'teampasteview' && (
          <TeamPasteViewPage onBack={() => goTo('teambuilder')} />
        )}
        {page === 'gacha' && <Gacha />}
        {page === 'spawn' && <Spawn />}
        {page === 'account' && <Account />}
        {page === 'profile' && <Profile slugFromHashOrNav={hashProfileSlug} />}
        {page === 'tournament' &&
          (tournamentNav.view === 'predictions' ? (
            <TournamentPredictionsPage
              slug={tournamentNav.slug}
              onBack={() => setTournamentNav({ slug: tournamentNav.slug })}
            />
          ) : tournamentNav.participantId != null && tournamentNav.compareWithId != null ? (
            <TournamentTeamCompare
              slug={tournamentNav.slug}
              participantIdA={tournamentNav.participantId}
              participantIdB={tournamentNav.compareWithId}
              onBack={() => setTournamentNav({ slug: tournamentNav.slug })}
            />
          ) : tournamentNav.participantId != null ? (
            <TournamentTeamDetail
              slug={tournamentNav.slug}
              participantId={tournamentNav.participantId}
              onBack={() => setTournamentNav({ slug: tournamentNav.slug })}
              onCompareWithOther={() =>
                setTournamentNav({
                  slug: tournamentNav.slug,
                  comparePickFirst: tournamentNav.participantId,
                })
              }
            />
          ) : (
            <Tournament
              slug={tournamentNav.slug}
              onSlugChange={(s) => setTournamentNav({ slug: s })}
              onOpenPredictions={() =>
                setTournamentNav({ slug: tournamentNav.slug, view: 'predictions' })
              }
              comparePickFirst={tournamentNav.comparePickFirst}
              onCancelComparePick={() => setTournamentNav({ slug: tournamentNav.slug })}
              onComparePair={(a, b) =>
                setTournamentNav({ slug: tournamentNav.slug, participantId: a, compareWithId: b })
              }
              onOpenPlayer={(id) => {
                const pick = tournamentNav.comparePickFirst
                if (pick != null) {
                  if (id === pick) {
                    setTournamentNav({ slug: tournamentNav.slug })
                  } else {
                    setTournamentNav({
                      slug: tournamentNav.slug,
                      participantId: pick,
                      compareWithId: id,
                    })
                  }
                  return
                }
                setTournamentNav({ slug: tournamentNav.slug, participantId: id })
              }}
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
