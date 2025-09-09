
  import React from 'react'
  import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '../components/ui/card'
  import { Label } from '../components/ui/label'
  import { Input } from '../components/ui/input'
  import { Select } from '../components/ui/select'
  import { Textarea } from '../components/ui/textarea'
  import { Button } from '../components/ui/button'
  import { Dialog } from '../components/ui/dialog'
  // import { Separator } from '../components/ui/separator' // unused
  import { Switch } from '../components/ui/switch'
  import { CollapsibleSection } from '../components/CollapsibleSection'
  import { Play, FileText, FileJson, HelpCircle, Image, ChevronDown } from 'lucide-react'
  import MetricsChart from '../components/MetricsChart'
  import { ImageViewer } from '../components/ImageViewer'
  import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
  } from '../components/ui/tooltip'
  import { generateTrainingScript, generateDatasetToml } from '../utils/trainingConfig'
  import { useTraining } from '../contexts/TrainingContext'
  import { apiUrl } from '../config/api'
  import { PATHS_CONFIG } from '../config/paths'
  import { useStore } from '../store/useStore'
  import SampleGallery from '../components/SampleGallery'

  export function TrainingPage() {
    // Get values from context (set in Setup page)
    const { loraName, classTokens, datasetFolder } = useTraining()
    
    const [baseModel, setBaseModel] = React.useState('FLUX.1-dev')
  const [vram, setVram] = React.useState('24GB')
  const [blocksToSwap, setBlocksToSwap] = React.useState<string>('auto') // 'auto' | 'off' | number string
  const [highVram, setHighVram] = React.useState<boolean>(false)
  const [enableTB, setEnableTB] = React.useState<boolean>(false)
    const [lr, setLr] = React.useState('8e-4')
    const [lrPreset, setLrPreset] = React.useState<string>(() => {
      const presets = new Set(['8e-4','5e-4','2e-4','1e-4'])
      return presets.has('8e-4') ? '8e-4' : 'custom'
    })
    const [dim, setDim] = React.useState(4)
    const [epochs, setEpochs] = React.useState(16)
    const [saveEvery, setSaveEvery] = React.useState(4)
    const [batch, setBatch] = React.useState(1)
    const [res, setRes] = React.useState('512')
    const [timestep, setTimestep] = React.useState('shift')
    const [guidance, setGuidance] = React.useState(1.0)
  const [samples, setSamples] = React.useState('')
  const [sampleEvery, setSampleEvery] = React.useState(0)
  // Sampling controls
  const [sampleRes, setSampleRes] = React.useState<'512'|'768'|'1024'>('512')
  const [sampleSteps, setSampleSteps] = React.useState<number>(20)
  const [sampleSampler, setSampleSampler] = React.useState<string>('ddim')
  const [openPrompts, setOpenPrompts] = React.useState(false)
  const [showLossChart, setShowLossChart] = React.useState(false)
  const [activeOutputName, setActiveOutputName] = React.useState<string>('')
  const [viewer, setViewer] = React.useState<{ images: string[], index: number } | null>(null)
  const [showSamples, setShowSamples] = React.useState<boolean>(true)
  const [metricsSource, setMetricsSource] = React.useState<'tensorboard'|'csv'|'none'>('none')

  const buildPromptsToml = React.useCallback(() => {
    const promptLines = (samples || '').split('\n').map(l=>l.trim()).filter(Boolean)
    if (promptLines.length === 0) return ''
    const size = parseInt(sampleRes)
    const blocks = promptLines.map(text => (
      `[[prompt]]\ntext = ${JSON.stringify(text)}\nwidth = ${size}\nheight = ${size}\nsample_steps = ${sampleSteps}\n`
    ))
    return blocks.join('\n')
  }, [samples, sampleRes, sampleSteps])
  const [numRepeats, setNumRepeats] = React.useState(10)
  const [seed, setSeed] = React.useState(42)
  const [workers, setWorkers] = React.useState(2)
  // Advanced options
  const [lrScheduler, setLrScheduler] = React.useState('cosine')
  const [lrWarmup, setLrWarmup] = React.useState<number>(0.05)
  const [noiseOffset, setNoiseOffset] = React.useState<number>(0)
  const [flipSymmetry, setFlipSymmetry] = React.useState<boolean>(false)
  const [loraDropout, setLoraDropout] = React.useState<number | undefined>(undefined)
  const [networkAlpha, setNetworkAlpha] = React.useState<number | undefined>(undefined)
  const [rankDropout, setRankDropout] = React.useState<number | undefined>(undefined)
  const [moduleDropout, setModuleDropout] = React.useState<number | undefined>(undefined)
  // Text Encoder training controls
  const [trainClipL, setTrainClipL] = React.useState<boolean>(false)
  const [trainT5, setTrainT5] = React.useState<boolean>(false)
  const [teLr, setTeLr] = React.useState<string>('')
  const [teWarmupSteps, setTeWarmupSteps] = React.useState<number>(0)
  // Bucketing (advanced)
  const [enableBucket, setEnableBucket] = React.useState<boolean>(true)
  const [bucketResoSteps, setBucketResoSteps] = React.useState<number>(64)
  const [minBucketReso, setMinBucketReso] = React.useState<number>(256)
  const [maxBucketReso, setMaxBucketReso] = React.useState<number>(1024)
  const [bucketNoUpscale, setBucketNoUpscale] = React.useState<boolean>(true)
  const [resizeInterpolation, setResizeInterpolation] = React.useState<string | undefined>(undefined)

  const sanitizeBucketStep = (v: number) => Math.max(64, Math.round((Number(v) || 64)/64)*64)

    const [openScript, setOpenScript] = React.useState(false)
    // UI mode: basic vs advanced
    const [uiMode, setUiMode] = React.useState<string>(() => {
      try { return localStorage.getItem('kiko.trainingMode') || 'advanced' } catch { return 'advanced' }
    })
    const isAdvanced = uiMode === 'advanced'
    const [openDataset, setOpenDataset] = React.useState(false)
    const [showModelPicker, setShowModelPicker] = React.useState(false)
    const [availableModels, setAvailableModels] = React.useState<any[]>([])
  const [selectedModelData, setSelectedModelData] = React.useState<any>(null)
  // Optional path overrides (advanced)
  const [overrideUnet, setOverrideUnet] = React.useState<string>('')
  const [overrideClip, setOverrideClip] = React.useState<string>('')
  const [overrideT5, setOverrideT5] = React.useState<string>('')
  const [overrideAe, setOverrideAe] = React.useState<string>('')
  const { images, config, updateConfig } = useStore()

  // Sync local training params from global config (populated on Import Training)
  React.useEffect(() => {
    if (!config) return
    try {
      if (config.baseModel) setBaseModel(config.baseModel)
      else {
        const bm = (()=>{ try { return localStorage.getItem('kiko.baseModel') } catch { return null } })()
        if (bm) setBaseModel(bm)
      }
      if ((config as any).pretrainedPath) {
        const p = String((config as any).pretrainedPath)
        setSelectedModelData({ path: p, filename: p.split('/').pop(), name: p.split('/').pop(), metadata: {} } as any)
      }
      if (config.vram) setVram(config.vram)
      if (config.learningRate) {
        setLr(config.learningRate)
        // Update preset dropdown to match the global config learning rate
        const presets = new Set(['8e-4','5e-4','2e-4','1e-4'])
        setLrPreset(presets.has(config.learningRate) ? config.learningRate : 'custom')
      }
      if (config.networkDim != null) setDim(Number(config.networkDim))
      if (config.maxEpochs != null) setEpochs(Number(config.maxEpochs))
      if (config.saveEvery != null) setSaveEvery(Number(config.saveEvery))
      if (config.trainBatchSize != null) setBatch(Number(config.trainBatchSize))
      if (config.resolution != null) setRes(String(config.resolution))
      if (config.timestepSampling) setTimestep(config.timestepSampling)
      if (config.guidanceScale != null) setGuidance(Number(config.guidanceScale))
      if (config.samplePrompts != null) setSamples(String(config.samplePrompts))
      if (config.sampleEverySteps != null) setSampleEvery(Number(config.sampleEverySteps))
      if ((config as any).sampleRes) setSampleRes(String((config as any).sampleRes) as any)
      if ((config as any).sampleSteps != null) setSampleSteps(Number((config as any).sampleSteps))
      if ((config as any).sampleSampler) setSampleSampler(String((config as any).sampleSampler))
      if (config.numRepeats != null) setNumRepeats(Number(config.numRepeats))
      if (config.seed != null) setSeed(Number(config.seed))
      if (config.workers != null) setWorkers(Number(config.workers))
      if ((config as any).lrScheduler) setLrScheduler(String((config as any).lrScheduler))
      if ((config as any).lrWarmupSteps != null) setLrWarmup(Number((config as any).lrWarmupSteps))
      if ((config as any).noiseOffset != null) setNoiseOffset(Number((config as any).noiseOffset))
      if ((config as any).flipSymmetry != null) setFlipSymmetry(Boolean((config as any).flipSymmetry))
      if ((config as any).loraDropout != null) setLoraDropout(Number((config as any).loraDropout))
      if ((config as any).networkAlpha != null) setNetworkAlpha(Number((config as any).networkAlpha))
      if ((config as any).rankDropout != null) setRankDropout(Number((config as any).rankDropout))
      if ((config as any).moduleDropout != null) setModuleDropout(Number((config as any).moduleDropout))
      // bucketing
      if ((config as any).enableBucket != null) setEnableBucket(Boolean((config as any).enableBucket))
      if ((config as any).bucketResoSteps != null) setBucketResoSteps(Number((config as any).bucketResoSteps))
      if ((config as any).minBucketReso != null) setMinBucketReso(Number((config as any).minBucketReso))
      if ((config as any).maxBucketReso != null) setMaxBucketReso(Number((config as any).maxBucketReso))
      if ((config as any).bucketNoUpscale != null) setBucketNoUpscale(Boolean((config as any).bucketNoUpscale))
      if ((config as any).resizeInterpolation != null) setResizeInterpolation(String((config as any).resizeInterpolation))
      // VRAM settings
      if ((config as any).blocksToSwap != null) setBlocksToSwap(String((config as any).blocksToSwap))
      if ((config as any).highVram != null) setHighVram(Boolean((config as any).highVram))
      if ((config as any).enableTB != null) setEnableTB(Boolean((config as any).enableTB))
      // Text encoder training
      if ((config as any).trainClipL != null) setTrainClipL(Boolean((config as any).trainClipL))
      if ((config as any).trainT5 != null) setTrainT5(Boolean((config as any).trainT5))
      if ((config as any).teLr != null) setTeLr(String((config as any).teLr))
      if ((config as any).teWarmupSteps != null) setTeWarmupSteps(Number((config as any).teWarmupSteps))
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
      try { updateConfig('baseModel', modelName as any) } catch {}
      try { localStorage.setItem('kiko.baseModel', modelName) } catch {}
      setSelectedModelData(model)
      setShowModelPicker(false)
    }

    // Generate the actual training script
    const bucketStep = sanitizeBucketStep(bucketResoSteps)
    const augSummary = `${flipSymmetry ? 'flip on' : 'flip off'}, step ${bucketStep}, ${minBucketReso}–${maxBucketReso}, ${bucketNoUpscale ? 'no upscale' : 'upscale'}`

    // const sampleCount = (samples || '').split('\n').filter(l => l.trim()).length // unused
    // const sampleSummary = sampleEvery === 0 ? 'disabled' : `every ${sampleEvery} steps, ${sampleCount} prompt${sampleCount===1?'':'s'}` // unused
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
      // bucketing
      enableBucket,
      bucketResoSteps: bucketStep,
      minBucketReso,
      maxBucketReso,
      bucketNoUpscale,
      resizeInterpolation,
    }

    // Add optional model path overrides for script preview
    const script = generateTrainingScript({
      ...trainingConfig,
      pretrainedPath: (overrideUnet && overrideUnet.trim()) || selectedModelData?.path || undefined,
      clipPath: overrideClip.trim() || undefined,
      t5Path: overrideT5.trim() || undefined,
      aePath: overrideAe.trim() || undefined,
    })
  const datasetToml = generateDatasetToml(trainingConfig)

  // Training run state and logs
  const [runId, setRunId] = React.useState<string | null>(null)
  const [isTraining, setIsTraining] = React.useState(false)
  const [termLogs, setTermLogs] = React.useState('')
  const logsTimer = React.useRef<number | null>(null)
  const [metrics, setMetrics] = React.useState<any>(null)
  const metricsTimer = React.useRef<number | null>(null)
  const [serverActiveRun, setServerActiveRun] = React.useState<{ run_id: string, status: string, output_name?: string } | null>(null)

  // Bottom dock for Training Output
  const [consoleOpen, setConsoleOpen] = React.useState<boolean>(() => {
    try { return localStorage.getItem('kiko.console.open') !== 'false' } catch { return true }
  })
  const [consoleHeight, setConsoleHeight] = React.useState<number>(() => {
    try { 
      const saved = Number(localStorage.getItem('kiko.console.h') || 360)
      // Validate saved height against current viewport
      const maxHeight = Math.round(window.innerHeight * 0.9)
      const minHeight = 160
      return Math.min(Math.max(saved, minHeight), maxHeight)
    } catch { 
      return Math.min(360, Math.round(window.innerHeight * 0.5)) 
    }
  })
  const resizeRef = React.useRef<boolean>(false)
  
  // Auto-adjust console height when window resizes
  React.useEffect(() => {
    const handleResize = () => {
      setConsoleHeight(prev => {
        const maxHeight = Math.round(window.innerHeight * 0.9)
        const minHeight = 160
        const adjusted = Math.min(Math.max(prev, minHeight), maxHeight)
        // If current height is off-screen, reset to a sensible default
        if (prev > window.innerHeight - 100) {
          return Math.min(360, Math.round(window.innerHeight * 0.5))
        }
        return adjusted
      })
    }
    
    window.addEventListener('resize', handleResize)
    // Check on mount
    handleResize()
    
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  
  // When console opens, validate height
  React.useEffect(() => {
    if (consoleOpen) {
      const maxHeight = Math.round(window.innerHeight * 0.9)
      const minHeight = 160
      setConsoleHeight(prev => {
        // If height would put console off screen, reset to default
        if (prev > window.innerHeight - 100) {
          return Math.min(360, Math.round(window.innerHeight * 0.5))
        }
        return Math.min(Math.max(prev, minHeight), maxHeight)
      })
    }
  }, [consoleOpen])
  
  React.useEffect(() => { try { localStorage.setItem('kiko.console.open', String(consoleOpen)) } catch {} }, [consoleOpen])
  React.useEffect(() => { try { localStorage.setItem('kiko.console.h', String(consoleHeight)) } catch {} }, [consoleHeight])
  // When the bottom dock is open, prevent page scroll; allow scrolling only inside the dock
  React.useEffect(() => {
    const prev = document.body.style.overflow
    if (consoleOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = prev || ''
      document.body.style.removeProperty('overflow')
    }
    return () => {
      document.body.style.overflow = prev
    }
  }, [consoleOpen])
  React.useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizeRef.current) return
      const vh = window.innerHeight
      const newH = Math.min(Math.max(vh - e.clientY, 160), Math.round(vh * 0.9))
      setConsoleHeight(newH)
    }
    const onUp = () => { resizeRef.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

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
      // Build sample prompts TOML when controls set
      const promptLines = (samples || '').split('\n').map(l=>l.trim()).filter(Boolean)
      let preparedSamples = samples
      if (promptLines.length > 0) {
        const size = parseInt(sampleRes)
        const blocks = promptLines.map(text => (
          `[[prompt]]\ntext = ${JSON.stringify(text)}\nwidth = ${size}\nheight = ${size}\nsample_steps = ${sampleSteps}\n`
        ))
        preparedSamples = blocks.join('\n')
      }

      // If we have images in store, upload them to backend dataset folder
      let prep: Response
      // If there are images in memory, upload them to create a dataset for this run.
      // This avoids missing-image errors when a dataset folder path isn't actually present on disk.
      const shouldUpload = images.length > 0
      if (shouldUpload) {
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
        fd.append('high_vram', String(!!highVram))
        fd.append('tensorboard', String(!!enableTB))
        fd.append('sample_prompts', preparedSamples)
        if (sampleSampler) fd.append('sample_sampler', String(sampleSampler))
        fd.append('sample_every_n_steps', String(sampleEvery))
        fd.append('class_tokens', classTokens)
        fd.append('num_repeats', String(numRepeats))
        fd.append('train_batch_size', String(batch))
        fd.append('dataset_folder', datasetFolder || '')
        // Text Encoder training
        fd.append('train_clip_l', String(!!trainClipL))
        fd.append('train_t5xxl', String(!!trainT5))
        if (teLr) fd.append('text_encoder_lr', String(teLr))
        if (teWarmupSteps && teWarmupSteps > 0) fd.append('te_warmup_steps', String(teWarmupSteps))
        // advanced options (send when in advanced mode)
        if (isAdvanced) {
          if (lrScheduler) fd.append('lr_scheduler', String(lrScheduler))
          if (lrWarmup != null) fd.append('lr_warmup_steps', String(lrWarmup))
          if (noiseOffset != null) fd.append('noise_offset', String(noiseOffset))
          fd.append('flip_aug', String(!!flipSymmetry))
          if (loraDropout != null) fd.append('network_dropout', String(loraDropout))
          if (networkAlpha != null) fd.append('network_alpha', String(networkAlpha))
          if (rankDropout != null) fd.append('rank_dropout', String(rankDropout))
          if (moduleDropout != null) fd.append('module_dropout', String(moduleDropout))
          if (blocksToSwap && blocksToSwap !== 'auto') {
            const val = blocksToSwap === 'off' ? '0' : String(parseInt(blocksToSwap))
            fd.append('blocks_to_swap', val)
          }
          // Bucketing
          fd.append('enable_bucket', String(!!enableBucket))
          if (minBucketReso != null) fd.append('min_bucket_reso', String(minBucketReso))
          if (maxBucketReso != null) fd.append('max_bucket_reso', String(maxBucketReso))
          if (bucketResoSteps != null) fd.append('bucket_reso_steps', String(sanitizeBucketStep(bucketResoSteps)))
          fd.append('bucket_no_upscale', String(!!bucketNoUpscale))
          if (resizeInterpolation) fd.append('resize_interpolation', String(resizeInterpolation))
        }
        if (selectedModelData?.path) {
          fd.append('pretrained_path', selectedModelData.path)
        }
        const caps = images.map(img => img.caption || '')
        fd.append('captions', JSON.stringify(caps))
        images.forEach(img => fd.append('images', img.file, img.file.name))
        prep = await fetch(apiUrl('/api/train/prepare-upload'), { method: 'POST', body: fd })
      } else {
        const prepBody: any = {
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
          high_vram: !!highVram,
          tensorboard: !!enableTB,
          sample_prompts: preparedSamples,
          sample_every_n_steps: sampleEvery,
          sample_sampler: sampleSampler,
          class_tokens: classTokens,
          num_repeats: numRepeats,
          train_batch_size: batch,
          dataset_folder: datasetFolder || undefined,
          advanced_components: [],
          train_clip_l: !!trainClipL,
          train_t5xxl: !!trainT5,
          text_encoder_lr: teLr || undefined,
          te_warmup_steps: teWarmupSteps || undefined,
        }
        if (isAdvanced) {
          prepBody.lr_scheduler = lrScheduler
          prepBody.lr_warmup_steps = lrWarmup
          prepBody.noise_offset = noiseOffset
          prepBody.flip_aug = flipSymmetry
          prepBody.network_dropout = loraDropout
          prepBody.network_alpha = networkAlpha
          prepBody.rank_dropout = rankDropout
          prepBody.module_dropout = moduleDropout
          if (blocksToSwap && blocksToSwap !== 'auto') {
            prepBody.blocks_to_swap = blocksToSwap === 'off' ? 0 : parseInt(blocksToSwap)
          }
          // Bucketing
          prepBody.enable_bucket = enableBucket
          prepBody.min_bucket_reso = minBucketReso
          prepBody.max_bucket_reso = maxBucketReso
          prepBody.bucket_reso_steps = sanitizeBucketStep(bucketResoSteps)
          prepBody.bucket_no_upscale = bucketNoUpscale
          prepBody.resize_interpolation = resizeInterpolation
        }
        prep = await fetch(apiUrl('/api/train/prepare'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(prepBody)
        })
      }
      if (!prep.ok) {
        try {
          const err = await prep.json()
          console.error('Prepare error:', err)
        } catch {}
        throw new Error('prepare failed')
      }
      const prepData = await prep.json()
      // Hints: show rank capping and block swap usage
      if (typeof prepData?.effective_network_dim === 'number' && prepData.effective_network_dim !== dim) {
        // const from = dim
        // const to = prepData.effective_network_dim // unused
        try { (await import('react-hot-toast')).toast?.(null as any) } catch {}
      }
      try {
        const { toast } = await import('react-hot-toast')
        if (typeof prepData?.effective_network_dim === 'number' && prepData.effective_network_dim !== dim) {
          toast?.success(`Rank capped: ${dim} → ${prepData.effective_network_dim} for ${vram}`)
        }
        if (typeof prepData?.blocks_to_swap === 'number' && prepData.blocks_to_swap > 0) {
          toast?.(`Block swap enabled (${prepData.blocks_to_swap}) to reduce VRAM`, { icon: '🧠' })
        }
        if (typeof prepData?.mixed_precision === 'string') {
          const mp = String(prepData.mixed_precision).toUpperCase()
          toast?.success(`Mixed precision set to ${mp}`)
        }
      } catch {}
      const rid = prepData.run_id as string
      if (prepData.output_name) setActiveOutputName(prepData.output_name)
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
          if (runs.length > 0) {
            // If we have a remembered run, match it; else pick first
            const match = rid ? runs.find((r:any)=>r.run_id===rid) : runs[0]
            if (match) {
              setServerActiveRun({ run_id: match.run_id, status: match.status, output_name: match.output_name })
              if (!activeOutputName && match.output_name) setActiveOutputName(match.output_name)
            }
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
    // Import training configuration from JSON file
    const importTraining = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return
      
      try {
        const text = await file.text()
        const data = JSON.parse(text)
        
        if (data.version !== 1) {
          const { toast } = await import('react-hot-toast')
          toast.error('Unsupported export version')
          return
        }
        
        // Import context
        if (data.context) {
          // Note: loraName, classTokens, datasetFolder would need to be updated via the training context
          // For now, we'll skip these as they're managed differently
        }
        
        // Import all parameters
        if (data.params) {
          const p = data.params
          if (p.baseModel) setBaseModel(p.baseModel)
          if (p.pretrainedPath) {
            setSelectedModelData({ path: p.pretrainedPath, filename: p.pretrainedPath.split('/').pop(), name: p.pretrainedPath.split('/').pop(), metadata: {} } as any)
          }
          if (p.vram) setVram(p.vram)
          if (p.lr) {
            setLr(p.lr)
            // Update the preset dropdown to match the imported learning rate
            const presets = new Set(['8e-4','5e-4','2e-4','1e-4'])
            setLrPreset(presets.has(p.lr) ? p.lr : 'custom')
          }
          if (p.dim != null) setDim(Number(p.dim))
          if (p.epochs != null) setEpochs(Number(p.epochs))
          if (p.saveEvery != null) setSaveEvery(Number(p.saveEvery))
          if (p.batch != null) setBatch(Number(p.batch))
          if (p.res != null) setRes(String(p.res))
          if (p.timestep) setTimestep(p.timestep)
          if (p.guidance != null) setGuidance(Number(p.guidance))
          if (p.samplePrompts != null) setSamples(String(p.samplePrompts))
          if (p.sampleEvery != null) setSampleEvery(Number(p.sampleEvery))
          if (p.sampleRes) setSampleRes(p.sampleRes)
          if (p.sampleSteps != null) setSampleSteps(Number(p.sampleSteps))
          if (p.sampleSampler) setSampleSampler(p.sampleSampler)
          if (p.numRepeats != null) setNumRepeats(Number(p.numRepeats))
          if (p.seed != null) setSeed(Number(p.seed))
          if (p.workers != null) setWorkers(Number(p.workers))
          // Advanced
          if (p.lrScheduler) setLrScheduler(p.lrScheduler)
          if (p.lrWarmup != null) setLrWarmup(Number(p.lrWarmup))
          if (p.noiseOffset != null) setNoiseOffset(Number(p.noiseOffset))
          if (p.flipSymmetry != null) setFlipSymmetry(Boolean(p.flipSymmetry))
          if (p.loraDropout != null) setLoraDropout(Number(p.loraDropout))
          if (p.networkAlpha != null) setNetworkAlpha(Number(p.networkAlpha))
          if (p.rankDropout != null) setRankDropout(Number(p.rankDropout))
          if (p.moduleDropout != null) setModuleDropout(Number(p.moduleDropout))
          // VRAM settings (only if present - backward compatibility)
          if (p.blocksToSwap !== undefined) setBlocksToSwap(String(p.blocksToSwap))
          if (p.highVram !== undefined) setHighVram(Boolean(p.highVram))
          if (p.enableTB !== undefined) setEnableTB(Boolean(p.enableTB))
          // Text encoder training (only if present - backward compatibility)
          if (p.trainClipL !== undefined) setTrainClipL(Boolean(p.trainClipL))
          if (p.trainT5 !== undefined) setTrainT5(Boolean(p.trainT5))
          if (p.teLr !== undefined) setTeLr(String(p.teLr))
          if (p.teWarmupSteps !== undefined) setTeWarmupSteps(Number(p.teWarmupSteps))
          // Bucketing
          if (p.enableBucket != null) setEnableBucket(Boolean(p.enableBucket))
          if (p.bucketResoSteps != null) setBucketResoSteps(Number(p.bucketResoSteps))
          if (p.minBucketReso != null) setMinBucketReso(Number(p.minBucketReso))
          if (p.maxBucketReso != null) setMaxBucketReso(Number(p.maxBucketReso))
          if (p.bucketNoUpscale != null) setBucketNoUpscale(Boolean(p.bucketNoUpscale))
          if (p.resizeInterpolation !== undefined) setResizeInterpolation(String(p.resizeInterpolation))
          // Model path overrides (optional)
          if (p.pretrainedPath) setOverrideUnet(String(p.pretrainedPath))
          if (p.clipPath) setOverrideClip(String(p.clipPath))
          if (p.t5Path) setOverrideT5(String(p.t5Path))
          if (p.aePath) setOverrideAe(String(p.aePath))
        }
        
        // Import images to store
        if (data.images && Array.isArray(data.images)) {
          const { addImagesWithCaptions } = useStore.getState()
          const imageFiles = await Promise.all(data.images.map(async (img: any) => {
            const response = await fetch(img.dataUrl)
            const blob = await response.blob()
            const file = new File([blob], img.name, { type: img.type })
            return { file, caption: img.caption || '' }
          }))
          addImagesWithCaptions(imageFiles)
        }

        // Fix class_tokens conflict: if import has class_tokens set but also has images with captions, clear class_tokens
        const importedClassTokens = data.context?.classTokens || data.params?.classTokens
        const hasImportedImages = data.images && Array.isArray(data.images) && data.images.length > 0
        const hasIndividualCaptions = hasImportedImages && data.images.some((img: any) => img.caption && img.caption.trim())
        
        if (importedClassTokens && hasIndividualCaptions) {
          // Clear class_tokens from global config since we have individual captions
          const { updateConfig } = useStore.getState()
          updateConfig('trigger_word', '') // Clear trigger word which stores class_tokens
          
          const { toast } = await import('react-hot-toast')
          toast.success('Configuration imported! Class tokens cleared since individual captions were found.')
        } else {
          const { toast } = await import('react-hot-toast')
          toast.success('Configuration imported successfully!')
        }
      } catch (error) {
        console.error('Import error:', error)
        const { toast } = await import('react-hot-toast')
        toast.error('Failed to import configuration: ' + (error as any).message)
      }
      
      // Reset the file input
      event.target.value = ''
    }

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
          baseModel,
          pretrainedPath: (overrideUnet && overrideUnet.trim()) || selectedModelData?.path || '',
          clipPath: overrideClip || undefined,
          t5Path: overrideT5 || undefined,
          aePath: overrideAe || undefined,
          vram, lr, dim, epochs, saveEvery, batch, res, timestep, guidance,
          samplePrompts: samples, sampleEvery, sampleRes, sampleSteps, sampleSampler,
          numRepeats, seed, workers,
          // advanced
          lrScheduler, lrWarmup, noiseOffset, flipSymmetry,
          loraDropout, networkAlpha, rankDropout, moduleDropout,
          // VRAM settings
          blocksToSwap, highVram, enableTB,
          // Text encoder training
          trainClipL, trainT5, teLr, teWarmupSteps,
          // bucketing
          enableBucket, bucketResoSteps: sanitizeBucketStep(bucketResoSteps), minBucketReso, maxBucketReso, bucketNoUpscale, resizeInterpolation,
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
            <div className="flex items-center justify-between gap-4">
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
              <div className="flex items-center gap-2">
                <label className="text-xs opacity-70">Mode</label>
                <Select
                  value={uiMode}
                  onChange={(e) => { setUiMode(e.target.value); try { localStorage.setItem('kiko.trainingMode', e.target.value) } catch {} }}
                  options={[
                    { value: 'basic', label: 'Basic' },
                    { value: 'advanced', label: 'Advanced' },
                  ]}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Model & Hardware first */}
            <CollapsibleSection title="Model & Hardware" storageKey="kiko.modelhw" className="p-4 rounded-md border border-zinc-800 space-y-4">
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
              </div>
            </CollapsibleSection>

            {/* Learning Schedule after Model & Hardware */}
            <CollapsibleSection
              title="Model Paths (Advanced)"
              subtitle="Override default model component paths for script previews and exports. Leave empty to use environment defaults."
              storageKey="kiko.advanced.modelpaths"
              className="p-4 rounded-md border border-zinc-800 space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label className="flex items-center gap-2">
                    Pretrained UNet Path (override)
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>
                          Affects the generated training script and exports only. Leave empty to auto-resolve from the Base Model or the
                          selected model file. Backend training resolves paths on the server; this override does not change server behavior.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </Label>
                  <Input
                    placeholder={selectedModelData?.path || 'auto (based on base model)'}
                    value={overrideUnet}
                    onChange={e=>setOverrideUnet(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="flex items-center gap-2">
                    CLIP L Path (override)
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>
                          Used for script/exports preview only. Default: {PATHS_CONFIG.clipL}. Backend resolves CLIP L on the server and ignores this field.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </Label>
                  <Input
                    placeholder={PATHS_CONFIG.clipL}
                    value={overrideClip}
                    onChange={e=>setOverrideClip(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="flex items-center gap-2">
                    T5XXL Path (override)
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>
                          Used for script/exports preview only. Default: {PATHS_CONFIG.t5xxl}. Backend resolves T5XXL on the server and ignores this field.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </Label>
                  <Input
                    placeholder={PATHS_CONFIG.t5xxl}
                    value={overrideT5}
                    onChange={e=>setOverrideT5(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="flex items-center gap-2">
                    VAE Path (override)
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>
                          Used for script/exports preview only. Default: {PATHS_CONFIG.ae}. Backend resolves VAE on the server and ignores this field.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </Label>
                  <Input
                    placeholder={PATHS_CONFIG.ae}
                    value={overrideAe}
                    onChange={e=>setOverrideAe(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-zinc-500">Note: Backend training uses server-side paths; these overrides affect the generated script preview and exports.</p>
            </CollapsibleSection>

            {/* Learning Schedule after Model & Hardware */}
            <CollapsibleSection
              title="Learning Schedule"
              className="p-4 rounded-md border border-zinc-800 space-y-4"
              summary={`${lrScheduler || 'scheduler'}, warmup ${lrWarmup}`}
              storageKey="kiko.advanced.schedule"
            >
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="flex items-center gap-2">
                    LR Scheduler
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Learning rate schedule. Cosine with a warmup generally refines late training better than constant.</p>
                      </TooltipContent>
                    </Tooltip>
                  </Label>
                  <Select value={lrScheduler} onChange={e=>setLrScheduler(String(e.target.value))} options={[ 
                    {value:'constant', label:'constant'},
                    {value:'constant_with_warmup', label:'constant_with_warmup'},
                    {value:'linear', label:'linear'},
                    {value:'cosine', label:'cosine'},
                    {value:'cosine_with_restarts', label:'cosine_with_restarts'},
                    {value:'polynomial', label:'polynomial'},
                    {value:'inverse_sqrt', label:'inverse_sqrt'},
                    {value:'cosine_with_min_lr', label:'cosine_with_min_lr'},
                    {value:'warmup_stable_decay', label:'warmup_stable_decay'},
                    {value:'piecewise_constant', label:'piecewise_constant'},
                    {value:'adafactor', label:'adafactor'},
                  ]} />
                </div>
                <div>
                  <Label className="flex items-center gap-2">
                    Warmup (steps or ratio &lt; 1)
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Use integer steps or a ratio like 0.05 (5% of total steps). Warmup helps stabilize early training.</p>
                      </TooltipContent>
                    </Tooltip>
                  </Label>
                  <Input type="number" value={Number(lrWarmup)} onChange={e=>setLrWarmup(Number(e.target.value))} step={0.01} min={0} />
                </div>
              </div>
            </CollapsibleSection>

            {/* Core training fields */}
            <CollapsibleSection
              title="Core Training"
              className="p-4 rounded-md border border-zinc-800 space-y-4"
              summary={`lr ${lr || (lrPreset!=='custom'?lrPreset:'custom')}, rank ${dim}, epochs ${epochs}`}
              storageKey="kiko.core.training"
            >
            <div className="grid grid-cols-2 gap-4">
              
            
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
                <Select
                  value={lrPreset}
                  onChange={e=>{
                    const v = String(e.target.value)
                    setLrPreset(v)
                    if (v !== 'custom') setLr(v)
                  }}
                  options={[
                    {value:'8e-4', label:'8e-4 (Very High, short runs)'},
                    {value:'5e-4', label:'5e-4 (High)'},
                    {value:'2e-4', label:'2e-4 (Balanced)'},
                    {value:'1e-4', label:'1e-4 (Conservative)'},
                    {value:'custom', label:'Custom…'},
                  ]}
                />
                {lrPreset === 'custom' && (
                  <div className="mt-2 space-y-1">
                    <Label className="flex items-center gap-2">
                      Custom LR (decimal or scientific)
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Enter values like 0.0002 or 2e-4.</p>
                        </TooltipContent>
                      </Tooltip>
                    </Label>
                    <Input
                      type="text"
                      value={lr}
                      onChange={e=>setLr(e.target.value.trim())}
                      placeholder="e.g., 2e-4 or 0.0002"
                    />
                    {(() => {
                      const num = Number(lr)
                      if (!isNaN(num) && lr !== '') {
                        return (
                          <div className="text-xs text-gray-400">
                            <span className="mr-3">decimal: {num.toFixed(10)}</span>
                            <span>scientific: {num.toExponential(2)}</span>
                          </div>
                        )
                      }
                      if (lr !== '' && isNaN(Number(lr))) {
                        return <div className="text-xs text-red-400">Invalid number</div>
                      }
                      return null
                    })()}
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-1">Effective LR: {lr || '(not set)'}</p>
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
              {/* Advanced-only block */}
              {uiMode === 'advanced' && (
                <>
                  <div>
                    <Label className="flex items-center gap-2">
                      Network Alpha
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>LoRA alpha scaling. Often same as rank or half the rank. If unset, defaults to 1.</p>
                        </TooltipContent>
                      </Tooltip>
                    </Label>
                    <Input type="number" value={networkAlpha ?? 0} onChange={e=>setNetworkAlpha(Number(e.target.value))} step={0.1} min={0} />
                  </div>
                  <div>
                    <Label className="flex items-center gap-2">
                      Rank Dropout (Flux LoRA)
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Randomly drops LoRA ranks each step (<code>--network_args \"rank_dropout=...\"</code>). Try 0.1.</p>
                        </TooltipContent>
                      </Tooltip>
                    </Label>
                    <Input type="number" value={rankDropout ?? 0} onChange={e=>setRankDropout(Number(e.target.value))} step={0.01} min={0} max={1} />
                  </div>
                </>
              )}
              {uiMode === 'advanced' && (<div>
                <Label className="flex items-center gap-2">
                  Module Dropout (Flux LoRA)
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Randomly disables entire LoRA modules (<code>--network_args "module_dropout=..."</code>). Try 0.1.</p>
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <Input type="number" value={moduleDropout ?? 0} onChange={e=>setModuleDropout(Number(e.target.value))} step={0.01} min={0} max={1} />
              </div>)}
            </div>
            </CollapsibleSection>
              {uiMode === 'advanced' && (
                <CollapsibleSection title="Augmentations & Bucketing" subtitle="Dataset augmentations and resolution buckets for multi-aspect training." summary={augSummary} storageKey="kiko.advanced.aug_bucket" className="col-span-2 p-4 rounded-md border border-zinc-800 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center justify-between">
                      <Label id="flip-symmetry-label" className="flex items-center gap-2">
                        Horizontal flip
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Use for symmetrical characters to augment with mirrored poses.</p>
                          </TooltipContent>
                        </Tooltip>
                      </Label>
                      <Switch id="flip-symmetry" ariaLabelledby="flip-symmetry-label" checked={!!flipSymmetry} onCheckedChange={setFlipSymmetry} />
                    </div>
                    <div>
                      <Label className="flex items-center gap-2">LoRA Dropout
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Optional regularization (e.g., 0.1) to reduce overfitting; useful with larger datasets (&gt;100 images).</p>
                          </TooltipContent>
                        </Tooltip>
                      </Label>
                      <Input type="number" value={loraDropout ?? 0} onChange={e=>setLoraDropout(Number(e.target.value))} step={0.01} min={0} max={1} />
                    </div>
                    <div className="col-span-2 mt-2 p-3 rounded-md border border-zinc-800">
                      <div className="flex items-center justify-between">
                        <Label id="enable-bucket-label" className="flex items-center gap-2">
                          Aspect ratio bucketing
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p>Enable multiple aspect ratio buckets. For Flux LoRA, a step of 32 is recommended.</p>
                            </TooltipContent>
                          </Tooltip>
                        </Label>
                        <Switch id="enable-bucket" ariaLabelledby="enable-bucket-label" checked={!!enableBucket} onCheckedChange={setEnableBucket} />
                      </div>
                      {enableBucket && (
                        <div className="grid grid-cols-2 gap-3 mt-3">
                          <div>
                            <Label className="flex items-center gap-2">Bucket step</Label>
                            <Input type="number" min={32} step={32} value={bucketResoSteps} onChange={e=>setBucketResoSteps(Number(e.target.value))} onBlur={e=>setBucketResoSteps(sanitizeBucketStep(Number(e.currentTarget.value)))} />
                            <p className="text-xs text-gray-400 mt-1">Flux LoRA requires divisible by 64.</p>
                          </div>
                          <div>
                            <Label className="flex items-center gap-2">No upscale</Label>
                            <div className="flex justify-between items-center">
                              <span className="text-xs text-gray-400">Avoid enlarging small images</span>
                              <Switch id="bucket-no-upscale" checked={!!bucketNoUpscale} onCheckedChange={setBucketNoUpscale} />
                            </div>
                          </div>
                          <div>
                            <Label className="flex items-center gap-2">Min bucket resolution</Label>
                            <Input type="number" min={64} step={1} value={minBucketReso} onChange={e=>setMinBucketReso(Number(e.target.value))} />
                          </div>
                          <div>
                            <Label className="flex items-center gap-2">Max bucket resolution</Label>
                            <Input type="number" min={128} step={1} value={maxBucketReso} onChange={e=>setMaxBucketReso(Number(e.target.value))} />
                          </div>
                          <div className="col-span-2">
                            <Label className="flex items-center gap-2">Resize interpolation</Label>
                            <Select value={resizeInterpolation || ''} onChange={e=>setResizeInterpolation(e.target.value || undefined)} options={[
                              {value:'', label:'Default (area downscale, lanczos upscale)'},
                              {value:'lanczos', label:'lanczos'},
                              {value:'nearest', label:'nearest'},
                              {value:'bilinear', label:'bilinear'},
                              {value:'linear', label:'linear'},
                              {value:'bicubic', label:'bicubic'},
                              {value:'cubic', label:'cubic'},
                              {value:'area', label:'area'},
                            ]} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </CollapsibleSection>
              )}

              
              <CollapsibleSection title="Reproducibility & Compute" summary={`seed ${seed}, workers ${workers}`} storageKey="kiko.advanced.repro" className="col-span-2 p-4 rounded-md border border-zinc-800 space-y-4">
                <div className="grid grid-cols-2 gap-4">
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
              <div className="flex flex-col gap-2">
                <Label className="flex items-center gap-2">
                  High VRAM mode
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Forces high VRAM residency (--highvram). Keeps more model state on the GPU to reduce CPU↔GPU transfers and can improve training throughput and stability. Increases peak VRAM and OOM risk. Recommended for 24GB+ GPUs or when you aim for ~20/24GB usage. Combine with Block Swap = Off for maximum VRAM usage.</p>
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <div>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={highVram} onChange={e=>setHighVram(e.target.checked)} />
                    <span>Force --highvram</span>
                  </label>
                </div>
              </div>
              <div className="col-span-2 p-3 rounded border border-zinc-800">
                <div className="font-medium mb-2">Text Encoder Training</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">Train CLIP-L</Label>
                    <Switch checked={!!trainClipL} onCheckedChange={setTrainClipL} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">Train T5-XXL</Label>
                    <Switch checked={!!trainT5} onCheckedChange={setTrainT5} />
                  </div>
                  <div className="col-span-2">
                    <Label className="flex items-center gap-2">
                      Text Encoder LR
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Optional. Decimal or scientific (e.g., 1e-5). If empty, TE uses the main LR.</p>
                        </TooltipContent>
                      </Tooltip>
                    </Label>
                    <Input type="text" value={teLr} onChange={e=>setTeLr(e.target.value.trim())} placeholder="e.g., 1e-5" />
                    {teLr && isNaN(Number(teLr)) && (<div className="text-xs text-red-400 mt-1">Invalid number</div>)}
                  </div>
                  <div className="col-span-2">
                    <Label className="flex items-center gap-2">
                      TE Warmup Steps (auto-freeze)
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Hint: 500–1000 steps so the UNet learns first, then the encoder updates slightly. Trains TE for N steps, then auto-freezes and continues UNet-only.</p>
                        </TooltipContent>
                      </Tooltip>
                    </Label>
                    <Input type="number" min={0} value={teWarmupSteps} onChange={e=>setTeWarmupSteps(Number(e.target.value))} placeholder="0 (off)" />
                    {(trainClipL || trainT5) && (<div className="text-xs text-amber-400 mt-1">Note: Text encoder caching is disabled while TE is training and re-enabled after warmup.</div>)}
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label className="flex items-center gap-2">
                  TensorBoard logs
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Enable sd-scripts TensorBoard logging. Writes events to outputs/[run]/tb. Our Loss chart prefers TB when available; otherwise it falls back to CSV.</p>
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <div>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={enableTB} onChange={e=>setEnableTB(e.target.checked)} />
                    <span>Enable TensorBoard</span>
                  </label>
                </div>
              </div>
              <div>
                <Label className="flex items-center gap-2">
                  Block Swap (VRAM saver)
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Swap model blocks between GPU and CPU during training to reduce peak VRAM. Auto enables this on 20–24GB. Turn off or set a custom number of blocks.</p>
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <Select value={blocksToSwap} onChange={e=>setBlocksToSwap(e.target.value)} options={[
                  { value: 'auto', label: 'Auto (recommended)' },
                  { value: 'off', label: 'Off' },
                  { value: '12', label: '12 blocks' },
                  { value: '18', label: '18 blocks' },
                  { value: '24', label: '24 blocks' },
                ]} />
              </div>
              </div>
              </CollapsibleSection>
          </CardContent>
        </Card>


        <div className="space-y-6">

          
          
          {uiMode === 'advanced' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">Sampling & Monitoring</CardTitle>
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
                    Generate Samples @ steps
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
                  <div>
                    <Label className="flex items-center gap-2">
                      Sample Size
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Resolution for generated sample images. Higher sizes take more time and VRAM.</p>
                        </TooltipContent>
                      </Tooltip>
                    </Label>
                    <Select value={sampleRes} onChange={e=>setSampleRes(e.target.value as any)} options={[
                      { value: '512', label: '512 × 512' },
                      { value: '768', label: '768 × 768' },
                      { value: '1024', label: '1024 × 1024' },
                    ]} />
                  </div>
                  <div>
                    <Label className="flex items-center gap-2">
                      Sample Steps
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Number of inference steps per sample image. More steps can improve quality but increase time.</p>
                        </TooltipContent>
                      </Tooltip>
                    </Label>
                    <Input type="number" min={1} value={sampleSteps} onChange={e=>setSampleSteps(Number(e.target.value))} />
                  </div>
                  <div>
                    <Label className="flex items-center gap-2">
                      Sampler
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Scheduler used for sample generation. Different samplers trade off speed and style.</p>
                        </TooltipContent>
                      </Tooltip>
                    </Label>
                    <Select value={sampleSampler} onChange={e=>setSampleSampler(String(e.target.value))} options={[
                      { value:'ddim', label:'ddim' },
                      { value:'pndm', label:'pndm' },
                      { value:'lms', label:'lms' },
                      { value:'euler', label:'euler' },
                      { value:'euler_a', label:'euler_a' },
                      { value:'heun', label:'heun' },
                      { value:'dpm_2', label:'dpm_2' },
                      { value:'dpm_2_a', label:'dpm_2_a' },
                      { value:'dpmsolver', label:'dpmsolver' },
                      { value:'dpmsolver++', label:'dpmsolver++' },
                      { value:'dpmsingle', label:'dpmsingle' },
                      { value:'k_lms', label:'k_lms' },
                      { value:'k_euler', label:'k_euler' },
                      { value:'k_euler_a', label:'k_euler_a' },
                      { value:'k_dpm_2', label:'k_dpm_2' },
                      { value:'k_dpm_2_a', label:'k_dpm_2_a' },
                    ]} />
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-2">
                <Button variant="outline" onClick={() => setOpenPrompts(true)} className="w-full">
                  <FileText className="w-4 h-4 mr-2" /> View Prompts
                </Button>
                <Button variant="outline" onClick={() => setOpenScript(true)} className="w-full">
                  <FileText className="w-4 h-4 mr-2" /> View Script
                </Button>
                <Button variant="outline" onClick={() => setOpenDataset(true)} className="w-full">
                  <FileJson className="w-4 h-4 mr-2" /> View Dataset
                </Button>
                <Button variant="outline" onClick={exportTraining} className="w-full">Export Config</Button>
                <Button variant="outline" onClick={() => document.getElementById('importInput')?.click()} className="w-full">
                  Import Config
                </Button>
                <input
                  id="importInput"
                  type="file"
                  accept=".json"
                  onChange={importTraining}
                  style={{ display: 'none' }}
                />
                <Button onClick={startTraining} disabled={isTraining} className="w-full">
                  <Play className="w-4 h-4 mr-2" /> {isTraining ? 'Training…' : 'Start Training'}
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Bottom dock rendered outside the grid below */}


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
      </div>
      {/* Prompts Preview */}
      <Dialog open={openPrompts} onOpenChange={setOpenPrompts} title="Sample Prompts (preview.toml)">
        <div className="text-xs mb-2 text-zinc-400">Sampler: {sampleSampler} • Size: {sampleRes} • Steps: {sampleSteps}</div>
        <pre className="text-xs overflow-auto p-4 bg-black/40 rounded-lg border whitespace-pre font-mono">
{buildPromptsToml() || '# Enter prompts above to preview TOML\n'}
        </pre>
      </Dialog>
      {/* Bottom Dock: Training Output */}
      <div
        className={`fixed z-50 left-0 right-0 bottom-0 ${consoleOpen ? '' : ''}`}
        style={consoleOpen ? { height: consoleHeight, bottom: 0 } : { height: 44, bottom: 8 }}
      >
        {/* Drag handle */}
        {consoleOpen && (
          <div
            className="h-2 cursor-row-resize bg-zinc-800/80"
            onMouseDown={() => { resizeRef.current = true }}
            title="Drag to resize"
          />
        )}
        <div className="h-full bg-black/90 border-t border-zinc-800 backdrop-blur flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 text-sm border-b border-zinc-800">
            <div className="flex items-center gap-3">
              <span className="font-medium">Training Output{runId ? ` — ${runId}` : ''}</span>
              {metrics && (
                <div className="hidden md:flex items-center gap-2 text-xs text-zinc-300">
                  <span>CPU {metrics.cpu?.percent?.toFixed?.(0) || '0'}%</span>
                  <span className="opacity-50">•</span>
                  <span>Mem {metrics.memory ? `${(metrics.memory.used/ (1024**3)).toFixed(1)}/${(metrics.memory.total/(1024**3)).toFixed(1)} GB` : 'n/a'}</span>
                  {(metrics.gpus || []).map((g: any) => (
                    <span key={g.index} className="ml-2">GPU{g.index} {g.util?.toFixed?.(0) || 0}% { (g.mem_used && g.mem_total) ? `(${(g.mem_used/1024).toFixed(1)}/${(g.mem_total/1024).toFixed(1)} GB)` : ''}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!isTraining && serverActiveRun && (
                <Button size="sm" onClick={() => {
                  const rid = serverActiveRun.run_id
                  setRunId(rid)
                  setIsTraining(true)
                  pollLogs(rid)
                  pollMetrics()
                  // Prefer server-provided output name; fallback to current loraName
                  if (serverActiveRun.output_name) setActiveOutputName(serverActiveRun.output_name)
                  else if (!activeOutputName && loraName) setActiveOutputName(loraName)
                  try { localStorage.setItem('active_run_id', rid) } catch {}
                  setServerActiveRun(null)
                }}>Resume</Button>
              )}
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={()=>setShowLossChart(v=>!v)}>Loss</Button>
                {showLossChart && (
                  <Button size="sm" variant="outline" onClick={()=>setShowSamples(v=>!v)}>{showSamples ? 'Hide Samples' : 'Show Samples'}</Button>
                )}
                {showLossChart && metricsSource !== 'none' && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${metricsSource==='tensorboard'?'border-purple-500 text-purple-300':'border-zinc-700 text-zinc-300'}`}>{metricsSource==='tensorboard'?'TB':'CSV'}</span>
                )}
              </div>
              <Button size="sm" variant="outline" onClick={()=>setTermLogs('')}>Clear</Button>
              <Button size="sm" variant="outline" onClick={stopTraining} disabled={!isTraining}>Stop</Button>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => {
                  const defaultHeight = Math.min(360, Math.round(window.innerHeight * 0.5))
                  setConsoleHeight(defaultHeight)
                }}
                title="Reset terminal height to default"
              >
                Reset Size
              </Button>
              <Button size="sm" variant="outline" onClick={()=>setConsoleOpen(!consoleOpen)}>{consoleOpen ? 'Minimize' : 'Show'}</Button>
            </div>
          </div>
          {consoleOpen && (
            <div className="flex-1 overflow-hidden flex">
              <div className="w-full h-full flex flex-col">
                {showLossChart ? (
                  <div className="border-b border-zinc-800 p-2">
                    <MetricsChart outputName={activeOutputName || loraName || ''} onSourceChange={setMetricsSource} />
                    {showSamples && (
                      <div className="mt-3">
                        {activeOutputName && (
                          <SampleGallery outputName={activeOutputName} onOpen={(images, index)=>setViewer({ images, index })} />
                        )}
                      </div>
                    )}
                  </div>
                ) : null}
                <pre className="flex-1 text-xs bg-black text-green-200 p-3 whitespace-pre-wrap overflow-auto">{termLogs}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Image viewer modal (reuse-style) */}
      <Dialog open={!!viewer} onOpenChange={(open)=>!open && setViewer(null)} title={activeOutputName || 'Preview'}>
        {viewer && (
          <ImageViewer images={viewer.images} index={viewer.index} name={activeOutputName} onClose={() => setViewer(null)} />
        )}
      </Dialog>
    </TooltipProvider>
  )
}
