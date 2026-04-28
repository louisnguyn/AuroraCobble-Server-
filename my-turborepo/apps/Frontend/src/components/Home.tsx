type Page =
  | 'main'
  | 'leaderboard'
  | 'usage'
  | 'wiki'
  | 'rules'
  | 'teambuilder'
  | 'gacha'
  | 'spawn'
  | 'tournament'
  | 'account'

const QUICK_LINKS: { id: Exclude<Page, 'main'>; label: string; description: string }[] = [
  {
    id: 'leaderboard',
    label: 'Leaderboard',
    description: 'PvP ranks, Cobble$ / PCO economy & Battle Tower (live)',
  },
  { id: 'usage', label: 'Usage Stats', description: 'Pokémon usage by tier and format' },
  { id: 'wiki', label: 'Wiki', description: 'Pokédex, moves, evolution & forms' },
  { id: 'rules', label: 'Rules', description: 'Format rules & restrictions' },
  {
    id: 'teambuilder',
    label: 'Team Builder',
    description: 'Paste a Showdown team — sprites & item icons',
  },
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
    <div className="w-full py-8 sm:py-12">
      {/* Hero */}
      <section className="hero-wide-shell relative text-center mb-12 sm:mb-16 -mx-4 sm:-mx-6 px-4 sm:px-6 py-10 sm:py-14">
        <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
          <div className="hero-glow-orb absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(120%,640px)] h-[min(120%,420px)] rounded-full blur-3xl bg-gradient-to-br from-violet-600/18 via-cyan-500/12 to-transparent" />
          <div className="hero-glow-orb-secondary absolute top-8 left-1/2 -translate-x-1/2 w-[min(100%,540px)] h-[240px] rounded-full blur-3xl bg-gradient-to-r from-cyan-500/8 via-violet-500/10 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />
        </div>
        <div className="relative hero-float-wrap">
          <div className="hero-entity hero-entity-a" aria-hidden>
            <span className="hero-pokeball hero-ball-pokeball"><i className="hero-ball-mark mark-pokeball" /></span>
          </div>
          <div className="hero-entity hero-entity-b" aria-hidden>
            <span className="hero-pokeball hero-ball-great"><i className="hero-ball-mark mark-great" /></span>
          </div>
          <div className="hero-entity hero-entity-c" aria-hidden>
            <span className="hero-pokeball hero-ball-ultra"><i className="hero-ball-mark mark-ultra" /></span>
          </div>
          <div className="hero-entity hero-entity-d" aria-hidden>
            <span className="hero-pokeball hero-ball-master"><i className="hero-ball-mark mark-master" /></span>
          </div>
          <div className="hero-entity hero-entity-e" aria-hidden>
            <span className="hero-pokeball hero-ball-origin"><i className="hero-ball-mark mark-origin" /></span>
          </div>
          <img
            src="/logo.png"
            alt="Aurora Cobble"
            className="hero-logo-motion block w-full max-w-[min(500px,90vw)] h-auto mx-auto mb-6 object-contain drop-shadow-[0_0_45px_rgba(34,211,238,0.18)]"
          />
          <p className="text-xl sm:text-2xl text-[#ecebff] font-semibold tracking-wide m-0">
            Competitive Hub for AuroraCobble Adventure Server
          </p>
          <p className="text-base sm:text-lg text-muted/90 mt-3 m-0 max-w-4xl mx-auto">
            Build teams, follow live ladders, open gacha rewards, climb the rankings, and dominate the
            leaderboards. Track usage stats, join tournaments, and manage your Cobble$ journey in one place.
            Home to 50+ dedicated trainers, ultra-rare hunts at 0.001%, no inflation, and no resets.
          </p>
        </div>
      </section>

      {/* Quick links */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-5xl mx-auto px-1">
        {QUICK_LINKS.map(({ id, label, description }) => (
          <button
            key={id}
            type="button"
            onClick={() => onNavigate?.(id)}
            className="group pixel-panel-soft text-left w-full p-5 sm:p-6 transition-[filter] duration-150 hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/65 focus-visible:ring-offset-2 focus-visible:ring-offset-[#141210]"
          >
            <span className="block text-lg font-bold text-[#f5efe6] group-hover:text-accent transition-colors">
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
        <p className="text-center text-base text-muted/80 mt-8 max-w-5xl mx-auto">
          Use the menu to switch sections — Leaderboard, Usage, Wiki, Rules, Team Builder, Gacha, Spawn,
          Tournament, and Account.
        </p>
      )}
    </div>
  )
}
