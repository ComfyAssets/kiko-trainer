
import React from 'react'
import { X } from 'lucide-react'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  title?: string
  children?: React.ReactNode
}
export function Dialog({ open, onOpenChange, title, children }: Props) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
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
