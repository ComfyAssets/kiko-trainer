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
import { TrainingProvider } from './contexts/TrainingContext'
import { Toaster } from 'react-hot-toast'

export default function App() {
  const [tab, setTab] = useState('models')

  return (
    <TrainingProvider>
    <div className="min-h-screen">
      <Toaster position="top-right" />
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Icon path={mdiBeaker} size={1.2} className="text-purple-400" />
            <h1 className="text-xl font-semibold tracking-wide">Kiko Trainer - FLUX LoRA</h1>
          </div>
          <Tabs
            tabs={[
              { value: 'models', label: 'Models' },
              { value: 'setup', label: 'Setup' },
              { value: 'training', label: 'Training' },
              { value: 'publish', label: 'Publish' },
              { value: 'outputs', label: 'Outputs' },
            ]}
            value={tab}
            onValueChange={setTab}
          />
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
