import { PageLinkCard, PageShell } from './PageLayout.tsx'

type Page =
  | 'main'
  | 'leaderboard'
  | 'usage'
  | 'wiki'
  | 'restrictions'
  | 'teambuilder'
  | 'gacha'
  | 'poker'
  | 'spawn'
  | 'tournament'
  | 'account'
  | 'clan'

const QUICK_LINKS: { id: Exclude<Page, 'main'>; label: string; description: string; adminOnly?: boolean }[] = [
  {
    id: 'leaderboard',
    label: 'Leaderboard',
    description: 'PvP ladder, economy boards, and achievement badges',
  },
  { id: 'usage', label: 'Usage Stats', description: 'Meta usage by tier and competitive format' },
  { id: 'wiki', label: 'Wiki', description: 'Pokédex data, moves, evolutions, and forms' },
  { id: 'restrictions', label: 'Restrictions', description: 'Format limits and competitive rules' },
  {
    id: 'teambuilder',
    label: 'Team Builder',
    description: 'Build Showdown teams with sprites and export',
  },
  { id: 'gacha', label: 'Gacha', description: 'Ticket wheel — items and rare tickets' },
  { id: 'poker', label: 'Pokémon Poker', description: 'Hold’em tables with Pokémon cards', adminOnly: true },
  { id: 'spawn', label: 'Spawn', description: 'Spawn locations and encounter conditions' },
  {
    id: 'tournament',
    label: 'Tournament',
    description: 'Brackets, qualifiers, prizes, and predictions',
  },
  {
    id: 'clan',
    label: 'Clan',
    description: 'Create a clan, request to join, donate, and grow your fund',
    adminOnly: true,
  },
  {
    id: 'account',
    label: 'Account',
    description: 'Profile, wallet, shop, ranks, and verification',
  },
]

interface HomeProps {
  onNavigate?: (page: Page) => void
  showAdminOnlyLinks?: boolean
}

export function Home({ onNavigate, showAdminOnlyLinks = false }: HomeProps) {
  const links = QUICK_LINKS.filter((l) => !l.adminOnly || showAdminOnlyLinks)
  return (
    <div className="w-full py-8 sm:py-12">
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
            src="/logo_text.png"
            alt="Asteryn Cobblemon SMP"
            className="hero-logo-motion block w-full max-w-[min(500px,90vw)] h-auto mx-auto mb-6 object-contain drop-shadow-[0_0_45px_rgba(34,211,238,0.18)]"
          />
          <p className="text-xl sm:text-2xl text-[#ecebff] font-semibold tracking-wide m-0">
            Competitive Hub for Asteryn Cobblemon SMP
          </p>
          <p className="text-base sm:text-lg text-muted/90 mt-3 m-0 max-w-3xl mx-auto leading-relaxed">
            A web platform for the Asteryn Cobblemon SMP competitive community: team building, live leaderboards,
            tournament brackets, economy tools, usage analytics, and account management in one place.
          </p>
        </div>
      </section>

      <PageShell max="5xl" className="space-y-4 pb-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-1">
          {links.map(({ id, label, description }) => (
            <PageLinkCard
              key={id}
              label={label}
              description={description}
              onClick={() => onNavigate?.(id)}
            />
          ))}
        </div>
      </PageShell>

      {!onNavigate && (
        <p className="text-center text-base text-muted/80 mt-8 max-w-3xl mx-auto">
          Use the navigation menu to open Leaderboard, Usage Stats, Wiki, Restrictions, Team Builder, Gacha,
          Spawn, Tournament, and Account.
        </p>
      )}
    </div>
  )
}
