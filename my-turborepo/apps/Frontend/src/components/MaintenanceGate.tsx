import { useEffect, useState } from 'react'
import { fetchSiteMaintenance, type SiteMaintenance } from '../api'
import { useAuth } from '../contexts/AuthContext'

const POLL_MS = 60_000

const DEFAULT_MESSAGE =
  'Website đang bảo trì. Vui lòng quay lại sau, cảm ơn bạn đã kiên nhẫn!'

/**
 * Blocks the site while website maintenance is on.
 * Admins get a dismissible banner instead so they can keep working.
 */
export function MaintenanceGate() {
  const { user, loading: authLoading } = useAuth()
  const [state, setState] = useState<SiteMaintenance | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const poll = () => {
      fetchSiteMaintenance()
        .then((res) => {
          if (!cancelled) setState(res)
        })
        /* A failing poll must never lock people out of the site. */
        .catch(() => {})
    }
    poll()
    const t = window.setInterval(poll, POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(t)
    }
  }, [])

  const active = state?.enabled === true
  const isAdmin = !authLoading && Boolean(user?.is_admin)

  useEffect(() => {
    if (!active || isAdmin) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [active, isAdmin])

  if (!active) return null

  const message = state?.message?.trim() ? state.message : DEFAULT_MESSAGE

  if (isAdmin) {
    if (dismissed) return null
    return (
      <div className="fixed bottom-4 left-1/2 z-[100] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 pixel-panel px-4 py-3 shadow-[4px_4px_0_#0a0618]">
        <div className="flex items-start gap-3">
          <p className="m-0 flex-1 text-sm text-[#ecebff]">
            <span className="font-bold text-accent">Website maintenance is ON.</span> Players see a
            blocking popup — you can still browse as admin.
          </p>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="pixel-btn px-2 py-1 text-xs text-muted"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="maintenance-title"
    >
      <div className="w-full max-w-md pixel-panel overflow-hidden shadow-[4px_4px_0_#0a0618]">
        <div className="p-6 sm:p-8 text-center">
          <div className="text-5xl mb-4" aria-hidden>
            🛠️
          </div>
          <h2 id="maintenance-title" className="text-2xl font-bold text-[#f5efe6] m-0">
            Đang bảo trì
          </h2>
          <p className="mt-3 mb-0 text-sm leading-relaxed text-[#ecebff]">{message}</p>
          <p className="mt-4 mb-0 text-xs text-muted">
            Trang sẽ tự mở lại ngay khi bảo trì kết thúc, bạn không cần tải lại.
          </p>
        </div>
      </div>
    </div>
  )
}
