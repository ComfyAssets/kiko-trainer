
import React from 'react'
import { Tabs } from '../components/ui/tabs'
import { SetupPage } from './SetupPage'
import { TrainingPage } from './TrainingPage'
import { PublishPage } from './PublishPage'
import { Cpu, Settings } from 'lucide-react'
import Icon from '@mdi/react'
import { mdiBeaker } from '@mdi/js'

export function App() {
  const [tab, setTab] = React.useState('setup')

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Icon path={mdiBeaker} size={1.2} className="text-purple-400" />
            <h1 className="text-xl font-semibold tracking-wide">Kiko Trainer - FLUX LoRA</h1>
          </div>
          <Tabs
            tabs={[
              { value: 'setup', label: 'Setup' },
              { value: 'training', label: 'Training' },
              { value: 'publish', label: 'Publish' },
            ]}
            value={tab}
            onValueChange={setTab}
          />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {tab === 'setup' && <SetupPage />}
        {tab === 'training' && <TrainingPage />}
        {tab === 'publish' && <PublishPage />}
      </main>

      <footer className="border-t py-8 text-center text-sm text-gray-400">
        <div className="max-w-6xl mx-auto px-4 flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <Cpu size={16} /> FLUX / Kohya • Dark-only UI
          </div>
          <div className="flex items-center gap-1 opacity-70">
            <Settings size={14}/> Inspired by your wireframe
          </div>
        </div>
      </footer>
    </div>
  )
}
