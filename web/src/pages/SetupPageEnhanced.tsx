import React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Select } from "../components/ui/select";
import { Dialog } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Switch } from "../components/ui/switch";
import { Separator } from "../components/ui/separator";
import { Upload, ImagePlus, X, Sparkles, HelpCircle } from "lucide-react";
import { generateCaptions, getModelStatus, ModelStatus } from "../services/captionApi";
import { VirtuosoGrid } from "react-virtuoso";
import type { ImageFile } from "../types";
import { toast } from 'react-hot-toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip";
import { useTraining } from "../contexts/TrainingContext";
import { useStore } from "../store/useStore";
import { FileJson } from 'lucide-react'

export function SetupPageEnhanced() {
  // Use context to share with Training page
  const { 
    loraName: contextLoraName, 
    setLoraName: setContextLoraName,
    classTokens: contextClassTokens,
    setClassTokens: setContextClassTokens,
    datasetFolder: contextDatasetFolder,
    setDatasetFolder: setContextDatasetFolder
  } = useTraining();
  
  // Use global store for unlimited image handling
  const { images, addImages, addImagesWithCaptions, removeImage, updateCaption, clearImages, updateConfig } = useStore();
  // --------- Edit Captions (Find/Replace or Regex Remove) ---------
  const [editSearch, setEditSearch] = React.useState('')
  const [editReplace, setEditReplace] = React.useState('')
  const [regexMode, setRegexMode] = React.useState(false)
  const [ignoreCase, setIgnoreCase] = React.useState(true)
  const [previewOpen, setPreviewOpen] = React.useState(false)
  const [previewIndex, setPreviewIndex] = React.useState<number | null>(null)
  const [applyAllNext, setApplyAllNext] = React.useState(false)
  const [regexError, setRegexError] = React.useState<string | null>(null)
  // Build regex from current find settings
  function buildRegexFromSearch(): RegExp | null {
    try {
      let pattern = editSearch
      let flags = 'g'
      if (pattern.startsWith('(?i)')) { pattern = pattern.slice(4); flags += 'i' }
      else if (ignoreCase) { flags += 'i' }
      if (!regexMode) {
        pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      }
      return new RegExp(pattern, flags)
    } catch (e: any) {
      setRegexError(String(e?.message || e))
      return null
    }
  }
  
  // Debug: log current images count
  if (import.meta.env.DEV) console.log('SetupPageEnhanced render - Current images.length:', images.length);
  
  const [loraName, setLoraName] = React.useState(contextLoraName || "");
  const [trigger, setTrigger] = React.useState(
    (contextClassTokens ? String(contextClassTokens).replace(/,$/, '') : '')
  );

  // Keep local inputs in sync if context changes (e.g., after import)
  React.useEffect(() => {
    setLoraName(contextLoraName || '')
  }, [contextLoraName])
  React.useEffect(() => {
    setTrigger(contextClassTokens ? String(contextClassTokens).replace(/,$/, '') : '')
  }, [contextClassTokens])
  
  React.useEffect(() => {
    // Set a default dataset folder based on lora name (within this repo)
    if (loraName) {
      setContextDatasetFolder(`/home/vito/ai-apps/kiko-trainer/datasets/${loraName}`);
    }
  }, [loraName, setContextDatasetFolder]);
  const [modelStatus, setModelStatus] = React.useState<ModelStatus | null>(null);
  const { captionJob, startCaptionJob, cancelCaptionJob } = useStore()
  
  // Caption model settings
  const [captionModel, setCaptionModel] = React.useState("qwen-7b");
  const [captionStyle, setCaptionStyle] = React.useState("brief");
  const [attention] = React.useState("eager");
  const [maxLen] = React.useState(1024);
  const [beam] = React.useState(3);
  const [temp, setTemp] = React.useState(0.7);
  const [removePrefix, setRemovePrefix] = React.useState(true);
  const [batchSize] = React.useState(1);

  const getModelRepo = (model: string) => {
    switch (model) {
      case 'florence-large': return 'microsoft/Florence-2-large';
      case 'florence-small': return 'microsoft/Florence-2-base';
      case 'qwen-3b': return 'Qwen/Qwen2.5-VL-3B-Instruct';
      case 'qwen-7b': return 'Qwen/Qwen2.5-VL-7B-Instruct';
      case 'qwen-relaxed': return 'Ertugrul/Qwen2.5-VL-7B-Captioner-Relaxed';
      case 'qwen-72b': return 'Qwen/Qwen2.5-VL-72B-Instruct';
      default: return 'Qwen/Qwen2.5-VL-7B-Instruct';
    }
  };

  const pollModelStatus = async (modelRepo: string) => {
    try {
      const status = await getModelStatus(modelRepo);
      setModelStatus(status);
      
      // Continue polling if downloading
      if (status.status === 'downloading') {
        setTimeout(() => pollModelStatus(modelRepo), 1000); // Poll every second
      }
    } catch (error) {
      console.error('Error polling model status:', error);
    }
  };

  function handleFiles(files: FileList | File[]) {
    if (import.meta.env.DEV) console.log('handleFiles called with', files.length, 'files');
    const fileArray = Array.from(files).filter((f) =>
      /\.(png|jpe?g|webp)$/i.test(f.name)
    );
    if (import.meta.env.DEV) console.log('After filtering:', fileArray.length, 'valid image files');
    
    // Use Zustand store's addImages function for unlimited file handling
    addImages(fileArray);
    if (import.meta.env.DEV) console.log('addImages called with', fileArray.length, 'files');
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }

  function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
  }

  // Import Training JSON -> populate UI (config + images + captions)
  async function onImportTraining(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      // Populate context fields
      if (data?.context?.loraName) setLoraName(data.context.loraName)
      if (data?.context?.classTokens) setTrigger(String(data.context.classTokens).replace(/,$/, ''))
      if (data?.context?.datasetFolder) setContextDatasetFolder(data.context.datasetFolder)

      // Populate training parameters into global config (used by Training page)
      if (data?.params) {
        const p = data.params
        try {
          if (p.baseModel) updateConfig('baseModel', p.baseModel)
          if (p.pretrainedPath) updateConfig('pretrainedPath', p.pretrainedPath)
          if (p.vram) updateConfig('vram', p.vram)
          if (p.lr) updateConfig('learningRate', p.lr)
          if (p.dim != null) updateConfig('networkDim', Number(p.dim))
          if (p.epochs != null) updateConfig('maxEpochs', Number(p.epochs))
          if (p.saveEvery != null) updateConfig('saveEvery', Number(p.saveEvery))
          if (p.batch != null) updateConfig('trainBatchSize', Number(p.batch))
          if (p.res) updateConfig('resolution', Number(p.res))
          if (p.timestep) updateConfig('timestepSampling', p.timestep)
          if (p.guidance != null) updateConfig('guidanceScale', Number(p.guidance))
          if (p.samplePrompts != null) updateConfig('samplePrompts', String(p.samplePrompts))
          if (p.sampleEvery != null) updateConfig('sampleEverySteps', Number(p.sampleEvery))
          if (p.sampleRes) updateConfig('sampleRes', String(p.sampleRes))
          if (p.sampleSteps != null) updateConfig('sampleSteps', Number(p.sampleSteps))
          if (p.sampleSampler) updateConfig('sampleSampler', String(p.sampleSampler))
          if (p.numRepeats != null) updateConfig('numRepeats', Number(p.numRepeats))
          if (p.seed != null) updateConfig('seed', Number(p.seed))
          if (p.workers != null) updateConfig('workers', Number(p.workers))
          // advanced
          if (p.lrScheduler) updateConfig('lrScheduler', p.lrScheduler)
          if (p.lrWarmup != null) updateConfig('lrWarmupSteps', Number(p.lrWarmup))
          if (p.noiseOffset != null) updateConfig('noiseOffset', Number(p.noiseOffset))
          if (p.flipSymmetry != null) updateConfig('flipSymmetry', Boolean(p.flipSymmetry))
          if (p.loraDropout != null) updateConfig('loraDropout', Number(p.loraDropout))
          if (p.networkAlpha != null) updateConfig('networkAlpha', Number(p.networkAlpha))
          if (p.rankDropout != null) updateConfig('rankDropout', Number(p.rankDropout))
          if (p.moduleDropout != null) updateConfig('moduleDropout', Number(p.moduleDropout))
          // bucketing
          if (p.enableBucket != null) updateConfig('enableBucket', Boolean(p.enableBucket))
          if (p.bucketResoSteps != null) updateConfig('bucketResoSteps', Number(p.bucketResoSteps))
          if (p.minBucketReso != null) updateConfig('minBucketReso', Number(p.minBucketReso))
          if (p.maxBucketReso != null) updateConfig('maxBucketReso', Number(p.maxBucketReso))
          if (p.bucketNoUpscale != null) updateConfig('bucketNoUpscale', Boolean(p.bucketNoUpscale))
          if (p.resizeInterpolation != null) updateConfig('resizeInterpolation', String(p.resizeInterpolation) as any)
        } catch (e) {
          console.warn('Partial training params import failed:', e)
        }
      }

      // Populate images with captions
      if (Array.isArray(data?.images)) {
        // Clear existing
        clearImages()
        const items = await Promise.all(data.images.map(async (it: any) => {
          const res = await fetch(it.dataUrl)
          const blob = await res.blob()
          const file = new File([blob], it.name || 'image', { type: it.type || blob.type })
          return { file, caption: it.caption || '' }
        }))
        addImagesWithCaptions(items)
      }
    } catch (err) {
      console.error('Failed to import training JSON:', err)
      alert('Invalid training JSON file')
    } finally {
      // reset input value so same file can be chosen again if needed
      (e.target as HTMLInputElement).value = ''
    }
  }

  // removeImage and updateCaption now come from Zustand store

  async function generateCaptionsForImages() {
    if (!trigger) {
      alert("Please enter a trigger word first");
      return;
    }
    const modelRepo = getModelRepo(captionModel)
    pollModelStatus(modelRepo)
    await startCaptionJob({
      trigger,
      modelType: captionModel.includes('florence') ? 'florence2' : 'qwen-vl',
      model: (() => {
        switch (captionModel) {
          case 'florence-large': return 'microsoft/Florence-2-large';
          case 'florence-small': return 'microsoft/Florence-2-base';
          case 'qwen-3b': return 'Qwen/Qwen2.5-VL-3B-Instruct';
          case 'qwen-7b': return 'Qwen/Qwen2.5-VL-7B-Instruct';
          case 'qwen-relaxed': return 'Ertugrul/Qwen2.5-VL-7B-Captioner-Relaxed';
          case 'qwen-72b': return 'Qwen/Qwen2.5-VL-72B-Instruct';
          default: return 'Qwen/Qwen2.5-VL-7B-Instruct';
        }
      })(),
      captionStyle,
      attention,
      maxLen,
      beam,
      temp,
      removePrefix,
      batchSize,
      topP: 0.9,
      qwenPreset: captionModel.includes('qwen') ? captionStyle : undefined,
      qwenMinPixels: captionModel.includes('qwen') ? 256 * 28 * 28 : undefined,
      qwenMaxPixels: captionModel.includes('qwen') ? 1280 * 28 * 28 : undefined,
    })
  }

  return (
    <TooltipProvider>
    <div className="grid lg:grid-cols-3 gap-6">
      {/* Left Column - LoRA Info and Florence Settings */}
      <div className="lg:col-span-1 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              LoRA Information
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>Configure the basic information for your LoRA model. The trigger word is essential - it will be used to activate your trained style in generation.</p>
                </TooltipContent>
              </Tooltip>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name" className="flex items-center gap-2">
                LoRA Name
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>A name for your model. This will be used to identify your trained LoRA file. Use something descriptive like "MyCharacter" or "MyStyle".</p>
                  </TooltipContent>
                </Tooltip>
              </Label>
              <Input
                id="name"
                value={loraName}
                onChange={(e) => {
                  const v = e.target.value
                  setLoraName(v)
                  setContextLoraName(v)
                  try { localStorage.setItem('kiko.loraName', v) } catch {}
                }}
                autoComplete="off"
                type="text"
              />
            </div>
            <div>
              <Label htmlFor="trigger" className="flex items-center gap-2">
                Trigger Word/Sentence
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>A unique word or phrase that will activate your trained style when generating images. Example: "ohwx person" or "in xyz style". This will be added to all your training captions.</p>
                  </TooltipContent>
                </Tooltip>
              </Label>
              <Input
                id="trigger"
                placeholder="e.g., ohwx person"
                value={trigger}
                onChange={(e) => {
                  const v = e.target.value
                  setTrigger(v)
                  const withComma = v && !v.endsWith(',') ? `${v},` : v
                  setContextClassTokens(withComma)
                  try { localStorage.setItem('kiko.classTokens', withComma) } catch {}
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Vision Model Settings
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>Choose the AI model to generate captions for your images. Larger models provide better quality but require more VRAM. Florence is faster, Qwen provides more detailed descriptions.</p>
                </TooltipContent>
              </Tooltip>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="flex items-center gap-2">
                Vision Model
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>AI model for generating image descriptions. Florence is faster but simpler. Qwen provides more detailed, natural descriptions. Larger models need more VRAM but give better results.</p>
                  </TooltipContent>
                </Tooltip>
              </Label>
              <Select
                value={captionModel}
                onChange={(e) => setCaptionModel(e.target.value)}
                options={[
                  { value: "florence-small", label: "Florence-2 Base (Fast, 0.2B params)" },
                  { value: "florence-large", label: "Florence-2 Large (Better, 0.7B params)" },
                  { value: "qwen-3b", label: "Qwen2.5-VL 3B (Fast, 8GB+ VRAM)" },
                  { value: "qwen-7b", label: "Qwen2.5-VL 7B (Balanced, 16GB+ VRAM)" },
                  { value: "qwen-relaxed", label: "Qwen2.5-VL 7B Captioner (Relaxed)" },
                  { value: "qwen-72b", label: "Qwen2.5-VL 72B (Best, 80GB+ VRAM)" },
                ]}
              />
            </div>
            <div>
              <Label className="flex items-center gap-2">
                Caption Style
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>Brief: Short 1-2 sentence descriptions. Detailed: Comprehensive descriptions with body shape, clothing, environment, and lighting. Use Detailed for better training results.</p>
                  </TooltipContent>
                </Tooltip>
              </Label>
              <Select
                value={captionStyle}
                onChange={(e) => setCaptionStyle(e.target.value)}
                options={[
                  { value: "brief", label: "Brief" },
                  { value: "detailed", label: "Detailed" },
                ]}
              />
            </div>
            <div>
              <Label className="flex items-center gap-2">
                Temperature
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>Controls creativity in descriptions. 0 = most consistent/factual, 1 = most creative/varied. Recommended: 0.7 for balanced descriptions.</p>
                  </TooltipContent>
                </Tooltip>
              </Label>
              <Input
                type="number"
                step="0.1"
                value={temp}
                onChange={(e) => setTemp(Number(e.target.value))}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={removePrefix}
                onChange={(e) => setRemovePrefix(e.target.checked)}
                className="rounded border-border"
              />
              <span className="text-sm flex items-center gap-2">
                Remove prefix
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>Remove "The image shows" type prefixes from captions. Keep this checked for cleaner training data.</p>
                  </TooltipContent>
                </Tooltip>
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Edit Captions
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm text-xs">
                  <div>Perform search and replace across captions, or remove via Regex mode.</div>
                  <div className="mt-2 font-medium">Regex tips</div>
                  <ul className="list-disc ml-4 space-y-1">
                    <li>Case-insensitive: <code>(?i)a woman</code></li>
                    <li>Word boundary: <code>\ba woman\b</code></li>
                    <li>Flexible spaces: <code>a\s+woman</code></li>
                  </ul>
                </TooltipContent>
              </Tooltip>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-sm">Find</Label>
              <Input placeholder="Search text or regex" value={editSearch} onChange={e=>setEditSearch(e.target.value)} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch id="regex-mode" checked={regexMode} onCheckedChange={setRegexMode} />
                <Label htmlFor="regex-mode">Regex mode</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="ignore-case" checked={ignoreCase} onCheckedChange={setIgnoreCase} />
                <Label htmlFor="ignore-case">Ignore case</Label>
              </div>
            </div>
            <div>
              <Label className="text-sm">Replace</Label>
              <Input placeholder="Replacement text" value={editReplace} onChange={e=>setEditReplace(e.target.value)} />
            </div>
            {regexError && (<div className="text-xs text-red-400">{regexError}</div>)}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setRegexError(null); const re = buildRegexFromSearch(); if (!re) return; const start = previewIndex!=null ? (previewIndex+1)%images.length : 0; let found: number | null = null; for (let i=0;i<images.length;i++){ const idx=(start+i)%images.length; const cap=images[idx]?.caption||''; re.lastIndex=0; if (re.test(cap)){ found=idx; break } } if (found==null) toast('No matches found'); else { setPreviewIndex(found); setPreviewOpen(true) } }}>Find Next</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Column - Images */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              Training Images
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>Upload 10-50 images for best results. Each image should clearly show your subject. After uploading, use Auto-Caption to generate detailed descriptions that will help train the model.</p>
                </TooltipContent>
              </Tooltip>
            </CardTitle>
            <div className="flex flex-col items-end gap-2">
              <div className="flex gap-2">
                <label className="inline-flex items-center gap-2 cursor-pointer px-3 py-2 rounded-md border hover:bg-muted">
                  <FileJson size={16} />
                  <span>Import Training</span>
                  <input type="file" accept="application/json" className="hidden" onChange={onImportTraining} />
                </label>
                {images.length > 0 && (
                  <Button
                    onClick={() => {
                      if (confirm(`Remove all ${images.length} images?`)) clearImages();
                    }}
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                  >
                    Clear All ({images.length})
                  </Button>
                )}
                <Button
                  onClick={generateCaptionsForImages}
                  disabled={images.length === 0 || !trigger || captionJob.isRunning || modelStatus?.status === 'downloading'}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <Sparkles size={16} />
                  {captionJob.isRunning
                    ? `Generating (${captionJob.current}/${captionJob.total})`
                    : (modelStatus?.status === 'downloading' ? 'Downloading Model...' : 'Auto-Caption All')}
                </Button>
              </div>
              {modelStatus?.status === 'downloading' && (
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  <div className="flex items-center gap-2">
                    <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${modelStatus.progress}%` }}
                      />
                    </div>
                    <span>{modelStatus.progress}%</span>
                  </div>
                  <div className="mt-1 text-xs">{modelStatus.message}</div>
                </div>
              )}
              {captionJob.total > 0 && captionJob.isRunning && modelStatus?.status !== 'downloading' && (
                <div className="text-sm text-gray-600 dark:text-gray-400 w-full max-w-xs">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${captionJob.total ? Math.round((captionJob.current / captionJob.total) * 100) : 0}%` }}
                      />
                    </div>
                    <span className="tabular-nums text-xs">{captionJob.current}/{captionJob.total}</span>
                  </div>
                  <div className="mt-1 text-xs">Generating captions...</div>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              className="mt-2 rounded-xl border border-dashed p-6 text-center bg-muted/40"
            >
              <div className="flex flex-col items-center gap-2">
                <ImagePlus className="opacity-70" />
                <p className="text-sm font-medium text-primary">
                  For 100+ images: Drag & drop from file explorer
                </p>
                <p className="text-xs text-muted-foreground">
                  File picker button limited to ~12 files. Drag & drop supports unlimited files.
                </p>
                <p className="text-xs text-gray-400">Supports PNG, JPG, JPEG, WebP, HEIC, HEIF</p>
                <div>
                  <label className="inline-flex items-center gap-2 mt-3 cursor-pointer px-3 py-2 rounded-md border hover:bg-muted">
                    <Upload size={16} />
                    <span>Select images (limited to ~12)</span>
                    <input
                      type="file"
                      multiple
                      accept="image/png,image/jpeg,image/jpg,image/webp,image/heic,image/heif,.heic,.heif"
                      className="hidden"
                      onChange={onSelect}
                    />
                  </label>
                </div>
              </div>
            </div>
            
            {!trigger && images.length > 0 && (
              <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-800 rounded-md">
                <p className="text-sm text-yellow-200">
                  ⚠️ Please enter a trigger word above before captioning
                </p>
              </div>
            )}
            
            <div className="mt-2 space-y-1">
              <p className="text-sm text-gray-400">
                {images.length} images selected
              </p>
              {images.length > 0 && (
                <p className="text-xs text-blue-500">
                  💡 Tip: If you have more images, you can add them in multiple batches. Files will be added to your existing selection.
                </p>
              )}
            </div>
          </div>

          {images.length > 0 && (
            <>
              <Separator />
              <VirtuosoGrid
                style={{ height: 600 }}
                totalCount={images.length}
                overscan={200}
                data={images}
                computeItemKey={(index, item) => (item as ImageFile).id}
                components={{
                  List: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>((props, ref) => (
                    <div
                      {...props}
                      ref={ref}
                      className="grid grid-cols-1 md:grid-cols-2 gap-6"
                    />
                  )),
                  Item: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>((props, ref) => (
                    <div {...props} ref={ref} />
                  )),
                }}
                itemContent={(index, item) => (
                  <ThumbCard
                    img={item as ImageFile}
                    onRemove={removeImage}
                    onUpdate={updateCaption}
                    trigger={trigger}
                  />
                )}
              />
              {/* Progress bar for captioning */}
              {captionJob?.total > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span>Captioning {captionJob.current}/{captionJob.total}</span>
                    <span className="opacity-70">{Math.round((captionJob.current / Math.max(1, captionJob.total)) * 100)}%</span>
                  </div>
                  <div className="w-full h-2 bg-zinc-800 rounded overflow-hidden">
                    <div className="h-2 bg-emerald-500" style={{ width: `${(captionJob.current / Math.max(1, captionJob.total)) * 100}%` }} />
                  </div>
                  <div className="flex gap-2 mt-2">
                    {captionJob.isRunning ? (
                      <Button variant="outline" onClick={cancelCaptionJob}>Cancel</Button>
                    ) : (
                      <>
                        <Button variant="outline" onClick={generateCaptionsForImages}>Resume</Button>
                        <Button variant="outline" onClick={cancelCaptionJob}>Clear</Button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
    <Dialog open={previewOpen} onOpenChange={setPreviewOpen} title="Apply Edit?">
      {previewIndex != null ? (
        <div className="space-y-3">
          <div className="text-xs text-zinc-400">Image: {images[previewIndex]?.file?.name || 'n/a'}</div>
          <div className="text-xs text-zinc-400">Pattern: <code>{(() => { try { let p=editSearch; let f='g'; if(p.startsWith('(?i)')){p=p.slice(4); f+='i'} else if(ignoreCase){f+='i'}; const pat = regexMode ? p : p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); return new RegExp(pat, f).toString() } catch { return '' } })()}</code></div>
          <div className="p-2 rounded border bg-black/40 text-sm whitespace-pre-wrap">
            {/* simple highlight by splitting */}
            {( () => {
              try {
                let pattern = editSearch; let flags='g'; if (pattern.startsWith('(?i)')) { pattern=pattern.slice(4); flags+='i' }
                const re = new RegExp(regexMode ? pattern : pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags)
                const cap = images[previewIndex]?.caption || ''
                const out: any[] = []; let last=0; re.lastIndex=0; let m: RegExpExecArray | null
                while ((m = re.exec(cap)) !== null) { const s=m.index, e=s+(m[0]?.length||0); if (s>last) out.push(cap.slice(last,s)); out.push(<span key={s} className="bg-yellow-600/50">{cap.slice(s,e)}</span>); last=e; if (m[0]?.length===0) re.lastIndex++ }
                if (last<cap.length) out.push(cap.slice(last)); return out
              } catch { return images[previewIndex]?.caption || '' }
            })()}
          </div>
          <div className="flex items-center gap-2">
            <Switch id="apply-all" checked={applyAllNext} onCheckedChange={setApplyAllNext} />
            <Label htmlFor="apply-all">Apply to all matches</Label>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={()=>setPreviewOpen(false)}>Cancel</Button>
            <Button onClick={() => { if (previewIndex==null) return; try {
              let pattern = editSearch; let flags='g'; if (pattern.startsWith('(?i)')) { pattern=pattern.slice(4); flags+='i' }
              const re = new RegExp(regexMode ? pattern : pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags)
              if (applyAllNext) {
                images.forEach(img => { const cap=img.caption||''; re.lastIndex=0; if (re.test(cap)) { const updated = regexMode ? cap.replace(re,'') : cap.replace(re, editReplace); updateCaption(img.id, updated) } })
                setPreviewOpen(false); toast.success('Applied to all matching captions')
              } else {
                const cap = images[previewIndex]?.caption || ''; const updated = regexMode ? cap.replace(re,'') : cap.replace(re, editReplace); updateCaption(images[previewIndex].id, updated)
                // next
                let nextIdx: number | null = null; for (let i=1;i<=images.length;i++){ const idx=(previewIndex+i)%images.length; const c=images[idx]?.caption||''; re.lastIndex=0; if (re.test(c)){ nextIdx=idx; break } }
                if (nextIdx!=null) { setPreviewIndex(nextIdx) } else { setPreviewOpen(false) }
              }
            } catch(e){ toast.error('Invalid regex or operation failed') } }}>Apply</Button>
          </div>
        </div>
      ) : (
        <div className="text-sm">No match selected.</div>
      )}
    </Dialog>
    </TooltipProvider>
  );
}

type ThumbCardProps = {
  img: ImageFile;
  trigger: string;
  onRemove: (id: string) => void;
  onUpdate: (id: string, value: string) => void;
}

const ThumbCard: React.FC<ThumbCardProps> = React.memo(({ img, trigger, onRemove, onUpdate }) => {
  const [text, setText] = React.useState(img.caption || "");

  // Sync local state if external caption changes (e.g., auto-caption)
  React.useEffect(() => {
    setText(img.caption || "");
    // Only when the item identity or external caption changes
  }, [img.id, img.caption]);

  return (
    <div className="bg-muted/30 rounded-lg p-4 border">
      <div className="relative group mb-3">
        <img
          src={img.preview}
          alt={img.file.name}
          loading="lazy"
          decoding="async"
          className="w-full max-h-64 object-contain rounded border bg-white shadow-sm"
        />
        <button
          onClick={() => onRemove(img.id)}
          className="absolute top-1 right-1 bg-destructive/80 hover:bg-destructive p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X size={14} />
        </button>
      </div>
      <div className="bg-muted/50 rounded px-2 py-1 mb-2">
        <p className="text-xs font-medium truncate text-muted-foreground">
          {img.file.name}
        </p>
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onUpdate(img.id, text)}
        placeholder={`${trigger || 'trigger'}, description...`}
        className="min-h-[80px] text-sm"
      />
    </div>
  );
});
ThumbCard.displayName = 'ThumbCard';
