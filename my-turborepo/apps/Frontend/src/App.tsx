import { useState } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { Home } from './components/Home.tsx'
import { UsageStats } from './components/UsageStats.tsx'
import { Leaderboard } from './components/Leaderboard.tsx'
import { Wiki } from './components/Wiki.tsx'
import { Rules } from './components/Rules.tsx'

type Page = 'main' | 'leaderboard' | 'usage' | 'wiki' | 'rules'

const PAGES: { id: Page; label: string }[] = [
  { id: 'main', label: 'Main' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'usage', label: 'Usage Stats' },
  { id: 'wiki', label: 'Wiki' },
  { id: 'rules', label: 'Rules' },
]

function App() {
  const [page, setPage] = useState<Page>('main')
  const [menuOpen, setMenuOpen] = useState(false)

  const goTo = (p: Page) => {
    setPage(p)
    setMenuOpen(false)
  }

  return (
    <div className="min-h-screen flex flex-col relative">
      <Analytics />
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 bg-surface/90 backdrop-blur-md border-b border-border">
        <img
          src="/logo.png"
          alt="Aurora Cobble"
          className="block h-30 w-auto max-w-[340px] object-contain object-left"
        />
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

      <main className="flex-1 p-4 sm:p-6 min-w-0">
        {page === 'main' && <Home onNavigate={goTo} />}
        {page === 'usage' && <UsageStats />}
        {page === 'leaderboard' && <Leaderboard />}
        {page === 'wiki' && <Wiki />}
        {page === 'rules' && <Rules />}
      </main>
    </div>
  )
}

export default App
