import React from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '../components/ui/card'
import { Label } from '../components/ui/label'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { Progress } from '../components/ui/progress'
import { Dialog } from '../components/ui/dialog'
import { 
  Download, 
  Key, 
  Check, 
  AlertCircle, 
  Loader2,
  ExternalLink,
  FolderOpen,
  AlertTriangle,
  X,
  Trash2,
  HardDrive,
  Edit2,
  Info,
  RefreshCw,
  Image as ImageIcon
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/ui/tooltip'
import { Separator } from '../components/ui/separator'
import { apiUrl } from '../config/api'
import { useSSE } from '../hooks/useSSE'

interface DownloadItem {
  id: string
  name: string
  status: 'pending' | 'downloading' | 'completed' | 'error' | 'cancelled' | 'cancelling'
  progress: number
  size?: string
  error?: string
  file_path?: string
}

interface ComponentStatus {
  exists: boolean
  name: string
  file: string
  size?: string
}

interface InstalledModel {
  name: string
  path: string
  size: string
  size_bytes: number
  modified: string
  type: 'checkpoint' | 'lora' | 'vae' | 'clip' | 't5xxl' | 'unknown'
  preview_image?: string
  integrity?: { ok: boolean; error?: string; sha256?: string; validated_at?: number }
  source_url?: string
}

interface ModelsResponse {
  models: InstalledModel[]
  total_size: string
  count: number
  path: string
  error?: string
}

export function ModelPage() {
  const [apiKey, setApiKey] = React.useState('')
  const [apiKeySaved, setApiKeySaved] = React.useState(false)
  const [civitaiUrl, setCivitaiUrl] = React.useState('')
  const [modelPath, setModelPath] = React.useState('/home/vito/ai-apps/kiko-trainer/models')
  const [downloads, setDownloads] = React.useState<DownloadItem[]>([])
  const [isDownloading, setIsDownloading] = React.useState(false)
  const [showOverwriteDialog, setShowOverwriteDialog] = React.useState(false)
  const [pendingFluxDownload, setPendingFluxDownload] = React.useState(false)
  const [modelPreview, setModelPreview] = React.useState<{url: string, name: string, images?: string[]} | null>(null)
  const [previewOptions, setPreviewOptions] = React.useState<string[]>([])
  const [selectedPreviewUrl, setSelectedPreviewUrl] = React.useState<string | null>(null)
  const [duplicateInfo, setDuplicateInfo] = React.useState<{filename: string} | null>(null)
  const [showDuplicateDialog, setShowDuplicateDialog] = React.useState(false)
  const [isLoadingPreview, setIsLoadingPreview] = React.useState(false)
  const [componentStatus, setComponentStatus] = React.useState<Record<string, ComponentStatus>>({})
  const [showCivitaiConfirm, setShowCivitaiConfirm] = React.useState(false)
  const [showFullImage, setShowFullImage] = React.useState(false)
  const [installedModels, setInstalledModels] = React.useState<InstalledModel[]>([])
  const [modelsLoading, setModelsLoading] = React.useState(false)
  const [totalModelSize, setTotalModelSize] = React.useState('')
  const [showRenameDialog, setShowRenameDialog] = React.useState(false)
  const [modelToRename, setModelToRename] = React.useState<InstalledModel | null>(null)
  const [newModelName, setNewModelName] = React.useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false)
  const [modelToDelete, setModelToDelete] = React.useState<InstalledModel | null>(null)
  const [activeDownloadId, setActiveDownloadId] = React.useState<string | null>(null)
  const [showChoosePreview, setShowChoosePreview] = React.useState(false)
  const [previewTarget, setPreviewTarget] = React.useState<InstalledModel | null>(null)
  const [attachUrl, setAttachUrl] = React.useState('')
  const [attachImages, setAttachImages] = React.useState<string[]>([])
  const [attachSelected, setAttachSelected] = React.useState<string | null>(null)
  const [attachLoading, setAttachLoading] = React.useState(false)

  // Use SSE for real-time download progress
  useSSE(activeDownloadId ? `/downloads/stream/${activeDownloadId}` : null, {
    onMessage: (data) => {
      console.log('SSE Update:', data)
      setDownloads(prev => prev.map(d => 
        d.id === data.id ? { ...d, ...data } : d
      ))
      
      // Stop tracking when download is done
      if (data.status === 'completed' || data.status === 'error' || data.status === 'cancelled') {
        setIsDownloading(false)
        if (data.id === activeDownloadId) {
          setActiveDownloadId(null)
        }
      }
    },
    onError: (error) => {
      console.error('SSE Error:', error)
    }
  })

  // Load saved API key on mount
  React.useEffect(() => {
    const savedKey = localStorage.getItem('civitai_api_key')
    if (savedKey) {
      setApiKey(savedKey)
      setApiKeySaved(true)
    }
  }, [])
  
  // Check component status whenever path changes
  // StrictMode guard: avoid duplicate runs for the same path in dev
  const lastLoadedPathRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (import.meta.env.DEV) {
      if (lastLoadedPathRef.current === modelPath) return
      lastLoadedPathRef.current = modelPath
    }
    checkFluxComponentStatus()
    loadInstalledModels()
  }, [modelPath])

  const handleSaveApiKey = () => {
    localStorage.setItem('civitai_api_key', apiKey)
    setApiKeySaved(true)
  }

  // Load installed models
  const loadInstalledModels = async () => {
    setModelsLoading(true)
    try {
      const url = apiUrl(`/models?path=${encodeURIComponent(modelPath)}`)
      console.log('Loading models from:', url)
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      })
      
      console.log('Response status:', response.status)
      
      if (response.ok) {
        const data: ModelsResponse = await response.json()
        console.log('Models data:', data)
        setInstalledModels(data.models || [])
        setTotalModelSize(data.total_size || '0 B')
      } else {
        console.error('Failed to load models:', response.status, response.statusText)
      }
    } catch (error) {
      console.error('Error loading models:', error)
      setInstalledModels([])
    } finally {
      setModelsLoading(false)
    }
  }

  // Delete a model
  const handleDeleteModel = async (model: InstalledModel) => {
    setModelToDelete(model)
    setShowDeleteConfirm(true)
  }

  const confirmDeleteModel = async () => {
    if (!modelToDelete) return
    
    try {
      const response = await fetch(apiUrl(`/models/${encodeURIComponent(modelToDelete.name)}?path=${encodeURIComponent(modelPath)}`), {
        method: 'DELETE'
      })
      
      if (response.ok) {
        // Reload models list
        await loadInstalledModels()
        // Also refresh component status if it's a FLUX component
        await checkFluxComponentStatus()
      }
    } catch (error) {
      console.error('Error deleting model:', error)
    } finally {
      setShowDeleteConfirm(false)
      setModelToDelete(null)
    }
  }

  // Rename a model
  const handleRenameModel = (model: InstalledModel) => {
    setModelToRename(model)
    setNewModelName(model.name)
    setShowRenameDialog(true)
  }

  const confirmRenameModel = async () => {
    if (!modelToRename || !newModelName) return
    
    try {
      const response = await fetch(apiUrl('/models/rename'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          old_name: modelToRename.name,
          new_name: newModelName,
          path: modelPath
        })
      })
      
      if (response.ok) {
        // Reload models list
        await loadInstalledModels()
      }
    } catch (error) {
      console.error('Error renaming model:', error)
    } finally {
      setShowRenameDialog(false)
      setModelToRename(null)
      setNewModelName('')
    }
  }

  // Get model type badge color
  const getModelTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'checkpoint': return 'bg-blue-500'
      case 'lora': return 'bg-purple-500'
      case 'vae': return 'bg-green-500'
      case 'clip': return 'bg-yellow-500'
      case 't5xxl': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  // Check FLUX component status
  const checkFluxComponentStatus = async () => {
    try {
      const response = await fetch(apiUrl('/check-flux-components'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path: modelPath })
      })
      
      if (response.ok) {
        const data = await response.json()
        setComponentStatus(data.status || {})
        return data.exists
      }
    } catch (error) {
      console.error('Error checking files:', error)
    }
    return false
  }

  // Check if FLUX components already exist
  const checkFluxComponentsExist = async () => {
    const exists = await checkFluxComponentStatus()
    return exists
  }

  // Fetch CivitAI model preview
  const fetchCivitaiPreview = async (url: string) => {
    if (!url || !url.includes('civitai.com')) return
    
    setIsLoadingPreview(true)
    try {
      const response = await fetch(apiUrl('/civitai/preview'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        // Include the current model path so the server stores metadata alongside the model
        body: JSON.stringify({ url, api_key: apiKey, path: modelPath })
      })
      
      if (response.ok) {
        const data = await response.json()
        const opts = (data.images || []).filter((u: string) => !!u)
        setPreviewOptions(opts)
        setSelectedPreviewUrl(data.image_url || opts[0] || null)
        setModelPreview({
          url: data.image_url,
          name: data.name,
          images: opts
        })
      }
    } catch (error) {
      console.error('Error fetching preview:', error)
    } finally {
      setIsLoadingPreview(false)
    }
  }

  // Handle CivitAI URL change with debounce
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (civitaiUrl) {
        fetchCivitaiPreview(civitaiUrl)
      } else {
        setModelPreview(null)
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [civitaiUrl, apiKey])

  const handleDownloadCivitai = () => {
    if (!civitaiUrl || !apiKey) return
    
    // Show confirmation modal with preview
    if (modelPreview) {
      setShowCivitaiConfirm(true)
    } else {
      // If no preview loaded yet, try to fetch it first
      fetchCivitaiPreview(civitaiUrl).then(() => {
        setShowCivitaiConfirm(true)
      })
    }
  }
  
  const startCivitaiDownload = async () => {
    try {
      // Persist the chosen preview URL into metadata so backend uses it post-download
      if (selectedPreviewUrl) {
        await fetch(apiUrl('/civitai/preview'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: civitaiUrl, api_key: apiKey, path: modelPath, chosen_image_url: selectedPreviewUrl })
        }).catch(() => {})
      }
      const response = await fetch(apiUrl('/download/civitai'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: civitaiUrl,
          api_key: apiKey,
          output_path: modelPath
        })
      })
      
      if (!response.ok) {
        throw new Error('Failed to start download')
      }
      
      const downloadInfo = await response.json()
      setDownloads(prev => [...prev, downloadInfo])
      
      // Use SSE for real-time updates instead of polling
      setActiveDownloadId(downloadInfo.id)
    } catch (error) {
      console.error('Download failed:', error)
      setIsDownloading(false)
    }
  }

  const confirmCivitaiDownload = async () => {
    setShowCivitaiConfirm(false)
    setIsDownloading(true)
    
    try {
      // First resolve filename and detect duplicates
      const resolveResp = await fetch(apiUrl('/civitai/resolve'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: civitaiUrl, api_key: apiKey, path: modelPath })
      })
      if (resolveResp.ok) {
        const info = await resolveResp.json()
        if (info.exists) {
          // Prompt user for action instead of downloading immediately
          setDuplicateInfo({ filename: info.filename })
          setShowDuplicateDialog(true)
          setIsDownloading(false)
          return
        }
      }
      await startCivitaiDownload()
    } catch (error) {
      console.error('Download failed:', error)
      setIsDownloading(false)
    }
  }

  // Duplicate handling actions
  const handleDuplicateOverwrite = async () => {
    setShowDuplicateDialog(false)
    setIsDownloading(true)
    await startCivitaiDownload()
  }

  const handleDuplicateAttachMeta = async () => {
    try {
      if (!duplicateInfo) return
      const resp = await fetch(apiUrl('/civitai/attach-preview'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: civitaiUrl, api_key: apiKey, path: modelPath, filename: duplicateInfo.filename, image_url: selectedPreviewUrl })
      })
      if (resp.ok) {
        // refresh installed models to show preview
        await loadInstalledModels()
      }
    } catch (e) {
      console.error('Failed to attach preview:', e)
    } finally {
      setShowDuplicateDialog(false)
    }
  }

  const handleDuplicateSkip = () => {
    setShowDuplicateDialog(false)
    setIsDownloading(false)
  }

  const handleDownloadFluxComponents = async () => {
    // Check if components already exist
    const exists = await checkFluxComponentsExist()
    
    if (exists) {
      setPendingFluxDownload(true)
      setShowOverwriteDialog(true)
      return
    }
    
    await startFluxDownload()
  }

  const handleCancelDownload = async (downloadId: string) => {
    try {
      const response = await fetch(apiUrl(`/downloads/${downloadId}/cancel`), {
        method: 'POST'
      })
      
      if (response.ok) {
        // Update local state to show cancelling
        setDownloads(prev => prev.map(d => 
          d.id === downloadId ? { ...d, status: 'cancelling' } : d
        ))
      }
    } catch (error) {
      console.error('Failed to cancel download:', error)
    }
  }
  
  const handleDeleteDownload = async (downloadId: string) => {
    try {
      const response = await fetch(apiUrl(`/downloads/${downloadId}`), {
        method: 'DELETE'
      })
      
      if (response.ok) {
        // Remove from local state
        setDownloads(prev => prev.filter(d => d.id !== downloadId))
      }
    } catch (error) {
      console.error('Failed to delete download:', error)
    }
  }
  
  const handleRetryDownload = async (download: any) => {
    // Simply start a new download with the same parameters
    if (download.url && download.url.includes('civitai')) {
      // Re-download from CivitAI
      const apiKey = localStorage.getItem('civitai_api_key') || ''
      if (!apiKey) {
        alert('Please enter your CivitAI API key first')
        return
      }
      
      try {
        const response = await fetch(apiUrl('/download/civitai'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: download.url,
            api_key: apiKey
          })
        })
        
        if (response.ok) {
          const newDownload = await response.json()
          setDownloads(prev => prev.map(d => 
            d.id === download.id ? newDownload : d
          ))
        }
      } catch (error) {
        console.error('Failed to retry download:', error)
      }
    }
  }

  // Choose Preview for an installed model
  const handleOpenChoosePreview = (model: InstalledModel) => {
    setPreviewTarget(model)
    setAttachUrl(model.source_url || '')
    setAttachImages([])
    setAttachSelected(null)
    setShowChoosePreview(true)
  }

  const fetchAttachPreviewOptions = async () => {
    if (!attachUrl) return
    setAttachLoading(true)
    try {
      const resp = await fetch(apiUrl('/civitai/preview'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: attachUrl, api_key: apiKey, path: modelPath })
      })
      if (resp.ok) {
        const data = await resp.json()
        const opts = (data.images || []).filter((u: string) => !!u)
        setAttachImages(opts)
        setAttachSelected(data.image_url || opts[0] || null)
      }
    } catch (e) {
      console.error('Failed to fetch preview options:', e)
    } finally {
      setAttachLoading(false)
    }
  }

  const confirmAttachPreview = async () => {
    if (!previewTarget || !attachSelected) return
    try {
      setAttachLoading(true)
      const resp = await fetch(apiUrl('/civitai/attach-preview'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: attachUrl, api_key: apiKey, path: modelPath, filename: previewTarget.name, image_url: attachSelected })
      })
      if (resp.ok) {
        await loadInstalledModels()
        setShowChoosePreview(false)
      }
    } catch (e) {
      console.error('Failed to attach preview:', e)
    } finally {
      setAttachLoading(false)
    }
  }
  
  const handleCleanupDownloads = async () => {
    try {
      const response = await fetch(apiUrl('/downloads/cleanup'), {
        method: 'POST'
      })
      
      if (response.ok) {
        const result = await response.json()
        // Remove cleaned downloads from state
        setDownloads(prev => prev.filter(d => 
          d.status !== 'error' && d.status !== 'cancelled'
        ))
      }
    } catch (error) {
      console.error('Failed to cleanup downloads:', error)
    }
  }
  
  const startFluxDownload = async () => {
    setIsDownloading(true)
    setShowOverwriteDialog(false)
    setPendingFluxDownload(false)
    
    try {
      const response = await fetch(apiUrl('/download/flux-components'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to start downloads')
      }
      
      const result = await response.json()
      
      // Fetch initial status for all downloads
      for (const downloadId of result.downloads) {
        const statusResponse = await fetch(apiUrl(`/downloads/${downloadId}`))
        if (statusResponse.ok) {
          const status = await statusResponse.json()
          setDownloads(prev => [...prev, status])
        }
      }
      
      // Poll for status updates
      const pollInterval = setInterval(async () => {
        let allComplete = true
        
        for (const downloadId of result.downloads) {
          const statusResponse = await fetch(apiUrl(`/downloads/${downloadId}`))
          if (statusResponse.ok) {
            const status = await statusResponse.json()
            setDownloads(prev => prev.map(d => 
              d.id === downloadId ? status : d
            ))
            
            if (status.status !== 'completed' && status.status !== 'error' && status.status !== 'cancelled') {
              allComplete = false
            }
          }
        }
        
        if (allComplete) {
          clearInterval(pollInterval)
          setIsDownloading(false)
        }
      }, 1000)
    } catch (error) {
      console.error('Downloads failed:', error)
      setIsDownloading(false)
    }
  }

  return (
    <TooltipProvider>
      <div className="grid gap-6">
        {/* Full Image Modal */}
        <Dialog open={showFullImage} onOpenChange={setShowFullImage} title={modelPreview?.name || "Model Image"}>
          <div className="flex items-center justify-center max-h-[80vh] overflow-hidden">
            {modelPreview && (
              <img
                src={modelPreview.url}
                alt={modelPreview.name}
                className="max-w-full max-h-full object-contain"
              />
            )}
          </div>
        </Dialog>

        {/* Duplicate Model Dialog */}
        <Dialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog} title="Model Already Exists">
          <div className="space-y-4">
            <p className="text-sm text-zinc-300">A model with this filename already exists in the target folder.</p>
            <div className="rounded-md bg-zinc-900 border border-zinc-800 p-3 text-xs font-mono">
              {duplicateInfo?.filename}
            </div>
            <div className="space-y-2 text-sm text-zinc-400">
              <p>Choose an action:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><span className="text-zinc-200">Overwrite</span>: Redownload and replace the file.</li>
                <li><span className="text-zinc-200">Skip, attach metadata</span>: Keep the file, fetch and save preview image + metadata.</li>
                <li><span className="text-zinc-200">Skip</span>: Do nothing.</li>
              </ul>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={handleDuplicateSkip}>Skip</Button>
              <Button variant="outline" onClick={handleDuplicateAttachMeta}>Skip, Attach Metadata</Button>
              <Button onClick={handleDuplicateOverwrite} className="bg-red-600 hover:bg-red-700">Overwrite</Button>
            </div>
          </div>
        </Dialog>

        {/* Rename Model Dialog */}
        <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog} title="Rename Model">
          <div className="space-y-4">
            <div>
              <Label htmlFor="new-name">New Name</Label>
              <Input
                id="new-name"
                value={newModelName}
                onChange={e => setNewModelName(e.target.value)}
                placeholder="Enter new model name"
                className="mt-2"
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="ghost"
                onClick={() => setShowRenameDialog(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={confirmRenameModel}
                disabled={!newModelName || newModelName === modelToRename?.name}
              >
                Rename
              </Button>
            </div>
          </div>
        </Dialog>

        {/* Delete Model Confirmation */}
        <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm} title="Delete Model">
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-red-500">
              <AlertTriangle className="w-5 h-5" />
              <p className="font-semibold">Are you sure you want to delete this model?</p>
            </div>
            <p className="text-sm text-zinc-400">
              This will permanently delete:
            </p>
            <div className="bg-zinc-900/50 rounded p-3">
              <p className="font-mono text-sm text-zinc-300">{modelToDelete?.name}</p>
              <p className="text-xs text-zinc-500 mt-1">Size: {modelToDelete?.size}</p>
            </div>
            <div className="bg-yellow-900/20 border border-yellow-800/50 rounded p-3">
              <p className="text-xs text-yellow-400 flex items-center gap-2">
                <Info className="w-3 h-3" />
                Associated metadata, preview images, and config files will also be deleted
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="ghost"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDeleteModel}
              >
                Delete Model & Cleanup
              </Button>
            </div>
          </div>
        </Dialog>

        {/* CivitAI Download Confirmation Modal */}
        <Dialog open={showCivitaiConfirm} onOpenChange={setShowCivitaiConfirm} title="Confirm Download">
          <div className="space-y-4">
            {modelPreview && (
              <>
                <img
                  src={(selectedPreviewUrl || modelPreview.url) as string}
                  alt={modelPreview.name}
                  className="w-full h-auto max-h-96 object-contain rounded-lg bg-black/50 cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setShowFullImage(true)}
                />
                {previewOptions.length > 1 && (
                  <div className="grid grid-cols-6 gap-2 max-h-36 overflow-y-auto">
                    {previewOptions.map((u) => (
                      <button
                        key={u}
                        onClick={() => setSelectedPreviewUrl(u)}
                        className={`h-16 w-full rounded overflow-hidden border ${selectedPreviewUrl === u ? 'border-blue-500' : 'border-zinc-800'}`}
                        title="Choose preview"
                      >
                        <img src={u} className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-semibold text-white">{modelPreview.name}</h3>
                  <p className="text-sm text-zinc-400 mt-1">
                    This model will be downloaded to:
                  </p>
                  <p className="text-xs text-zinc-500 font-mono mt-1">
                    {modelPath}
                  </p>
                </div>
              </>
            )}
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="ghost"
                onClick={() => setShowCivitaiConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={confirmCivitaiDownload}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Download className="w-4 h-4 mr-2" />
                Download Model
              </Button>
            </div>
          </div>
        </Dialog>

        {/* Overwrite Confirmation Dialog */}
        <Dialog open={showOverwriteDialog} onOpenChange={setShowOverwriteDialog} title="Files Already Exist">
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-yellow-500">
              <AlertTriangle className="w-5 h-5" />
              <p className="font-semibold">FLUX components already exist in this directory</p>
            </div>
            <p className="text-sm text-zinc-400">
              The following files were found:
            </p>
            <ul className="text-sm text-zinc-300 space-y-1">
              <li>• ae.sft (VAE)</li>
              <li>• clip_l.safetensors (CLIP L)</li>
              <li>• t5xxl_fp16.safetensors (T5XXL)</li>
            </ul>
            <p className="text-sm text-zinc-400">
              Do you want to overwrite these files with fresh downloads?
            </p>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="ghost"
                onClick={() => setShowOverwriteDialog(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => startFluxDownload()}
              >
                Overwrite Files
              </Button>
            </div>
          </div>
        </Dialog>

        {/* Choose Preview Dialog */}
        <Dialog open={showChoosePreview} onOpenChange={setShowChoosePreview} title="Choose Preview Image">
          <div className="space-y-4">
            <div>
              <p className="text-sm text-zinc-400 mb-2">Enter the model's CivitAI URL to load available preview images.</p>
              <div className="flex gap-2">
                <Input value={attachUrl} onChange={e=>setAttachUrl(e.target.value)} placeholder="https://civitai.com/models/..." />
                <Button onClick={fetchAttachPreviewOptions} disabled={!attachUrl || attachLoading}>{attachLoading ? 'Loading...' : 'Fetch'}</Button>
              </div>
            </div>
            {attachImages.length > 0 && (
              <div className="space-y-3">
                <div className="grid grid-cols-6 gap-2 max-h-48 overflow-y-auto">
                  {attachImages.map((u) => (
                    <button
                      key={u}
                      onClick={() => setAttachSelected(u)}
                      className={`h-16 w-full rounded overflow-hidden border ${attachSelected === u ? 'border-blue-500' : 'border-zinc-800'}`}
                      title="Choose preview"
                    >
                      <img src={u} className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
                {previewTarget && (
                  <div className="text-xs text-zinc-500">Attaching to: <span className="font-mono">{previewTarget.name}</span></div>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={()=>setShowChoosePreview(false)}>Cancel</Button>
                  <Button onClick={confirmAttachPreview} disabled={!attachSelected || attachLoading}>{attachLoading ? 'Saving...' : 'Save Preview'}</Button>
                </div>
              </div>
            )}
          </div>
        </Dialog>

        {/* Installed Models */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="w-5 h-5" />
                Installed Models
              </CardTitle>
              {installedModels.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="px-2 py-1 bg-zinc-800 rounded-md">
                    {installedModels.length} models
                  </span>
                  <span className="px-2 py-1 bg-zinc-800 rounded-md">
                    {totalModelSize}
                  </span>
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadInstalledModels}
              disabled={modelsLoading}
            >
              <RefreshCw className={`w-4 h-4 ${modelsLoading ? 'animate-spin' : ''}`} />
            </Button>
          </CardHeader>
          <CardContent>
            {modelsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                <span className="ml-2 text-sm text-zinc-400">Loading models...</span>
              </div>
            ) : installedModels.length === 0 ? (
              <div className="text-center py-8 text-zinc-500">
                <HardDrive className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No models found in this directory</p>
                <p className="text-xs mt-1 font-mono">{modelPath}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {installedModels.map((model, index) => (
                  <div
                    key={`${model.name}-${index}`}
                    className="flex items-center justify-between p-3 rounded-lg border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900/70 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="flex-shrink-0">
                        <div className={`w-2 h-2 rounded-full ${getModelTypeBadgeColor(model.type)}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate">{model.name}</p>
                          <span className={`px-1.5 py-0.5 text-xs rounded ${getModelTypeBadgeColor(model.type)} bg-opacity-20 text-white`}>
                            {model.type.toUpperCase()}
                          </span>
                        </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                      <span>{model.size}</span>
                      <span>•</span>
                      <span>Modified: {new Date(model.modified).toLocaleDateString()}</span>
                      {model.integrity && (
                        <>
                          <span>•</span>
                          <span className={model.integrity.ok ? 'text-green-400' : 'text-red-400'}>
                            {model.integrity.ok ? 'OK' : 'Corrupt'}
                          </span>
                          {model.integrity.sha256 && (
                            <span className="font-mono truncate max-w-[18ch]" title={model.integrity.sha256}>
                              {model.integrity.sha256.slice(0, 16)}…
                            </span>
                          )}
                        </>
                      )}
                    </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenChoosePreview(model)}
                            className="h-9 px-3 hover:bg-zinc-800"
                          >
                            <ImageIcon className="w-4 h-4 mr-1" />
                            <span className="text-xs">Choose Preview</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Pick thumbnail from CivitAI</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              try {
                                const resp = await fetch(apiUrl('/models/validate'), {
                                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ path: modelPath, filename: model.name })
                                })
                                if (resp.ok) {
                                  await loadInstalledModels()
                                }
                              } catch (e) { console.error('validate failed', e) }
                            }}
                            className="h-9 px-3 hover:bg-zinc-800"
                          >
                            <Check className="w-4 h-4 mr-1" />
                            <span className="text-xs">Validate</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Compute hash and check file integrity</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRenameModel(model)}
                            className="h-9 px-3 hover:bg-zinc-800"
                          >
                            <Edit2 className="w-4 h-4 mr-1" />
                            <span className="text-xs">Rename</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Rename model</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteModel(model)}
                            className="h-9 px-3 hover:bg-red-900/30 hover:text-red-400 hover:border-red-800"
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            <span className="text-xs">Delete</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Delete model and associated files</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* API Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="w-5 h-5" />
              API Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="api-key" className="flex items-center gap-2">
                CivitAI API Key
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>Get your API key from civitai.com/user/account under 'API Keys' section</p>
                  </TooltipContent>
                </Tooltip>
              </Label>
              <div className="flex gap-2 mt-2">
                <Input
                  id="api-key"
                  type="password"
                  value={apiKey}
                  onChange={e => {
                    setApiKey(e.target.value)
                    setApiKeySaved(false)
                  }}
                  placeholder="Enter your CivitAI API key"
                  className="flex-1"
                />
                <Button 
                  onClick={handleSaveApiKey}
                  disabled={!apiKey || apiKeySaved}
                  className="min-w-[100px]"
                >
                  {apiKeySaved ? (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Saved
                    </>
                  ) : (
                    'Save Key'
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => window.open('https://civitai.com/user/account', '_blank')}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Get API Key
                </Button>
              </div>
            </div>

            <div>
              <Label htmlFor="model-path" className="flex items-center gap-2">
                Model Storage Path
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>Directory where models will be saved</p>
                  </TooltipContent>
                </Tooltip>
              </Label>
              <div className="flex gap-2 mt-2">
                <Input
                  id="model-path"
                  value={modelPath}
                  onChange={e => setModelPath(e.target.value)}
                  placeholder="/path/to/models"
                  className="flex-1"
                />
                <Button variant="outline">
                  <FolderOpen className="w-4 h-4 mr-2" />
                  Browse
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Download Models */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* CivitAI Download */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="w-5 h-5" />
                Download from CivitAI
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="civitai-url">Model URL or ID</Label>
                <Input
                  id="civitai-url"
                  value={civitaiUrl}
                  onChange={e => setCivitaiUrl(e.target.value)}
                  placeholder="https://civitai.com/models/... or model ID"
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Paste a CivitAI model URL or enter a model ID
                </p>
              </div>
              
              {/* Model Preview */}
              {(isLoadingPreview || modelPreview) && (
                <div className="border border-zinc-700 rounded-lg p-3 bg-zinc-900/50">
                  {isLoadingPreview ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                      <span className="ml-2 text-sm text-zinc-400">Loading preview...</span>
                    </div>
                  ) : modelPreview ? (
                    <div className="space-y-3">
                      <img
                        src={modelPreview.url}
                        alt={modelPreview.name}
                        className="w-full h-auto max-h-48 object-contain rounded-lg bg-black/50 cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => setShowFullImage(true)}
                      />
                      <p className="text-sm font-medium text-zinc-200">{modelPreview.name}</p>
                    </div>
                  ) : null}
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button 
                onClick={handleDownloadCivitai}
                disabled={!civitaiUrl || !apiKey || isDownloading}
                className="w-full"
              >
                <Download className="w-4 h-4 mr-2" />
                Download Model
              </Button>
            </CardFooter>
          </Card>

          {/* FLUX Components */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="w-5 h-5" />
                FLUX Components
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Required FLUX components from HuggingFace
              </p>
              <div className="space-y-3">
                {/* VAE Component */}
                <div className="flex items-center justify-between p-2 rounded-lg border border-zinc-800 bg-zinc-900/50">
                  <div className="flex items-center gap-3">
                    {componentStatus.vae?.exists ? (
                      <Check className="w-5 h-5 text-green-500" />
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-zinc-600" />
                    )}
                    <div>
                      <span className="text-sm font-medium">VAE (ae.sft)</span>
                      <span className="text-xs text-zinc-500 ml-2">
                        {componentStatus.vae?.exists ? `✓ Downloaded (${componentStatus.vae.size})` : '~335MB'}
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* CLIP Component */}
                <div className="flex items-center justify-between p-2 rounded-lg border border-zinc-800 bg-zinc-900/50">
                  <div className="flex items-center gap-3">
                    {componentStatus.clip?.exists ? (
                      <Check className="w-5 h-5 text-green-500" />
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-zinc-600" />
                    )}
                    <div>
                      <span className="text-sm font-medium">CLIP L</span>
                      <span className="text-xs text-zinc-500 ml-2">
                        {componentStatus.clip?.exists ? `✓ Downloaded (${componentStatus.clip.size})` : '~246MB'}
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* T5XXL Component */}
                <div className="flex items-center justify-between p-2 rounded-lg border border-zinc-800 bg-zinc-900/50">
                  <div className="flex items-center gap-3">
                    {componentStatus.t5xxl?.exists ? (
                      <Check className="w-5 h-5 text-green-500" />
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-zinc-600" />
                    )}
                    <div>
                      <span className="text-sm font-medium">T5XXL FP16</span>
                      <span className="text-xs text-zinc-500 ml-2">
                        {componentStatus.t5xxl?.exists ? `✓ Downloaded (${componentStatus.t5xxl.size})` : '~9.5GB'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                onClick={handleDownloadFluxComponents}
                disabled={isDownloading}
                className="w-full"
              >
                <Download className="w-4 h-4 mr-2" />
                {Object.values(componentStatus).every(c => c?.exists) 
                  ? 'Re-download All Components' 
                  : Object.values(componentStatus).some(c => c?.exists)
                    ? 'Download Missing Components'
                    : 'Download All Components'}
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* Download Progress */}
        {downloads.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Download Progress</CardTitle>
              {downloads.some(d => d.status === 'error' || d.status === 'cancelled') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCleanupDownloads}
                  className="text-xs"
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  Clean Up Failed
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {downloads.map(download => (
                <div key={download.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{download.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {download.status === 'completed' ? (
                          <span className="text-green-500">✓ Complete</span>
                        ) : download.status === 'error' ? (
                          <span className="text-red-500">✗ Error</span>
                        ) : download.status === 'cancelled' ? (
                          <span className="text-yellow-500">⊘ Cancelled</span>
                        ) : download.status === 'cancelling' ? (
                          <span className="text-yellow-500">Cancelling...</span>
                        ) : (
                          `${download.progress}%`
                        )}
                      </span>
                      {(download.status === 'downloading' || download.status === 'pending') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCancelDownload(download.id)}
                          className="h-6 w-6 p-0"
                        >
                          <X className="w-4 h-4 text-white" />
                        </Button>
                      )}
                      {download.status === 'error' && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRetryDownload(download)}
                            className="h-7 px-2"
                            title="Retry download"
                          >
                            <RefreshCw className="w-3 h-3 mr-1" />
                            <span className="text-xs">Retry</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteDownload(download.id)}
                            className="h-6 w-6 p-0"
                            title="Delete download"
                          >
                            <Trash2 className="w-3 h-3 text-gray-500" />
                          </Button>
                        </>
                      )}
                      {(download.status === 'cancelled' || download.status === 'completed') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteDownload(download.id)}
                          className="h-6 w-6 p-0"
                          title="Delete download"
                        >
                          <Trash2 className="w-3 h-3 text-gray-500" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <Progress value={download.progress} className="h-2" />
                  {download.error && (
                    <p className="text-xs text-red-500">{download.error}</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Quick Start Guide */}
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">Quick Start Guide</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <span className="font-semibold">1.</span>
              <span>Get your CivitAI API key from your account settings and save it above</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-semibold">2.</span>
              <span>Download FLUX base components (VAE, CLIP, T5XXL) - required for training</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-semibold">3.</span>
              <span>Optionally download a FLUX checkpoint from CivitAI for your base model</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-semibold">4.</span>
              <span>Models will be saved to the specified path and available in the Training tab</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  )
}
