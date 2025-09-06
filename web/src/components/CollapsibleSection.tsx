import React from 'react'

type Props = {
  title: string
  subtitle?: string
  summary?: string
  storageKey?: string
  defaultOpen?: boolean
  children: React.ReactNode
  className?: string
}

export function CollapsibleSection({ title, subtitle, summary, storageKey, defaultOpen = true, children, className }: Props) {
  const [open, setOpen] = React.useState<boolean>(() => {
    if (!storageKey) return defaultOpen
    try {
      const v = localStorage.getItem(storageKey)
      return v == null ? defaultOpen : v === '1'
    } catch {
      return defaultOpen
    }
  })
  const toggle = () => {
    setOpen(prev => {
      const next = !prev
      if (storageKey) {
        try { localStorage.setItem(storageKey, next ? '1' : '0') } catch {}
      }
      return next
    })
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between cursor-pointer select-none" onClick={toggle}>
        <div>
          <h3 className="text-sm font-medium">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3">
          {summary && !open && (
            <span className="text-xs text-muted-foreground hidden md:inline">{summary}</span>
          )}
          <span aria-hidden className={`transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
        </div>
      </div>
      {open && (
        <div className="mt-3">
          {children}
        </div>
      )}
    </div>
  )
}

