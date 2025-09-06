
  import React from 'react'
  import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '../components/ui/card'
  import { Label } from '../components/ui/label'
  import { Input } from '../components/ui/input'
  import { Select } from '../components/ui/select'
  import { Textarea } from '../components/ui/textarea'
  import { Button } from '../components/ui/button'
  import { Dialog } from '../components/ui/dialog'
  import { Separator } from '../components/ui/separator'
  import { Play, FileText, FileJson, HelpCircle, Image, ChevronDown } from 'lucide-react'
  import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
  } from '../components/ui/tooltip'
  import { generateTrainingScript, generateDatasetToml } from '../utils/trainingConfig'
  import { useTraining } from '../contexts/TrainingContext'
  import { apiUrl } from '../config/api'
  import { useStore } from '../store/useStore'

  export function TrainingPage() {
    // Get values from context (set in Setup page)
    const { loraName, classTokens, datasetFolder } = useTraining()
    
    const [baseModel, setBaseModel] = React.useState('FLUX.1-dev')
    const [vram, setVram] = React.useState('20GB')
    const [lr, setLr] = React.useState('8e-4')
    const [dim, setDim] = React.useState(4)
    const [epochs, setEpochs] = React.useState(16)
    const [saveEvery, setSaveEvery] = React.useState(4)
    const [batch, setBatch] = React.useState(1)
    const [res, setRes] = React.useState('512')
    const [timestep, setTimestep] = React.useState('shift')
    const [guidance, setGuidance] = React.useState(1.0)
    const [samples, setSamples] = React.useState('')
    const [sampleEvery, setSampleEvery] = React.useState(0)
    const [numRepeats, setNumRepeats] = React.useState(10)
    const [seed, setSeed] = React.useState(42)
  const [workers, setWorkers] = React.useState(2)

    const [openScript, setOpenScript] = React.useState(false)
    const [openDataset, setOpenDataset] = React.useState(false)
    const [showModelPicker, setShowModelPicker] = React.useState(false)
    const [availableModels, setAvailableModels] = React.useState<any[]>([])
  const [selectedModelData, setSelectedModelData] = React.useState<any>(null)
  const { images, config } = useStore()

  // Sync local training params from global config (populated on Import Training)
  React.useEffect(() => {
    if (!config) return
    try {
      if (config.baseModel) setBaseModel(config.baseModel)
      if (config.vram) setVram(config.vram)
      if (config.learningRate) setLr(config.learningRate)
      if (config.networkDim != null) setDim(Number(config.networkDim))
      if (config.maxEpochs != null) setEpochs(Number(config.maxEpochs))
      if (config.saveEvery != null) setSaveEvery(Number(config.saveEvery))
      if (config.trainBatchSize != null) setBatch(Number(config.trainBatchSize))
      if (config.resolution != null) setRes(String(config.resolution))
      if (config.timestepSampling) setTimestep(config.timestepSampling)
      if (config.guidanceScale != null) setGuidance(Number(config.guidanceScale))
      if (config.samplePrompts != null) setSamples(String(config.samplePrompts))
      if (config.sampleEverySteps != null) setSampleEvery(Number(config.sampleEverySteps))
      if (config.numRepeats != null) setNumRepeats(Number(config.numRepeats))
      if (config.seed != null) setSeed(Number(config.seed))
      if (config.workers != null) setWorkers(Number(config.workers))
    } catch {}
  }, [config])

  // Computed training steps: epochs * ceil((images * repeats) / batch)
  const computedSteps = React.useMemo(() => {
    const imgCount = images.length || 0
    const repeats = Number(numRepeats) || 0
    const bs = Math.max(1, Number(batch) || 1)
    const ep = Number(epochs) || 0
    const stepsPerEpoch = Math.ceil((imgCount * repeats) / bs)
    return ep * stepsPerEpoch
  }, [images.length, numRepeats, batch, epochs])

    const estimatedCkpts = Math.floor(epochs / (saveEvery || 1)) || 0

    // Fetch available models on mount
    React.useEffect(() => {
      fetchAvailableModels()
    }, [])

    const fetchAvailableModels = async () => {
      try {
        // Use the same endpoint as the Models tab; lists installed files
        let response = await fetch(apiUrl('/models'))
        if (!response.ok) {
          // Fallback for older API shape
          response = await fetch(apiUrl('/models/available'))
        }
        if (response.ok) {
          const data = await response.json()
          const list = Array.isArray(data) ? data : (data.models || [])
          // Filter out system components, only show actual base models
          const filteredModels = list.filter((model: any) => {
            const filename = (model.filename || model.name || '').toLowerCase()
            return !filename.includes('t5xxl') && 
                   !filename.includes('clip_l') && 
                   !filename.includes('ae.sft') &&
                   filename.includes('flux')
          })
          setAvailableModels(filteredModels)
        } else {
          console.error('Failed to fetch models:', response.status, response.statusText)
        }
      } catch (error) {
        console.error('Error fetching models:', error)
      }
    }

    const selectModel = (model: any) => {
      const filename = (model.filename || model.name || '').toString()
      const modelName = model.metadata?.name || filename.replace('.safetensors', '')
      setBaseModel(modelName)
      setSelectedModelData(model)
      setShowModelPicker(false)
    }

    // Generate the actual training script
  const trainingConfig = {
      baseModel,
      loraName,
      resolution: parseInt(res),
      seed,
      workers,
      learningRate: lr,
      networkDim: dim,
      maxTrainEpochs: epochs,
      saveEveryNEpochs: saveEvery,
      timestepSampling: timestep,
      guidanceScale: guidance,
      vram,
      samplePrompts: samples,
      sampleEveryNSteps: sampleEvery,
      classTokens,
      numRepeats,
      trainBatchSize: batch,
      datasetFolder,
    }

    const script = generateTrainingScript(trainingConfig)
  const datasetToml = generateDatasetToml(trainingConfig)

  // Training run state and logs
  const [runId, setRunId] = React.useState<string | null>(null)
  const [isTraining, setIsTraining] = React.useState(false)
  const [termLogs, setTermLogs] = React.useState('')
  const logsTimer = React.useRef<number | null>(null)
  const [metrics, setMetrics] = React.useState<any>(null)
  const metricsTimer = React.useRef<number | null>(null)
  const [serverActiveRun, setServerActiveRun] = React.useState<{ run_id: string, status: string } | null>(null)

  const clearLogsTimer = () => {
    if (logsTimer.current) {
      window.clearInterval(logsTimer.current)
      logsTimer.current = null
    }
  }
  const clearMetricsTimer = () => {
    if (metricsTimer.current) {
      window.clearInterval(metricsTimer.current)
      metricsTimer.current = null
    }
  }

  const pollLogs = (rid: string) => {
    clearLogsTimer()
    logsTimer.current = window.setInterval(async () => {
      try {
        const res = await fetch(apiUrl(`/api/train/logs?run_id=${encodeURIComponent(rid)}`))
        if (res.ok) {
          const data = await res.json()
          setTermLogs(data.logs || '')
          if (data.status && (String(data.status).startsWith('error') || data.status === 'finished')) {
            setIsTraining(false)
            clearLogsTimer()
            clearMetricsTimer()
            try { localStorage.removeItem('active_run_id') } catch {}
          }
        }
      } catch {}
    }, 1000)
  }

  const pollMetrics = () => {
    clearMetricsTimer()
    metricsTimer.current = window.setInterval(async () => {
      try {
        const res = await fetch(apiUrl('/api/system/metrics'))
        if (res.ok) setMetrics(await res.json())
      } catch {}
    }, 1000)
  }

  const startTraining = async () => {
    try {
      setTermLogs('')
      setIsTraining(true)
      pollMetrics()
      // If we have images in store, upload them to backend dataset folder
      let prep: Response
      if (images.length > 0) {
        const fd = new FormData()
        fd.append('base_model', baseModel)
        fd.append('lora_name', loraName || 'MyLoRA')
        fd.append('resolution', String(parseInt(res)))
        fd.append('seed', String(seed))
        fd.append('workers', String(workers))
        fd.append('learning_rate', lr)
        fd.append('network_dim', String(dim))
        fd.append('max_train_epochs', String(epochs))
        fd.append('save_every_n_epochs', String(saveEvery))
        fd.append('timestep_sampling', String(timestep))
        fd.append('guidance_scale', String(guidance))
        fd.append('vram', String(vram))
        fd.append('sample_prompts', samples)
        fd.append('sample_every_n_steps', String(sampleEvery))
        fd.append('class_tokens', classTokens)
        fd.append('num_repeats', String(numRepeats))
        fd.append('train_batch_size', String(batch))
        fd.append('dataset_folder', datasetFolder || '')
        if (selectedModelData?.path) {
          fd.append('pretrained_path', selectedModelData.path)
        }
        const caps = images.map(img => img.caption || '')
        fd.append('captions', JSON.stringify(caps))
        images.forEach(img => fd.append('images', img.file, img.file.name))
        prep = await fetch(apiUrl('/api/train/prepare-upload'), { method: 'POST', body: fd })
      } else {
        const prepBody = {
          base_model: baseModel,
          pretrained_path: selectedModelData?.path,
          lora_name: loraName || 'MyLoRA',
          resolution: parseInt(res),
          seed,
          workers,
          learning_rate: lr,
          network_dim: dim,
          max_train_epochs: epochs,
          save_every_n_epochs: saveEvery,
          timestep_sampling: timestep,
          guidance_scale: guidance,
          vram,
          sample_prompts: samples,
          sample_every_n_steps: sampleEvery,
          class_tokens: classTokens,
          num_repeats: numRepeats,
          train_batch_size: batch,
          dataset_folder: datasetFolder || undefined,
          advanced_components: [],
        }
        prep = await fetch(apiUrl('/api/train/prepare'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(prepBody)
        })
      }
      if (!prep.ok) throw new Error('prepare failed')
      const prepData = await prep.json()
      const rid = prepData.run_id as string
      setRunId(rid)
      pollLogs(rid)

      // Start
      const startRes = await fetch(apiUrl('/api/train/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: rid })
      })
      if (!startRes.ok) throw new Error('start failed')
      try { localStorage.setItem('active_run_id', rid) } catch {}
    } catch (e) {
      setIsTraining(false)
      clearLogsTimer()
      clearMetricsTimer()
      alert('Failed to start training')
    }
  }

  const stopTraining = async () => {
    if (!runId) return
    try {
      await fetch(apiUrl('/api/train/stop'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: runId })
      })
    } catch {}
    setIsTraining(false)
    clearLogsTimer()
    clearMetricsTimer()
    try { localStorage.removeItem('active_run_id') } catch {}
  }

  React.useEffect(() => {
    const rid = (() => { try { return localStorage.getItem('active_run_id') } catch { return null } })()
    if (rid) {
      setRunId(rid)
      setIsTraining(true)
      pollLogs(rid)
      pollMetrics()
    }
    // Also check server for an active run to enable cross-browser resume
    ;(async () => {
      try {
        const res = await fetch(apiUrl('/api/train/active'))
        if (res.ok) {
          const data = await res.json()
          const runs = (data?.runs || []) as any[]
          if (!rid && runs.length > 0) {
            // Pick the first active run
            setServerActiveRun({ run_id: runs[0].run_id, status: runs[0].status })
          }
        }
      } catch {}
    })()
    return () => {
      clearLogsTimer()
      clearMetricsTimer()
    }
  }, [])

    // Export current training session as JSON (config + images + captions)
    const exportTraining = async () => {
      // Read images as data URLs
      const readAsDataURL = (file: File) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const imagePayload = await Promise.all(images.map(async (img) => ({
        name: img.file.name,
        type: img.file.type,
        size: img.file.size,
        caption: img.caption || '',
        dataUrl: await readAsDataURL(img.file),
      })))

      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        context: { loraName, classTokens, datasetFolder },
        params: {
          baseModel, vram, lr, dim, epochs, saveEvery, batch, res, timestep, guidance,
          samplePrompts: samples, sampleEvery, numRepeats, seed, workers,
        },
        images: imagePayload,
      }

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${loraName || 'training'}_export.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    }

  return (
    <TooltipProvider>
      {/* Live Training Terminal */}
      {showModelPicker === false && (
        <></>
      )}
        {/* Model Picker Modal */}
        <Dialog open={showModelPicker} onOpenChange={setShowModelPicker} title="Select Base Model">
          <div className="max-h-[60vh] overflow-y-auto">
            {availableModels.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Image className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No models found</p>
                <p className="text-sm mt-1">Download models from the Model tab first</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {/* Downloaded Models */}
                <p className="text-sm font-medium text-zinc-400 mb-2">Downloaded Models</p>
                {availableModels.map((model, index) => (
                  <Button
                    key={index}
                    variant="ghost"
                    onClick={() => selectModel(model)}
                    className="w-full justify-start p-3 h-auto border border-zinc-800 hover:border-zinc-600"
                  >
                    <div className="flex items-center gap-3">
                      {model.preview_image ? (
                        <img
                          src={apiUrl(`/static/${model.preview_image.split('/').pop()}`)}
                          alt={(model.metadata?.name || model.filename || model.name) as string}
                          className="w-12 h-12 object-cover rounded"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-zinc-800 rounded flex items-center justify-center">
                          <Image className="w-6 h-6 text-zinc-500" />
                        </div>
                      )}
                      <div className="text-left flex-1">
                        <p className="font-medium">
                          {model.metadata?.name || (model.filename ? model.filename.replace('.safetensors', '') : model.name)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {(model.size || '')} {(model.size ? '• ' : '')}{model.filename || model.name}
                        </p>
                        {model.metadata?.description && (
                          <p className="text-xs text-zinc-500 mt-1 line-clamp-2">
                            {model.metadata.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
            )}
          </div>
        </Dialog>
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Training Parameters
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>Configure the training hyperparameters for your LoRA. Higher learning rates train faster but may overfit. More epochs improve quality but take longer.</p>
                </TooltipContent>
              </Tooltip>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="flex items-center gap-2">
                  Base Model
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>FLUX.1-dev: Higher quality, slower generation. FLUX.1-schnell: Faster but lower quality. Use dev for best results.</p>
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <Button
                  variant="outline"
                  onClick={() => setShowModelPicker(true)}
                  className="w-full justify-between text-left"
                >
                  <div className="flex items-center gap-2">
                    {selectedModelData?.preview_image ? (
                      <img 
                        src={apiUrl(`/static/${selectedModelData.preview_image.split('/').pop()}`)}
                        alt={baseModel}
                        className="w-6 h-6 object-cover rounded"
                      />
                    ) : (
                      <Image className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span className="truncate">{baseModel}</span>
                  </div>
                  <ChevronDown className="w-4 h-4 opacity-50" />
                </Button>
              </div>
              <div>
                <Label className="flex items-center gap-2">
                  VRAM Configuration
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Select based on your GPU memory. 12GB minimum for basic training. 20GB+ recommended for stable training without crashes.</p>
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <Select value={vram} onChange={e=>setVram(e.target.value)} options={[
                  {value:'12GB', label:'12GB'},
                  {value:'16GB', label:'16GB'},
                  {value:'20GB', label:'20GB'},
                  {value:'24GB', label:'24GB+'},
                ]} />
              </div>
              <div>
                <Label className="flex items-center gap-2">
                  Learning Rate
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>How fast the model learns. Higher = faster but may overfit. Start with 2e-4 for balanced training. Use 8e-4 for quick tests.</p>
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <Select value={lr} onChange={e=>setLr(e.target.value)} options={[
                  {value:'8e-4', label:'8e-4 (Very High, short runs)'},
                  {value:'5e-4', label:'5e-4 (High)'},
                  {value:'2e-4', label:'2e-4 (Balanced)'},
                  {value:'1e-4', label:'1e-4 (Conservative)'},
                ]}/>
                <p className="text-xs text-gray-400 mt-1">Effective LR: {lr}</p>
              </div>
              <div>
                <Label className="flex items-center gap-2">
                  Network Dimension (Rank)
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Size of the LoRA. Higher = more detail but larger file. 4-8 for styles, 16-32 for characters/objects. Start with 16.</p>
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <Input type="number" value={dim} onChange={e=>setDim(Number(e.target.value))} />
              </div>
              <div>
                <Label className="flex items-center gap-2">
                  Max Epochs
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>How many times to train on your dataset. More epochs = better learning but risk overfitting. 10-20 is usually good.</p>
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <Input type="number" value={epochs} onChange={e=>setEpochs(Number(e.target.value))} />
              </div>
              <div>
                <Label className="flex items-center gap-2">
                  Save Every N Epochs
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Save checkpoints during training to test different stages. Saves every N epochs. Set to 4-5 to get 3-4 checkpoints.</p>
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <Input type="number" value={saveEvery} onChange={e=>setSaveEvery(Number(e.target.value))} />
                <p className="text-xs text-gray-400 mt-1">Estimated checkpoints: {estimatedCkpts}</p>
              </div>
              <div>
                <Label className="flex items-center gap-2">
                  Train Batch Size
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Images processed at once. 1 = stable but slow. Higher = faster but needs more VRAM. Keep at 1 unless you have 24GB+ VRAM.</p>
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <Input type="number" value={batch} onChange={e=>setBatch(Number(e.target.value))} />
              </div>
              <div>
                <Label className="flex items-center gap-2">
                  Resolution
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Training image size. Must match your dataset. 512x512 for faster training, 1024x1024 for higher quality. All images will be resized to this.</p>
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <Select value={res} onChange={e=>setRes(e.target.value)} options={[
                  {value:'512', label:'512 × 512'},
                  {value:'768', label:'768 × 768'},
                  {value:'1024', label:'1024 × 1024'}
                ]} />
              </div>
              <div>
                <Label className="flex items-center gap-2">
                  Number of Repeats
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>How many times to repeat each image in the dataset. Higher for small datasets (10-20), lower for large datasets (1-5).</p>
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <Input type="number" value={numRepeats} onChange={e=>setNumRepeats(Number(e.target.value))} />
              </div>
              <div>
                <Label className="flex items-center gap-2">
                  Timestep Sampling
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>How the AI learns different noise levels. Shift (recommended): Better for fine details. Uniform: Balanced learning. Sigmoid: Better edges.</p>
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <Select value={timestep} onChange={e=>setTimestep(e.target.value)} options={[
                  {value:'shift', label:'Shift – Detail-focused (default)'},
                  {value:'uniform', label:'Uniform – Even coverage'},
                  {value:'sigmoid', label:'Sigmoid – Edge/texture boost'}
                ]} />
              </div>
              <div>
                <Label className="flex items-center gap-2">
                  Guidance Scale
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Training guidance strength. 1.0 = standard training. Higher values make training follow your images more closely. Keep at 1.0 for most cases.</p>
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <Input type="number" step="0.1" value={guidance} onChange={e=>setGuidance(Number(e.target.value))} />
                <p className="text-xs text-gray-400 mt-1">Current: {guidance}</p>
              </div>
              <div>
                <Label className="flex items-center gap-2">
                  Seed
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Random seed for reproducible training. Use same seed to get similar results.</p>
                    </TooltipContent>
                  </Tooltip>
              </Label>
              <Input type="number" value={seed} onChange={e=>setSeed(Number(e.target.value))} />
            </div>
            <div>
              <Label className="flex items-center gap-2">
                Steps
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>Computed automatically as epochs × images × repeats ÷ batch size.</p>
                  </TooltipContent>
                </Tooltip>
              </Label>
              <Input type="text" value={computedSteps} readOnly className="bg-muted/50" />
              <p className="text-xs text-gray-400 mt-1">epochs × images × repeats ÷ batch size</p>
            </div>
              <div>
                <Label className="flex items-center gap-2">
                  Data Loader Workers
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Number of CPU workers for data loading. 2 is usually optimal.</p>
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <Input type="number" value={workers} onChange={e=>setWorkers(Number(e.target.value))} />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Sample Generation (Optional)
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>Generate sample images during training to monitor progress. Samples will be saved to track how well the model is learning your style.</p>
                  </TooltipContent>
                </Tooltip>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="prompts" className="flex items-center gap-2">
                  Sample Prompts (one per line)
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Test prompts to generate images during training. Use [trigger] as placeholder. Example: "[trigger] riding a bike". Helps monitor training progress.</p>
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <Textarea id="prompts" value={samples} onChange={e=>setSamples(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="flex items-center gap-2">
                    Generate Samples Every N Steps
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>How often to generate test images. 0 = disabled. 500-1000 = generate samples every 500-1000 training steps to see progress.</p>
                      </TooltipContent>
                    </Tooltip>
                  </Label>
                  <Input type="number" value={sampleEvery} onChange={e=>setSampleEvery(Number(e.target.value))} />
                  <p className="text-xs text-gray-400">{sampleEvery === 0 ? 'Disabled' : 'Enabled'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Configuration Summary
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>Review your training configuration before starting. You can export the script and dataset configuration for manual execution or modification.</p>
                  </TooltipContent>
                </Tooltip>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-4">
              {/* Show inherited values from Setup page */}
              {(loraName || classTokens || datasetFolder) && (
                <>
                  <div className="p-3 rounded-md bg-muted/50 space-y-1">
                    <p className="text-xs uppercase tracking-wider opacity-50 mb-2">From Setup</p>
                    {loraName && <p><span className="opacity-60">LoRA Name:</span> {loraName}</p>}
                    {classTokens && <p><span className="opacity-60">Trigger:</span> {classTokens}</p>}
                    {datasetFolder && <p className="text-xs"><span className="opacity-60">Dataset:</span> {datasetFolder}</p>}
                  </div>
                  <Separator className="my-3" />
                </>
              )}
              
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <p><span className="opacity-60">Base Model:</span> {baseModel}</p>
                <p><span className="opacity-60">VRAM:</span> {vram}</p>
                <p><span className="opacity-60">Learning Rate:</span> {lr}</p>
                <p><span className="opacity-60">Network Dim:</span> {dim}</p>
                <p><span className="opacity-60">Epochs:</span> {epochs}</p>
                <p><span className="opacity-60">Batch Size:</span> {batch}</p>
                <p><span className="opacity-60">Resolution:</span> {res}×{res}</p>
                <p><span className="opacity-60">Repeats:</span> {numRepeats}</p>
                <p><span className="opacity-60">Timestep:</span> {timestep}</p>
                <p><span className="opacity-60">Guidance:</span> {guidance}</p>
                <p><span className="opacity-60">Estimated ckpts:</span> {Math.floor(epochs/(saveEvery||1))}</p>
                <p><span className="opacity-60">Sample Every:</span> {sampleEvery === 0 ? 'Disabled' : `${sampleEvery} steps`}</p>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              <Button className="w-full" onClick={() => setOpenScript(true)}><FileText className="mr-2" size={16}/>View Training Script</Button>
              <Button className="w-full" variant="outline" onClick={() => setOpenDataset(true)}><FileJson className="mr-2" size={16}/>View Dataset Config</Button>
              <Button className="w-full" variant="destructive" disabled={isTraining} onClick={startTraining}>
                <Play className="mr-2" size={16}/>{isTraining ? 'Training…' : 'Start Training'}
              </Button>
              <Button className="w-full" variant="outline" onClick={exportTraining}><FileJson className="mr-2" size={16}/>Export Training (JSON)</Button>
            </CardFooter>
          </Card>
        </div>

        {/* Terminal-like logs viewer */}
        {(isTraining || termLogs) && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Training Output{runId ? ` — ${runId}` : ''}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={()=>setTermLogs('')}>Clear</Button>
                  <Button size="sm" variant="outline" onClick={stopTraining} disabled={!isTraining}>Stop</Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Resume hint if a server run is active but not attached */}
              {!isTraining && !runId && serverActiveRun && (
                <div className="mb-3 p-2 rounded border bg-amber-900/20 text-xs flex items-center justify-between">
                  <div>
                    Active training session detected on server.
                    <span className="opacity-70"> ID:</span> <span className="font-mono">{serverActiveRun.run_id}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => {
                      const rid = serverActiveRun.run_id
                      setRunId(rid)
                      setIsTraining(true)
                      pollLogs(rid)
                      pollMetrics()
                      try { localStorage.setItem('active_run_id', rid) } catch {}
                      setServerActiveRun(null)
                    }}>Resume</Button>
                  </div>
                </div>
              )}
              {metrics && (
                <div className="mb-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div className="p-2 rounded border bg-muted/40">
                    <div className="opacity-60">CPU</div>
                    <div>{metrics.cpu?.percent != null ? `${metrics.cpu.percent.toFixed(0)}%` : 'n/a'}</div>
                  </div>
                  <div className="p-2 rounded border bg-muted/40">
                    <div className="opacity-60">Memory</div>
                    <div>
                      {metrics.memory ? `${(metrics.memory.used/ (1024**3)).toFixed(1)} / ${(metrics.memory.total/ (1024**3)).toFixed(1)} GB (${metrics.memory.percent?.toFixed?.(0) || 'n/a'}%)` : 'n/a'}
                    </div>
                  </div>
                  {(metrics.gpus || []).map((g: any) => (
                    <div key={g.index} className="p-2 rounded border bg-muted/40">
                      <div className="opacity-60">GPU{g.index} {g.name}</div>
                      <div className="flex justify-between">
                        <span>{g.util?.toFixed?.(0) || 0}%</span>
                        <span>{(g.mem_used/1024).toFixed(1)} / {(g.mem_total/1024).toFixed(1)} GB</span>
                        <span>{g.temp?.toFixed?.(0) || 0}°C</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <pre className="w-full text-xs bg-black/60 text-green-200 p-3 rounded-md border max-h-[50vh] overflow-auto whitespace-pre-wrap">
{termLogs}
              </pre>
            </CardContent>
          </Card>
        )}

        <Dialog open={openScript} onOpenChange={setOpenScript} title="Training Script (run.sh)">
          <pre className="text-xs overflow-auto p-4 bg-black/40 rounded-lg border whitespace-pre font-mono">
{script}
          </pre>
        </Dialog>

        <Dialog open={openDataset} onOpenChange={setOpenDataset} title="Dataset Config (dataset.toml)">
          <pre className="text-xs overflow-auto p-4 bg-black/40 rounded-lg border whitespace-pre font-mono">
{datasetToml}
          </pre>
        </Dialog>
      </div>
      </TooltipProvider>
    )
  }
