type Page = 'main' | 'leaderboard' | 'usage' | 'wiki' | 'rules' | 'gacha'

const QUICK_LINKS: { id: Exclude<Page, 'main'>; label: string; description: string }[] = [
  { id: 'leaderboard', label: 'Leaderboard', description: 'Rankings, ELO & tier standings' },
  { id: 'usage', label: 'Usage Stats', description: 'Pokémon usage by tier and format' },
  { id: 'wiki', label: 'Wiki', description: 'Pokédex, moves, evolution & forms' },
  { id: 'rules', label: 'Rules', description: 'Format rules & restrictions' },
  { id: 'gacha', label: 'Gacha', description: 'Open loot & collect rewards (login required)' },
]

interface HomeProps {
  onNavigate?: (page: Page) => void
}

export function Home({ onNavigate }: HomeProps) {
  return (
    <div className="w-full max-w-4xl mx-auto py-8 sm:py-12">
      {/* Hero */}
      <section className="relative text-center mb-12 sm:mb-16">
        <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(120%,600px)] h-[min(120%,400px)] bg-accent/5 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />
        </div>
        <div className="relative">
          <img
            src="/logo.png"
            alt="Aurora Cobble"
            className="block w-full max-w-[min(480px,90vw)] h-auto mx-auto mb-6 object-contain drop-shadow-[0_0_40px_rgba(167,139,250,0.15)]"
          />
          <p className="text-lg sm:text-xl text-muted font-medium tracking-wide m-0">
            Cobblemon ranked stats & leaderboards
          </p>
          <p className="text-sm text-muted/80 mt-2 m-0 max-w-md mx-auto">
            Track rankings, usage, and format rules for your server.
          </p>
        </div>
      </section>

      {/* Quick links */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {QUICK_LINKS.map(({ id, label, description }) => (
          <button
            key={id}
            type="button"
            onClick={() => onNavigate?.(id)}
            className="group text-left rounded-xl bg-surface/80 border border-border p-5 sm:p-6 transition-all duration-200 hover:bg-surface-hover hover:border-accent/40 hover:shadow-[0_0_24px_rgba(167,139,250,0.08)] focus:outline-none focus:ring-2 focus:ring-accent/50 focus:ring-offset-2 focus:ring-offset-[#0f0a1a]"
          >
            <span className="block text-base font-semibold text-[#e2e8f0] group-hover:text-accent transition-colors">
              {label}
            </span>
            <span className="block text-sm text-muted mt-1">{description}</span>
            <span className="inline-flex items-center gap-1 text-xs text-accent mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
              Open
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </button>
        ))}
      </section>

      {!onNavigate && (
        <p className="text-center text-sm text-muted/80 mt-8">
          Use the menu to switch between Leaderboard, Usage Stats, Wiki, and Rules.
        </p>
      )}
    </div>
  )
}
