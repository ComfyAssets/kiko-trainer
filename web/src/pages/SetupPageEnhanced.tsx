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
import { Button } from "../components/ui/button";
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
  
  // Debug: log current images count
  if (import.meta.env.DEV) console.log('SetupPageEnhanced render - Current images.length:', images.length);
  
  const [loraName, setLoraName] = React.useState("");
  const [trigger, setTrigger] = React.useState("");
  
  // Update context when local values change
  React.useEffect(() => {
    setContextLoraName(loraName);
  }, [loraName, setContextLoraName]);
  
  React.useEffect(() => {
    // Add comma if trigger doesn't end with one
    const triggerWithComma = trigger && !trigger.endsWith(',') ? `${trigger},` : trigger;
    setContextClassTokens(triggerWithComma);
  }, [trigger, setContextClassTokens]);
  
  React.useEffect(() => {
    // Set a default dataset folder based on lora name (within this repo)
    if (loraName) {
      setContextDatasetFolder(`/home/vito/ai-apps/kiko-trainer/datasets/${loraName}`);
    }
  }, [loraName, setContextDatasetFolder]);
  const [isGeneratingCaptions, setIsGeneratingCaptions] = React.useState(false);
  const [modelStatus, setModelStatus] = React.useState<ModelStatus | null>(null);
  const [capDone, setCapDone] = React.useState(0);
  const [capTotal, setCapTotal] = React.useState(0);
  
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
          if (p.numRepeats != null) updateConfig('numRepeats', Number(p.numRepeats))
          if (p.seed != null) updateConfig('seed', Number(p.seed))
          if (p.workers != null) updateConfig('workers', Number(p.workers))
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

    setIsGeneratingCaptions(true);
    setCapDone(0);
    setCapTotal(images.length);
    
    // Get the actual model repo and check status
    const modelRepo = getModelRepo(captionModel);
    
    // Start polling model status
    pollModelStatus(modelRepo);
    
    try {
      // Process images sequentially to provide progress feedback
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        try {
          const captions = await generateCaptions(
            [img.file],
            {
              modelType: captionModel.includes('florence') ? 'florence2' : 'qwen-vl',
              model: (() => {
                switch (captionModel) {
                  case 'florence-large': return 'microsoft/Florence-2-large';
                  case 'florence-small': return 'microsoft/Florence-2-base';
                  case 'qwen-3b': return 'Qwen/Qwen2.5-VL-3B-Instruct';
                  case 'qwen-7b': return 'Qwen/Qwen2.5-VL-7B-Instruct';
                  case 'qwen-72b': return 'Qwen/Qwen2.5-VL-72B-Instruct';
                  default: return 'Qwen/Qwen2.5-VL-7B-Instruct';
                }
              })(),
              style: captionStyle,
              attention,
              maxLength: maxLen,
              beam,
              temperature: temp,
              removePrefix,
              batchSize,
              triggerWord: trigger,
              topP: 0.9,
              qwenPreset: captionModel.includes('qwen') ? captionStyle : undefined,
              minPixels: captionModel.includes('qwen') ? 256 * 28 * 28 : undefined,
              maxPixels: captionModel.includes('qwen') ? 1280 * 28 * 28 : undefined
            }
          );
          const newCaption = captions[0] || `${trigger}, image`;
          updateCaption(img.id, newCaption);
        } catch (err) {
          console.error('Caption failed for', img.file.name, err);
          // Fallback: keep existing or set a minimal caption
          updateCaption(img.id, img.caption || `${trigger}, image`);
        }
        setCapDone(i + 1);
      }
      toast.success(`Generated captions for ${images.length} image${images.length !== 1 ? 's' : ''}`)
    } catch (error) {
      console.error("Failed to generate captions:", error);
      toast.error("Failed to generate captions")
    } finally {
      setIsGeneratingCaptions(false);
    }
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
                onChange={(e) => setLoraName(e.target.value)}
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
                onChange={(e) => setTrigger(e.target.value)}
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
                  disabled={images.length === 0 || !trigger || isGeneratingCaptions}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <Sparkles size={16} />
                  {isGeneratingCaptions 
                    ? (modelStatus?.status === 'downloading' 
                        ? "Downloading Model..." 
                        : modelStatus?.status === 'loaded'
                          ? `Generating (${capDone}/${capTotal})`
                          : "Loading Model...")
                    : "Auto-Caption All"}
                </Button>
              </div>
              {isGeneratingCaptions && modelStatus?.status === 'downloading' && (
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
              {isGeneratingCaptions && modelStatus?.status !== 'downloading' && (
                <div className="text-sm text-gray-600 dark:text-gray-400 w-full max-w-xs">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${capTotal ? Math.round((capDone / capTotal) * 100) : 0}%` }}
                      />
                    </div>
                    <span className="tabular-nums text-xs">{capDone}/{capTotal}</span>
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
            </>
          )}
        </CardContent>
      </Card>
    </div>
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
