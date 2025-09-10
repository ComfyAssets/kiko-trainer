
import React from 'react'
import { X } from 'lucide-react'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  title?: string
  children?: React.ReactNode
}
export function Dialog({ open, onOpenChange, title, children }: Props) {
  React.useEffect(() => {
    if (!open) return
    // Lock page scroll using a CSS class instead of inline styles
    document.body.classList.add('overflow-hidden')
    // Close on Escape
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onOpenChange(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.classList.remove('overflow-hidden')
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onOpenChange])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60" onClick={() => onOpenChange(false)} />
      <div className="relative w-full max-w-3xl mx-4 rounded-2xl bg-card border shadow-soft">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button className="opacity-70 hover:opacity-100" onClick={() => onOpenChange(false)} aria-label="Close">
            <X />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}
