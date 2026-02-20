import { useState } from 'react'
import { Overview } from './components/Overview.tsx'
import { LeaderboardAdmin } from './components/LeaderboardAdmin.tsx'
import { UsageStatsAdmin } from './components/UsageStatsAdmin.tsx'

type Section = 'overview' | 'leaderboard' | 'usage' | 'settings' | 'bans'

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'usage', label: 'Usage stats' },
  { id: 'settings', label: 'Settings' },
  { id: 'bans', label: 'Bans' },
]

function Placeholder({ title }: { title: string }) {
  return (
    <div className="rounded-lg bg-surface border border-border p-8 text-center text-muted">
      <h2 className="text-xl font-semibold m-0 mb-2 text-[#e2e8f0]">{title}</h2>
      <p className="m-0">Coming soon. Configure from your server or backend.</p>
    </div>
  )
}

export default function App() {
  const [section, setSection] = useState<Section>('overview')
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Header (mobile) */}
      <header className="md:hidden sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-surface/95 backdrop-blur border-b border-border">
        <span className="font-semibold">Admin</span>
        <button
          type="button"
          className={`w-11 h-11 flex flex-col justify-center gap-1 rounded-lg transition-colors ${menuOpen ? 'burger-open' : ''}`}
          aria-label="Menu"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span className="block w-5 h-0.5 rounded bg-current" />
          <span className="block w-5 h-0.5 rounded bg-current" />
          <span className="block w-5 h-0.5 rounded bg-current" />
        </button>
      </header>

      {/* Overlay when sidebar open on mobile */}
      <div
        className={`fixed inset-0 bg-black/50 z-30 md:hidden transition-opacity ${menuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        aria-hidden={!menuOpen}
        onClick={() => setMenuOpen(false)}
      />

      {/* Sidebar */}
      <aside
        className={`fixed md:sticky top-0 left-0 z-40 w-56 min-h-screen py-6 px-3 bg-surface/95 backdrop-blur border-r border-border md:translate-x-0 transition-transform ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="md:pt-4">
          <img
            src="/logo.png"
            alt="Aurora Cobble"
            className="block w-full max-w-[180px] h-auto mx-auto mb-6 object-contain"
          />
          <nav className="space-y-0.5">
            {SECTIONS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setSection(id)
                  setMenuOpen(false)
                }}
                className={`block w-full text-left py-2.5 px-3 rounded-lg text-sm transition-colors ${
                  section === id
                    ? 'bg-accent/20 text-accent font-medium'
                    : 'text-muted hover:bg-surface-hover hover:text-[#e2e8f0]'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-4 sm:p-6 min-w-0">
        <div className="max-w-5xl mx-auto">
          {section === 'overview' && <Overview />}
          {section === 'leaderboard' && <LeaderboardAdmin />}
          {section === 'usage' && <UsageStatsAdmin />}
          {section === 'settings' && <Placeholder title="Settings" />}
          {section === 'bans' && <Placeholder title="Bans" />}
        </div>
      </main>
    </div>
  )
}
