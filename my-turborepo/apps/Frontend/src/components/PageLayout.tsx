import type { ReactNode } from 'react'

export type PageAccent = 'violet' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'sky' | 'gold'

const ACCENT_HEADER: Record<
  PageAccent,
  { shell: string; eyebrow: string; shadow: string }
> = {
  violet: {
    shell: 'border-violet-500/30 bg-gradient-to-br from-violet-950/45 via-[#120a22]/90 to-[#0f0a1a]/95',
    eyebrow: 'text-violet-300/90',
    shadow: 'shadow-[0_12px_40px_rgba(0,0,0,0.35)]',
  },
  cyan: {
    shell: 'border-cyan-500/30 bg-gradient-to-br from-cyan-950/35 via-[#0a1018]/90 to-[#0f0a1a]/95',
    eyebrow: 'text-cyan-300/90',
    shadow: 'shadow-[0_12px_40px_rgba(0,0,0,0.35)]',
  },
  emerald: {
    shell: 'border-emerald-500/30 bg-gradient-to-br from-emerald-950/45 via-[#0a120f]/90 to-[#0f0a1a]/95',
    eyebrow: 'text-emerald-300/90',
    shadow: 'shadow-[0_12px_40px_rgba(0,0,0,0.35)]',
  },
  amber: {
    shell: 'border-amber-500/30 bg-gradient-to-br from-amber-950/35 via-[#141008]/90 to-[#0f0a1a]/95',
    eyebrow: 'text-amber-300/90',
    shadow: 'shadow-[0_12px_40px_rgba(0,0,0,0.35)]',
  },
  rose: {
    shell: 'border-rose-500/28 bg-gradient-to-br from-rose-950/30 via-[#140a10]/90 to-[#0f0a1a]/95',
    eyebrow: 'text-rose-300/90',
    shadow: 'shadow-[0_12px_40px_rgba(0,0,0,0.35)]',
  },
  sky: {
    shell: 'border-sky-500/30 bg-gradient-to-br from-sky-950/35 via-[#0a1018]/90 to-[#0f0a1a]/95',
    eyebrow: 'text-sky-300/90',
    shadow: 'shadow-[0_12px_40px_rgba(0,0,0,0.35)]',
  },
  gold: {
    shell: 'border-amber-500/35 bg-gradient-to-br from-amber-950/40 via-[#120f0a]/88 to-[#0f0a1a]/95',
    eyebrow: 'text-amber-200/90',
    shadow: 'shadow-[0_12px_40px_rgba(0,0,0,0.35)]',
  },
}

type PageMaxWidth = '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | '7xl' | 'full'

const MAX_WIDTH: Record<PageMaxWidth, string> = {
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
  full: 'max-w-full',
}

export function PageShell({
  children,
  max = '6xl',
  className = '',
}: {
  children: ReactNode
  max?: PageMaxWidth
  className?: string
}) {
  return (
    <div className={`w-full ${MAX_WIDTH[max]} mx-auto space-y-6 pb-10 ${className}`.trim()}>
      {children}
    </div>
  )
}

export function PageHeader({
  eyebrow,
  title,
  description,
  accent = 'violet',
  aside,
  footer,
  className = '',
  children,
}: {
  eyebrow?: string
  title: ReactNode
  description?: ReactNode
  accent?: PageAccent
  aside?: ReactNode
  footer?: ReactNode
  className?: string
  children?: ReactNode
}) {
  const tone = ACCENT_HEADER[accent]
  return (
    <header
      className={`rounded-2xl border p-5 sm:p-7 ${tone.shell} ${tone.shadow} ${className}`.trim()}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2 min-w-0 flex-1">
          {eyebrow ? (
            <p
              className={`text-[10px] uppercase tracking-[0.2em] font-semibold m-0 ${tone.eyebrow}`}
            >
              {eyebrow}
            </p>
          ) : null}
          <h1 className="text-2xl sm:text-3xl font-bold m-0 text-[#f5efe6] leading-tight">{title}</h1>
          {description ? (
            <div className="text-sm text-muted m-0 max-w-3xl leading-relaxed">{description}</div>
          ) : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
      {footer ? <div className="mt-4 pt-4 border-t border-white/5">{footer}</div> : null}
      {children ? <div className="mt-4">{children}</div> : null}
    </header>
  )
}

export function PageSection({
  title,
  description,
  children,
  className = '',
  padded = true,
}: {
  title?: ReactNode
  description?: ReactNode
  children: ReactNode
  className?: string
  padded?: boolean
}) {
  return (
    <section
      className={`rounded-xl border border-border/60 bg-gradient-to-b from-[#101820]/70 to-[#0f0a1a]/90 ${
        padded ? 'p-4 sm:p-5' : ''
      } space-y-4 ${className}`.trim()}
    >
      {title || description ? (
        <div className="space-y-1">
          {title ? <h2 className="text-base font-semibold text-[#f5efe6] m-0">{title}</h2> : null}
          {description ? <p className="text-xs text-muted m-0">{description}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function PageTabBar<T extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
  className = '',
}: {
  tabs: readonly { id: T; label: string }[]
  active: T
  onChange: (id: T) => void
  ariaLabel: string
  className?: string
}) {
  return (
    <div
      className={`page-tab-bar flex flex-wrap gap-1.5 p-1 rounded-xl border border-border/55 bg-[#0f0a1a]/55 ${className}`.trim()}
      role="tablist"
      aria-label={ariaLabel}
    >
      {tabs.map(({ id, label }) => {
        const isActive = active === id
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(id)}
            className={`page-tab-bar-btn flex-1 min-w-[5.5rem] sm:flex-none sm:min-w-0 py-2.5 px-4 rounded-lg text-sm font-semibold transition-colors border ${
              isActive
                ? 'border-accent/50 bg-accent/15 text-[#f5efe6] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                : 'border-transparent bg-transparent text-muted hover:text-[#e2e8f0] hover:bg-white/[0.04]'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

export function PageNotice({
  children,
  variant = 'info',
  className = '',
}: {
  children: ReactNode
  variant?: 'info' | 'warn' | 'success'
  className?: string
}) {
  const styles =
    variant === 'warn'
      ? 'border-amber-500/35 bg-amber-950/25 text-amber-100/95'
      : variant === 'success'
        ? 'border-emerald-500/35 bg-emerald-950/25 text-emerald-100/95'
        : 'border-border/55 bg-[#0f0a1a]/45 text-muted'
  return (
    <p className={`text-sm m-0 rounded-xl border px-3 py-2.5 leading-relaxed ${styles} ${className}`.trim()}>
      {children}
    </p>
  )
}

export function PageEmptyState({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-dashed border-border/60 bg-[#0f0a1a]/30 px-4 py-10 text-center ${className}`.trim()}
    >
      <p className="text-sm text-muted m-0">{children}</p>
    </div>
  )
}

export function PageLinkCard({
  label,
  description,
  onClick,
}: {
  label: string
  description: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group page-link-card text-left w-full p-5 sm:p-6 rounded-xl border border-border/55 bg-gradient-to-br from-[#161422]/95 to-[#0f0a1a]/96 transition-[filter,border-color] duration-150 hover:border-violet-500/35 hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/65 focus-visible:ring-offset-2 focus-visible:ring-offset-[#141210]"
    >
      <span className="block text-lg font-bold text-[#f5efe6] group-hover:text-accent transition-colors">
        {label}
      </span>
      <span className="block text-sm text-muted mt-1.5 leading-relaxed">{description}</span>
      <span className="inline-flex items-center gap-1 text-sm text-accent mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
        Open
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </span>
    </button>
  )
}
