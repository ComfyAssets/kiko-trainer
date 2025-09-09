import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Trash2, RefreshCw, Image as ImageIcon, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { apiUrl } from '../config/api'
import { Dialog } from '../components/ui/dialog'

interface RunInfo {
  name: string
  path: string
  size: string
  size_bytes: number
  modified?: string
  images: string[]
  image_count?: number
}

export function OutputsPage() {
  const [runs, setRuns] = React.useState<RunInfo[]>([])
  const [loading, setLoading] = React.useState(false)
  const [order, setOrder] = React.useState<'asc'|'desc'>('desc')
  const [autoLoad, setAutoLoad] = React.useState(true)
  const [viewer, setViewer] = React.useState<{ name: string, images: string[], index: number } | null>(null)

  const loadRuns = async () => {
    setLoading(true)
    try {
      const res = await fetch(apiUrl('/api/outputs'))
      if (res.ok) {
        const data = await res.json()
        setRuns(data.runs || [])
      }
    } catch (e) {
      console.error('Failed to fetch outputs:', e)
    } finally { setLoading(false) }
  }

  React.useEffect(() => { loadRuns() }, [])

  const deleteRun = async (name: string) => {
    if (!confirm(`Delete output '${name}'? This cannot be undone.`)) return
    try {
      const res = await fetch(apiUrl(`/api/outputs/${encodeURIComponent(name)}`), { method: 'DELETE' })
      if (res.ok) {
        await loadRuns()
      }
    } catch (e) { console.error('Failed to delete run', e) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Outputs</h2>
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1">
            <span className="opacity-70">Order:</span>
            <select value={order} onChange={e=>setOrder(e.target.value as any)} className="border rounded px-2 py-1 bg-background">
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </select>
          </div>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={autoLoad} onChange={e=>setAutoLoad(e.target.checked)} />
            <span className="opacity-70">Auto load on scroll</span>
          </label>
          <Button size="sm" variant="outline" onClick={loadRuns} disabled={loading}>
            <RefreshCw className={loading ? 'w-4 h-4 mr-2 animate-spin' : 'w-4 h-4 mr-2'} /> Refresh
          </Button>
        </div>
      </div>
      {runs.length === 0 && (
        <div className="text-sm text-muted-foreground">No outputs found yet.</div>
      )}
      <div className="grid grid-cols-1 gap-4">
        {runs.map(run => (
          <Card key={run.name}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{run.name}</CardTitle>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{run.size}</span>
                {run.modified && (<><span>•</span><span>{new Date(run.modified).toLocaleString()}</span></>)}
                <Button size="sm" variant="outline" className="ml-2" onClick={() => deleteRun(run.name)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <RunImages run={run} order={order} autoLoad={autoLoad} onOpen={(images, index) => setViewer({ name: run.name, images, index })} />
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!viewer} onOpenChange={(open)=>!open && setViewer(null)} title={viewer?.name || 'Preview'}>
        {viewer && (
          <ViewerContent viewer={viewer} setViewer={setViewer} />
        )}
      </Dialog>
    </div>
  )
}

function RunImages({ run, onOpen, order, autoLoad }: { run: RunInfo, onOpen: (images: string[], index: number) => void, order: 'asc'|'desc', autoLoad: boolean }) {
  const pageSize = 12
  const [images, setImages] = React.useState<string[]>(run.images || [])
  const [total, setTotal] = React.useState<number>(run.image_count ?? (run.images?.length || 0))
  const [loading, setLoading] = React.useState(false)
  const sentinelRef = React.useRef<HTMLDivElement | null>(null)
  React.useEffect(() => {
    if (!autoLoad) return
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          if (!loading && images.length < total) {
            loadMore()
          }
        }
      })
    }, { root: null, rootMargin: '200px', threshold: 0.01 })
    obs.observe(el)
    return () => { obs.disconnect() }
  }, [autoLoad, images.length, total, loading, order])

  // If total is unknown, fetch just the count (limit=0)
  React.useEffect(() => {
    let cancelled = false
    if (total === 0 && (run.image_count == null)) {
      ;(async () => {
        try {
          const res = await fetch(apiUrl(`/api/outputs/${encodeURIComponent(run.name)}/images?offset=0&limit=0&order=${order}`))
          if (res.ok) {
            const data = await res.json()
            if (!cancelled) setTotal(data.total || 0)
          }
        } catch {}
      })()
    }
    return () => { cancelled = true }
  }, [run.name, order])

  // Reset and fetch first page when order changes away from default
  React.useEffect(() => {
    let cancelled = false
    const needInitial = (order !== 'desc') // run.images are desc; for asc, refetch from start
    if (needInitial) {
      setImages([])
      ;(async () => {
        try {
          const res = await fetch(apiUrl(`/api/outputs/${encodeURIComponent(run.name)}/images?offset=0&limit=${pageSize}&order=${order}`))
          if (res.ok) {
            const data = await res.json()
            if (!cancelled) {
              setImages(data.images || [])
              if (typeof data.total === 'number') setTotal(data.total)
            }
          }
        } catch {}
      })()
    } else {
      // Ensure we have total for default too
      if (run.image_count != null) setTotal(run.image_count)
    }
    return () => { cancelled = true }
  }, [order, run.name])

  const loadMore = async () => {
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch(apiUrl(`/api/outputs/${encodeURIComponent(run.name)}/images?offset=${images.length}&limit=${pageSize}&order=${order}`))
      if (res.ok) {
        const data = await res.json()
        setImages(prev => [...prev, ...((data.images as string[]) || [])])
        if (typeof data.total === 'number') setTotal(data.total)
      }
    } catch (e) { console.error('load more failed', e) }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-2">
      {images && images.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {images.map((src, idx) => (
            <button key={idx} onClick={() => onOpen(images, idx)} className="group">
              <img src={apiUrl(src)} loading="lazy" decoding="async" className="h-48 w-full object-cover rounded border group-hover:opacity-90 bg-muted" alt="sample" />
            </button>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ImageIcon className="w-4 h-4" />
          <span>No sample images found</span>
        </div>
      )}
      {images.length < total && (
        <div className="flex justify-center pt-1">
          <Button size="sm" variant="outline" onClick={loadMore} disabled={loading}>{loading ? 'Loading…' : 'Load more'}</Button>
        </div>
      )}
      {images.length < total && (
        <div ref={sentinelRef} className="h-6" />
      )}
      <div className="text-xs text-muted-foreground">{images.length}/{total} shown</div>
    </div>
  )
}

function ViewerContent({ viewer, setViewer }: { viewer: { name: string, images: string[], index: number }, setViewer: (v: any)=>void }) {
  const total = viewer.images.length
  const src = apiUrl(viewer.images[viewer.index])
  const [scale, setScale] = React.useState(1)
  const [offset, setOffset] = React.useState({ x: 0, y: 0 })
  const [dragging, setDragging] = React.useState(false)
  const lastPos = React.useRef<{x:number,y:number}>({ x: 0, y: 0 })
  const wrapRef = React.useRef<HTMLDivElement | null>(null)
  const [natural, setNatural] = React.useState<{w:number,h:number}>({ w: 0, h: 0 })
  const [touchState, setTouchState] = React.useState<{initialDist:number, initialScale:number} | null>(null)
  const [fileSize, setFileSize] = React.useState<number | null>(null)

  const prev = React.useCallback(() => {
    setViewer({ ...viewer, index: (viewer.index - 1 + total) % total })
    setScale(1); setOffset({ x: 0, y: 0 })
  }, [viewer, total, setViewer])

  const next = React.useCallback(() => {
    setViewer({ ...viewer, index: (viewer.index + 1) % total })
    setScale(1); setOffset({ x: 0, y: 0 })
  }, [viewer, total, setViewer])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev() }
      if (e.key === 'ArrowRight') { e.preventDefault(); next() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prev, next])

  const download = () => {
    const a = document.createElement('a')
    a.href = src
    a.download = src.split('/').pop() || 'image.png'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const zoomIn = () => setScale(s => Math.min(8, +(s + 0.25).toFixed(2)))
  const zoomOut = () => setScale(s => Math.max(1, +(s - 0.25).toFixed(2)))
  const resetView = () => { setScale(1); setOffset({ x: 0, y: 0 }) }
  const toggleZoom: React.MouseEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault()
    setScale(s => {
      if (s <= 1.01) return 2
      setOffset({ x: 0, y: 0 })
      return 1
    })
  }

  const fit = () => {
    resetView()
  }

  const fill = () => {
    const wrap = wrapRef.current
    if (!wrap || !natural.w || !natural.h) return resetView()
    const cw = wrap.clientWidth
    const ch = wrap.clientHeight
    if (cw <= 0 || ch <= 0) return resetView()
    const renderedH = cw * (natural.h / natural.w)
    const needScale = ch / renderedH
    setScale(Math.max(1, Math.min(8, needScale)))
    setOffset({ x: 0, y: 0 })
  }

  const onWheel: React.WheelEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.2 : 0.2
    setScale(s => {
      const ns = Math.min(8, Math.max(1, +(s + delta).toFixed(2)))
      return ns
    })
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

  // Touch pinch-zoom support
  const distance = (t1: React.Touch, t2: React.Touch) => {
    const dx = t1.clientX - t2.clientX
    const dy = t1.clientY - t2.clientY
    return Math.sqrt(dx*dx + dy*dy)
  }
  const onTouchStart: React.TouchEventHandler<HTMLDivElement> = (e) => {
    if (e.touches.length === 2) {
      const d = distance(e.touches[0], e.touches[1])
      setTouchState({ initialDist: d, initialScale: scale })
    } else if (e.touches.length === 1 && scale > 1) {
      setDragging(true)
      lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }
  }
  const onTouchMove: React.TouchEventHandler<HTMLDivElement> = (e) => {
    if (e.touches.length === 2 && touchState) {
      e.preventDefault()
      const d = distance(e.touches[0], e.touches[1])
      const factor = d / (touchState.initialDist || 1)
      const ns = Math.min(8, Math.max(1, +(touchState.initialScale * factor).toFixed(2)))
      setScale(ns)
    } else if (e.touches.length === 1 && dragging) {
      const dx = e.touches[0].clientX - lastPos.current.x
      const dy = e.touches[0].clientY - lastPos.current.y
      lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      setOffset(o => ({ x: o.x + dx, y: o.y + dy }))
    }
  }
  const onTouchEnd: React.TouchEventHandler<HTMLDivElement> = () => {
    setDragging(false)
    setTouchState(null)
  }

  // Fetch file size via HEAD
  React.useEffect(() => {
    let cancelled = false
    setFileSize(null)
    ;(async () => {
      try {
        const res = await fetch(src, { method: 'HEAD' })
        const len = res.headers.get('content-length')
        if (!cancelled && len) setFileSize(parseInt(len))
      } catch {}
    })()
    return () => { cancelled = true }
  }, [src])

  const formatBytes = (n?: number | null) => {
    if (!n || isNaN(n)) return '—'
    const units = ['B','KB','MB','GB','TB']
    let i = 0
    let v = n
    while (v >= 1024 && i < units.length-1) { v /= 1024; i++ }
    return `${v.toFixed(1)} ${units[i]}`
  }

  return (
    <div className="relative">
      <div className="mb-2 flex items-center justify-between text-xs">
        <div className="opacity-70 flex items-center gap-2">
          <span>{viewer.name} • {viewer.index + 1}/{total}</span>
          {natural.w > 0 && natural.h > 0 && (
            <span className="px-2 py-0.5 rounded bg-muted/60 border text-[10px]">{natural.w}×{natural.h}</span>
          )}
          {fileSize != null && (
            <span className="px-2 py-0.5 rounded bg-muted/60 border text-[10px]">{formatBytes(fileSize)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={zoomOut}>-</Button>
            <div className="min-w-[48px] text-center">{Math.round(scale * 100)}%</div>
            <Button size="sm" variant="outline" onClick={zoomIn}>+</Button>
            <Button size="sm" variant="outline" onClick={resetView}>Reset</Button>
            <Button size="sm" variant="outline" onClick={fit}>Fit</Button>
            <Button size="sm" variant="outline" onClick={fill}>Fill</Button>
          </div>
          <Button size="sm" variant="outline" onClick={download}><Download className="w-4 h-4 mr-1"/>Download</Button>
        </div>
      </div>
      <div
        className={`max-h-[80vh] overflow-hidden ${dragging ? 'cursor-grabbing' : (scale>1 ? 'cursor-grab' : 'cursor-auto')}`}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        onDoubleClick={toggleZoom}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        ref={wrapRef}
      >
        <img
          src={src}
          alt="preview"
          className="select-none"
          draggable={false}
          onLoad={(e) => {
            const el = e.currentTarget
            setNatural({ w: el.naturalWidth || 0, h: el.naturalHeight || 0 })
          }}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            transition: dragging ? 'none' : 'transform 120ms ease-out',
            width: '100%',
            height: 'auto',
            borderRadius: 6,
          }}
        />
      </div>
      {total > 1 && (
        <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between px-2 pointer-events-none">
          <button onClick={prev} className="pointer-events-auto p-2 rounded bg-black/40 hover:bg-black/60 text-white"><ChevronLeft /></button>
          <button onClick={next} className="pointer-events-auto p-2 rounded bg-black/40 hover:bg-black/60 text-white"><ChevronRight /></button>
        </div>
      )}
    </div>
  )
}
