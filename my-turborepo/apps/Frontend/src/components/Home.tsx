type Page =
  | 'main'
  | 'leaderboard'
  | 'usage'
  | 'wiki'
  | 'rules'
  | 'gacha'
  | 'spawn'
  | 'tournament'
  | 'account'

const QUICK_LINKS: { id: Exclude<Page, 'main'>; label: string; description: string }[] = [
  {
    id: 'leaderboard',
    label: 'Leaderboard',
    description: 'PvP ranks, Cobble$ economy & Battle Tower (live)',
  },
  { id: 'usage', label: 'Usage Stats', description: 'Pokémon usage by tier and format' },
  { id: 'wiki', label: 'Wiki', description: 'Pokédex, moves, evolution & forms' },
  { id: 'rules', label: 'Rules', description: 'Format rules & restrictions' },
  { id: 'gacha', label: 'Gacha', description: 'Open loot & collect rewards (login required)' },
  { id: 'spawn', label: 'Spawn', description: 'Pokemon spawn locations and conditions' },
  {
    id: 'tournament',
    label: 'Tournament',
    description: 'Live bracket, qualifiers & prizes',
  },
  {
    id: 'account',
    label: 'Account',
    description: 'Sign in, profile & site wallet (login required)',
  },
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
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(120%,600px)] h-[min(120%,400px)] rounded-full blur-3xl bg-gradient-to-br from-sky-500/10 via-fuchsia-500/10 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-sky-400/40 to-transparent" />
        </div>
        <div className="relative">
          <img
            src="/logo.png"
            alt="Aurora Cobble"
            className="block w-full max-w-[min(480px,90vw)] h-auto mx-auto mb-6 object-contain drop-shadow-[0_0_48px_rgba(56,189,248,0.25)]"
          />
          <p className="text-xl sm:text-2xl text-muted font-semibold tracking-wide m-0">
            Cobblemon ranked stats & leaderboards
          </p>
          <p className="text-base sm:text-lg text-muted/85 mt-3 m-0 max-w-md mx-auto">
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
            className="group pixel-panel-soft text-left w-full p-5 sm:p-6 transition-[filter] duration-150 hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050510]"
          >
            <span className="block text-lg font-bold text-[#e2e8f0] group-hover:text-accent transition-colors">
              {label}
            </span>
            <span className="block text-base text-muted mt-1.5">{description}</span>
            <span className="inline-flex items-center gap-1 text-sm text-accent mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
              Open
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </button>
        ))}
      </section>

      {!onNavigate && (
        <p className="text-center text-base text-muted/80 mt-8">
          Use the menu to switch sections — Leaderboard, Usage, Wiki, Rules, Gacha, Spawn, Tournament, and Account.
        </p>
      )}
    </div>
  )
}
