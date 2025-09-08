import React from 'react'
import { apiUrl } from '../config/api'
import { Button } from './ui/button'
import { ChevronLeft, ChevronRight, Download } from 'lucide-react'

export function ImageViewer({ images, index, name, onClose }: { images: string[], index: number, name?: string, onClose: ()=>void }) {
  const total = images.length
  const [idx, setIdx] = React.useState(index)
  const src = apiUrl(images[idx])
  const [scale, setScale] = React.useState(1)
  const [offset, setOffset] = React.useState({ x: 0, y: 0 })
  const [dragging, setDragging] = React.useState(false)
  const lastPos = React.useRef<{x:number,y:number}>({ x: 0, y: 0 })
  const wrapRef = React.useRef<HTMLDivElement | null>(null)

  const prev = React.useCallback(() => { setIdx(i => (i - 1 + total) % total); setScale(1); setOffset({x:0,y:0}) }, [total])
  const next = React.useCallback(() => { setIdx(i => (i + 1) % total); setScale(1); setOffset({x:0,y:0}) }, [total])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev() }
      if (e.key === 'ArrowRight') { e.preventDefault(); next() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prev, next, onClose])

  const download = () => {
    const a = document.createElement('a')
    a.href = src
    a.download = src.split('/').pop() || 'image.png'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const onWheel: React.WheelEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.2 : 0.2
    setScale(s => Math.min(8, Math.max(1, +(s + delta).toFixed(2))))
  }
  const onMouseDown: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (scale <= 1) return
    setDragging(true)
    lastPos.current = { x: e.clientX, y: e.clientY }
  }
  const onMouseMove: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (!dragging) return
    const dx = e.clientX - lastPos.current.x
    const dy = e.clientY - lastPos.current.y
    lastPos.current = { x: e.clientX, y: e.clientY }
    setOffset(o => ({ x: o.x + dx, y: o.y + dy }))
  }
  const endDrag = () => setDragging(false)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="font-medium">{name || 'Preview'}</div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={download}><Download className="w-4 h-4" /></Button>
          <Button size="sm" variant="outline" onClick={prev}><ChevronLeft className="w-4 h-4" /></Button>
          <Button size="sm" variant="outline" onClick={next}><ChevronRight className="w-4 h-4" /></Button>
        </div>
      </div>
      <div
        ref={wrapRef}
        className="relative h-[60vh] border border-zinc-800 rounded bg-black/60 overflow-hidden"
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
      >
        <img
          src={src}
          alt="viewer"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: 'center center' }}
          className="absolute inset-0 m-auto max-w-full max-h-full select-none"
          draggable={false}
        />
      </div>
      <div className="text-xs text-zinc-400">{idx+1}/{total}</div>
    </div>
  )
}

