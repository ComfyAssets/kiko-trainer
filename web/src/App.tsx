import { Tabs } from './components/ui/tabs'
import { SetupPageEnhanced as SetupPage } from './pages/SetupPageEnhanced'
import { TrainingPage } from './pages/TrainingPage'
import { PublishPage } from './pages/PublishPage'
import { OutputsPage } from './pages/OutputsPage'
import { ModelPage } from './pages/ModelPage'
import { Cpu, Settings } from 'lucide-react'
import Icon from '@mdi/react'
import { mdiBeaker } from '@mdi/js'
import { useState } from 'react'
import { useStore } from './store/useStore'
import { Button } from './components/ui/button'
import { toast } from 'react-hot-toast'
import { apiUrl } from './config/api'
import { TrainingProvider } from './contexts/TrainingContext'
import { Toaster } from 'react-hot-toast'

export default function App() {
  const [tab, setTab] = useState('models')
  const { captionJob, cancelCaptionJob } = useStore()

  return (
    <TrainingProvider>
    <div className="min-h-screen">
      <Toaster position="top-right" />
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Icon path={mdiBeaker} size={1.2} className="text-purple-400" />
            <h1 className="text-xl font-semibold tracking-wide">Kiko Trainer - FLUX LoRA</h1>
          </div>
          <div className="flex items-center gap-4 min-w-0">
            <Tabs
              tabs={[
                { value: 'models', label: 'Models' },
                { value: 'setup', label: 'Setup' },
                { value: 'training', label: 'Training' },
                { value: 'outputs', label: 'Outputs' },
                { value: 'publish', label: 'Publish' },
              ]}
              value={tab}
              onValueChange={setTab}
            />
            {captionJob?.total > 0 && (
              <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full border bg-background/60">
                <span className="text-xs">Captioning {captionJob.current}/{captionJob.total}</span>
                <div className="w-24 h-1.5 bg-zinc-800 rounded overflow-hidden">
                  <div className="h-1.5 bg-emerald-500" style={{ width: `${(captionJob.current/Math.max(1, captionJob.total))*100}%` }} />
                </div>
                <Button size="sm" variant="outline" onClick={cancelCaptionJob}>{captionJob.isRunning ? 'Cancel' : 'Clear'}</Button>
              </div>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={async ()=>{
                try {
                  const res = await fetch(apiUrl('/api/system/purge-vram'), { method: 'POST' })
                  const data = await res.json().catch(()=>({}))
                  if (res.ok) {
                    const bA = data?.before?.allocated_gb
                    const bR = data?.before?.reserved_gb
                    const aA = data?.after?.allocated_gb
                    const aR = data?.after?.reserved_gb
                    const freedAlloc = (typeof bA === 'number' && typeof aA === 'number') ? Math.max(0, bA - aA) : null
                    const freedRes = (typeof bR === 'number' && typeof aR === 'number') ? Math.max(0, bR - aR) : null
                    const fmt = (n: number) => `${n.toFixed(3)} GB`
                    // Prefer device-level delta if available
                    const gpuFreed = (() => {
                      try {
                        const arr = data?.gpu?.freed as any[]
                        if (Array.isArray(arr) && arr.length > 0) {
                          const f0 = arr[0]?.freed_gb
                          if (typeof f0 === 'number') return f0
                        }
                      } catch {}
                      return null
                    })()
                    let msg = 'VRAM purged'
                    const parts: string[] = []
                    if (gpuFreed !== null) parts.push(`global freed ${fmt(gpuFreed)}`)
                    if (freedAlloc !== null) parts.push(`freed ${fmt(freedAlloc)} allocated`)
                    if (freedRes !== null) parts.push(`freed ${fmt(freedRes)} reserved`)
                    if (parts.length > 0) msg = `VRAM purged: ${parts.join(', ')}`
                    // If nothing changed, hint why
                    if (parts.length === 0 || (/0\.000/.test(msg))) {
                      msg = 'VRAM purge: no cached memory to free (active training processes hold allocations)'
                    }
                    toast.success(msg)
                  } else {
                    toast.error('Purge failed')
                  }
                } catch {
                  toast.error('Purge failed')
                }
              }}
            >Purge VRAM</Button>
            <Button
              size="sm"
              variant="outline"
              onClick={async ()=>{
                try {
                  const res = await fetch(apiUrl('/api/train/clean-orphans'), { method: 'POST' })
                  const data = await res.json().catch(()=>({}))
                  if (res.ok && data?.ok) {
                    const found = data?.found ?? 0
                    const groups = data?.killed_groups ?? 0
                    const errs = Array.isArray(data?.errors) ? data.errors.length : 0
                    if (found === 0) {
                      toast.success('No orphan trainers found')
                    } else {
                      const parts: string[] = []
                      parts.push(`${found} orphan${found!==1?'s':''}`)
                      parts.push(`${groups} group${groups!==1?'s':''} cleaned`)
                      if (errs) parts.push(`${errs} error${errs!==1?'s':''}`)
                      toast.success(`Cleaned: ${parts.join(', ')}`)
                    }
                  } else {
                    toast.error('Clean orphans failed')
                  }
                } catch {
                  toast.error('Clean orphans failed')
                }
              }}
            >Clean Orphans</Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {tab === 'models' && <ModelPage />}
        {tab === 'setup' && <SetupPage />}
        {tab === 'training' && <TrainingPage />}
        {tab === 'publish' && <PublishPage />}
        {tab === 'outputs' && <OutputsPage />}
      </main>

      <footer className="border-t py-8 text-center text-sm text-gray-400">
        <div className="max-w-6xl mx-auto px-4 flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <Cpu size={16} /> FLUX / Kohya • Dark UI
          </div>
          <div className="flex items-center gap-1 opacity-70">
            <Settings size={14}/> Powered by sd-scripts
          </div>
        </div>
      </footer>
    </div>
    </TrainingProvider>
  )
}
