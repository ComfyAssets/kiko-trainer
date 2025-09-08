import React, { useEffect, useMemo, useRef, useState } from 'react'
import { API_CONFIG, apiUrl } from '../config/api'

type Point = {
  ts?: number
  step?: number
  epoch?: number
  loss?: number
  avr_loss?: number
  lr?: number
  grad_norm?: number | null
}

type Props = { outputName: string }

export default function MetricsChart({ outputName }: Props) {
  const [data, setData] = useState<Point[]>([])
  const esRef = useRef<EventSource | null>(null)
  const [smooth, setSmooth] = useState<number>(50) // moving average window (steps)
  const [windowSize, setWindowSize] = useState<number>(512) // last N points
  const [useZoom, setUseZoom] = useState<boolean>(false)
  const [zoomSpanPct, setZoomSpanPct] = useState<number>(100) // percent of total history
  const [zoomStartPct, setZoomStartPct] = useState<number>(0) // start offset percent

  const recentUrl = apiUrl(`/api/metrics/recent?name=${encodeURIComponent(outputName)}&limit=512`)
  const sseUrl = apiUrl(`/api/metrics/stream?name=${encodeURIComponent(outputName)}`)

  useEffect(() => {
    let cancelled = false
    fetch(recentUrl)
      .then(r => r.json())
      .then(j => { if (!cancelled && j?.items) setData(j.items) })
      .catch(()=>{})
    return () => { cancelled = true }
  }, [recentUrl])

  useEffect(() => {
    const es = new EventSource(sseUrl)
    esRef.current = es
    es.onmessage = (ev) => {
      try {
        const obj = JSON.parse(ev.data)
        setData(prev => {
          const next = [...prev, obj]
          return next.slice(Math.max(0, next.length - 1024))
        })
      } catch {}
    }
    return () => { es.close() }
  }, [sseUrl])

  const xKey = useMemo(() => {
    const last = data[data.length - 1] || {}
    if ('step' in (last as any)) return 'step'
    if ('epoch' in (last as any)) return 'epoch'
    return 'ts'
  }, [data])

  // Lightweight SVG line chart to avoid extra deps
  const width = 800
  const height = 200
  const padding = 32

  // Visible slice: either a moving window or a zoomed slice over full history
  const displayed = (() => {
    if (useZoom && data.length > 0) {
      const n = data.length
      const span = Math.max(5, Math.min(100, zoomSpanPct))
      const start = Math.max(0, Math.min(100 - span, zoomStartPct))
      const i0 = Math.floor((start / 100) * n)
      const i1 = Math.min(n, i0 + Math.max(10, Math.floor((span / 100) * n)))
      return data.slice(i0, i1)
    }
    return windowSize > 0 ? data.slice(-windowSize) : data
  })()
  const pointsLoss = displayed.map(d => ({ x: (d as any)[xKey] ?? 0, y: d.loss ?? d.avr_loss ?? 0 }))
  const pointsLr = displayed.map(d => ({ x: (d as any)[xKey] ?? 0, y: d.lr ?? 0 }))

  // Moving average smoothing for loss
  const pointsLossSmoothed = (() => {
    if (!smooth || smooth <= 1) return pointsLoss
    const out: {x:number;y:number}[] = []
    let acc = 0
    const q: number[] = []
    for (let i=0;i<pointsLoss.length;i++) {
      const v = Number(pointsLoss[i].y) || 0
      q.push(v)
      acc += v
      if (q.length > smooth) acc -= q.shift() as number
      const avg = acc / q.length
      out.push({ x: pointsLoss[i].x, y: avg })
    }
    return out
  })()

  const [minX, maxX] = pointsLoss.length ? [pointsLoss[0].x, pointsLoss[pointsLoss.length - 1].x] : [0, 1]
  const lossBasis = (smooth && smooth > 1) ? pointsLossSmoothed : pointsLoss
  const minYL = Math.min(...lossBasis.map(p => p.y).concat([0]))
  const maxYL = Math.max(...lossBasis.map(p => p.y).concat([1]))
  const minYR = Math.min(...pointsLr.map(p => p.y).concat([0]))
  const maxYR = Math.max(...pointsLr.map(p => p.y).concat([1]))

  const sx = (x: number) => padding + (maxX === minX ? 0 : ((x - minX) / (maxX - minX)) * (width - padding * 2))
  const syL = (y: number) => height - padding - ((y - minYL) / (maxYL - minYL || 1)) * (height - padding * 2)
  const syR = (y: number) => height - padding - ((y - minYR) / (maxYR - minYR || 1)) * (height - padding * 2)

  const pathFrom = (pts: {x:number;y:number}[], sy:(y:number)=>number) => {
    if (pts.length === 0) return ''
    return pts.map((p,i)=> `${i===0?'M':'L'} ${sx(p.x)} ${sy(p.y)}`).join(' ')
  }

  return (
    <div className="w-full overflow-auto">
      {displayed.length === 0 && (
        <div className="w-full h-32 flex items-center justify-center text-xs text-zinc-400 border border-zinc-800 rounded bg-black/40 mb-2">
          Waiting for metrics…
        </div>
      )}
      <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
        <div className="flex items-center gap-3">
          <span><span className="inline-block w-3 h-1.5 align-middle mr-1" style={{background:'#22c55e'}}></span>Loss</span>
          <span><span className="inline-block w-3 h-1.5 align-middle mr-1" style={{background:'#16a34a'}}></span>Loss (smoothed)</span>
          <span><span className="inline-block w-3 h-1.5 align-middle mr-1" style={{background:'#a855f7'}}></span>LR</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label title="Moving average window (steps). 0 = off">Smooth</label>
            <input
              type="number"
              value={smooth}
              onChange={e=>setSmooth(Math.max(0, Number(e.target.value)||0))}
              min={0}
              step={10}
              className="w-16 bg-black/40 border border-zinc-800 rounded px-2 py-0.5 text-zinc-200"
            />
          </div>
          <div className="flex items-center gap-2">
            <label title="How many most recent points to show">Window</label>
            <input
              type="number"
              value={windowSize}
              onChange={e=>setWindowSize(Math.max(0, Number(e.target.value)||0))}
              min={0}
              step={64}
              className="w-20 bg-black/40 border border-zinc-800 rounded px-2 py-0.5 text-zinc-200"
            />
          </div>
          <div className="flex items-center gap-2">
            <label title="Enable zoom/brush over full history">Zoom</label>
            <input type="checkbox" checked={useZoom} onChange={e=>setUseZoom(e.target.checked)} />
            {useZoom && (
              <>
                <label title="Visible span (% of full history)">Span</label>
                <input
                  type="range"
                  min={5}
                  max={100}
                  step={1}
                  value={zoomSpanPct}
                  onChange={e=>setZoomSpanPct(Number(e.target.value))}
                />
                <span className="w-10 inline-block text-right">{zoomSpanPct}%</span>
                <label title="Pan start (% from beginning)">Pan</label>
                <input
                  type="range"
                  min={0}
                  max={100 - Math.min(100, Math.max(5, zoomSpanPct))}
                  step={1}
                  value={zoomStartPct}
                  onChange={e=>setZoomStartPct(Number(e.target.value))}
                />
                <span className="w-10 inline-block text-right">{zoomStartPct}%</span>
              </>
            )}
          </div>
        </div>
      </div>
      <svg width={width} height={height} className="block">
        <rect x={0} y={0} width={width} height={height} fill="#0a0a0a" />
        {/* Grid lines */}
        {Array.from({length:5}).map((_,i)=>{
          const y = padding + (i*(height - padding*2))/4
          return <line key={`h${i}`} x1={padding} y1={y} x2={width - padding} y2={y} stroke="#2a2a2a" strokeDasharray="2 4" />
        })}
        {Array.from({length:6}).map((_,i)=>{
          const x = padding + (i*(width - padding*2))/5
          return <line key={`v${i}`} x1={x} y1={padding} x2={x} y2={height - padding} stroke="#2a2a2a" strokeDasharray="2 4" />
        })}
        {/* Axes */}
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#3a3a3a" />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#3a3a3a" />
        {/* Loss (left, green) */}
        <path d={pathFrom(pointsLoss, syL)} stroke="#22c55e" fill="none" strokeWidth={1} opacity={0.5} />
        {/* Smoothed loss (darker green) */}
        <path d={pathFrom(pointsLossSmoothed, syL)} stroke="#16a34a" fill="none" strokeWidth={1.8} />
        {/* LR (right, purple) */}
        <path d={pathFrom(pointsLr, syR)} stroke="#a855f7" fill="none" strokeWidth={1.2} opacity={0.9} />
        {/* Labels */}
        <text x={width/2} y={height - 8} fill="#999" fontSize={11} textAnchor="middle">{xKey.toUpperCase()}</text>
        <text x={padding} y={12} fill="#999" fontSize={11}>Loss</text>
        <text x={width - padding} y={12} fill="#999" fontSize={11} textAnchor="end">LR</text>
      </svg>
    </div>
  )
}
