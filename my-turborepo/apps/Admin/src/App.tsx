import { useEffect, useState } from 'react'
import { getToken, setToken, clearToken, fetchMe } from './authApi'
import type { AuthUser } from './authApi'
import { Login } from './components/Login.tsx'
import { UsageStatsAdmin } from './components/UsageStatsAdmin.tsx'
import { UsersAdmin } from './components/UsersAdmin.tsx'
import { MinecraftDashboard } from './components/MinecraftDashboard.tsx'
import { TournamentAdmin } from './components/TournamentAdmin.tsx'
import { VerificationRequestsAdmin } from './components/VerificationRequestsAdmin.tsx'
import { RoleRequestsAdmin } from './components/RoleRequestsAdmin.tsx'
import { CobbleRankedAdmin } from './components/CobbleRankedAdmin.tsx'
import { RoleBadge } from './components/RoleBadge.tsx'

type Section =
  | 'usage'
  | 'users'
  | 'verifications'
  | 'role_requests'
  | 'minecraft'
  | 'tournament'
  | 'cobble_ranked'
  | 'settings'
  | 'bans'

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'minecraft', label: 'Server Dashboard' },
  { id: 'tournament', label: 'Tournaments' },
  { id: 'cobble_ranked', label: 'CobbleRanked' },
  { id: 'usage', label: 'Usage stats' },
  { id: 'users', label: 'Website users' },
  { id: 'verifications', label: 'Verification requests' },
  { id: 'role_requests', label: 'Rank requests' },
  { id: 'settings', label: 'Settings' },
  { id: 'bans', label: 'Bans' },
]

function Placeholder({ title }: { title: string }) {
  return (
    <div className="rounded-lg bg-surface border border-border p-8 text-center text-muted">
      <h2 className="text-xl font-semibold m-0 mb-2 text-[#f5efe6]">{title}</h2>
      <p className="m-0">Coming soon. Configure from your server or backend.</p>
    </div>
  )
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [section, setSection] = useState<Section>('minecraft')
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setLoading(false)
      return
    }
    fetchMe()
      .then(({ user: u }) => {
        if (u.is_admin) setUser(u)
        else {
          clearToken()
          setUser(null)
        }
      })
      .catch(() => {
        clearToken()
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const handleLoginSuccess = (token: string, u: AuthUser) => {
    setToken(token)
    setUser(u)
  }

  const handleLogout = () => {
    clearToken()
    setUser(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

  if (!user) {
    return <Login onSuccess={handleLoginSuccess} />
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Header (mobile) */}
      <header className="md:hidden admin-header sticky top-0 z-20 flex items-center justify-between px-4 py-3">
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
        className={`fixed md:sticky top-0 left-0 z-40 w-56 min-h-screen py-6 px-3 admin-sidebar md:translate-x-0 transition-transform ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="md:pt-4">
          <img
            src="/logo.png"
            alt="Aurora Cobble"
            className="block w-full max-w-[180px] h-auto mx-auto mb-6 object-contain"
          />
          <div className="mb-4 mx-2 p-3 rounded-xl bg-surface-hover/80 border border-border/60">
            <div className="flex items-center gap-3">
              <div
                className="flex-shrink-0 w-9 h-9 rounded-full bg-accent/25 border border-accent/40 flex items-center justify-center text-accent font-semibold text-sm"
                aria-hidden
              >
                {user.username.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[#f5efe6] truncate flex items-center gap-1.5" title={user.username}>
                  <RoleBadge roleKey={user.minecraft_role ?? 'member'} compact className="shrink-0" />
                  <span className="truncate">{user.username}</span>
                </p>
                <p className="text-xs text-muted truncate" title={user.email}>
                  {user.email}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-3 w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium text-accent bg-accent/10 border border-accent/30 hover:bg-accent/20 hover:border-accent/50 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign out
            </button>
          </div>
          <p className="sidebar-section-label px-2 mb-2">Admin</p>
          <nav className="space-y-1">
            {SECTIONS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setSection(id)
                  setMenuOpen(false)
                }}
                className={`sidebar-nav-item block w-full text-left py-2.5 px-3 text-sm transition-colors ${
                  section === id
                    ? 'sidebar-nav-item-active font-medium'
                    : 'text-muted'
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
        <div
          className={
            section === 'minecraft' || section === 'tournament' || section === 'cobble_ranked'
              ? 'max-w-6xl mx-auto'
              : 'max-w-5xl mx-auto'
          }
        >
          {section === 'usage' && <UsageStatsAdmin />}
          {section === 'users' && <UsersAdmin currentAdminId={user.id} />}
          {section === 'verifications' && <VerificationRequestsAdmin />}
          {section === 'role_requests' && <RoleRequestsAdmin />}
          {section === 'minecraft' && <MinecraftDashboard viewerUsername={user.username} />}
          {section === 'tournament' && <TournamentAdmin />}
          {section === 'cobble_ranked' && <CobbleRankedAdmin />}
          {section === 'settings' && <Placeholder title="Settings" />}
          {section === 'bans' && <Placeholder title="Bans" />}
        </div>
      </main>
    </div>
  )
}
