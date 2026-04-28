import { useEffect, useMemo, useRef, useState } from 'react'

export type CustomSelectOption = {
  value: string
  label: string
}

type Props = {
  id?: string
  value: string
  options: CustomSelectOption[]
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  className?: string
  buttonClassName?: string
  menuClassName?: string
  optionClassName?: string
}

export function CustomSelect({
  id,
  value,
  options,
  onChange,
  disabled = false,
  placeholder = 'Select…',
  className = '',
  buttonClassName = '',
  menuClassName = '',
  optionClassName = '',
}: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value])

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [])

  return (
    <div ref={rootRef} className={`custom-select ${className}`}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`custom-select-trigger ${buttonClassName}`}
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
        <svg viewBox="0 0 24 24" className={`custom-select-chevron ${open ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      {open && !disabled && (
        <div role="listbox" className={`custom-select-menu ${menuClassName}`}>
          {options.map((opt) => {
            const isActive = opt.value === value
            return (
              <button
                key={opt.value || '__empty'}
                type="button"
                className={`custom-select-option ${isActive ? 'custom-select-option-active' : ''} ${optionClassName}`}
                onClick={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
