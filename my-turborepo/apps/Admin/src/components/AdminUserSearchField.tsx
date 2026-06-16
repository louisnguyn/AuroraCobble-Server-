import { useEffect, useRef, useState } from 'react'
import { fetchAdminUsers, type AdminUser } from '../authApi'

export function AdminUserSearchField({
  label = 'Display name (IGN)',
  value,
  onChange,
  placeholder = 'Search website accounts…',
  inputClassName,
  hint,
}: {
  label?: string
  value: string
  onChange: (username: string) => void
  placeholder?: string
  inputClassName?: string
  hint?: string
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [suggestions, setSuggestions] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(value.trim()), 250)
    return () => window.clearTimeout(t)
  }, [value])

  useEffect(() => {
    if (!open || debouncedQuery.length < 1) {
      setSuggestions([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    fetchAdminUsers(debouncedQuery)
      .then((r) => {
        if (!cancelled) setSuggestions(r.users)
      })
      .catch(() => {
        if (!cancelled) setSuggestions([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [debouncedQuery, open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const el = wrapRef.current
      if (el && e.target instanceof Node && !el.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const showList = open && value.trim().length > 0

  return (
    <div ref={wrapRef} className="relative space-y-1">
      <label className="flex flex-col gap-1.5 text-xs text-muted">
        {label}
        <input
          type="search"
          className={inputClassName}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      {hint ? <p className="text-[0.65rem] text-muted m-0 leading-snug">{hint}</p> : null}
      {showList ? (
        <ul className="absolute z-30 mt-0.5 w-full max-h-52 overflow-y-auto rounded-xl border border-violet-500/35 bg-[#121426] shadow-xl text-sm">
          {loading ? (
            <li className="px-3 py-2 text-muted">Searching…</li>
          ) : suggestions.length === 0 ? (
            <li className="px-3 py-2 text-muted">No matching accounts — you can still type a name manually.</li>
          ) : (
            suggestions.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-violet-500/15 text-[#f5efe6] border-b border-violet-500/10 last:border-0"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(u.username)
                    setOpen(false)
                    setSuggestions([])
                  }}
                >
                  <span className="font-medium font-mono">{u.username}</span>
                  <span className="text-muted text-xs block truncate">{u.email}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
