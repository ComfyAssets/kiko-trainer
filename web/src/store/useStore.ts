import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { ImageFile, TrainingConfig, TrainingStatus, HuggingFaceConfig, Model, Florence2Config, CaptionJob } from '../types';
import { generateCaptions } from '../services/captionApi';

interface AppStore {
  // Models
  models: Record<string, Model>;
  setModels: (models: Record<string, Model>) => void;
  
  // Training Configuration
  config: TrainingConfig;
  updateConfig: <K extends keyof TrainingConfig>(key: K, value: TrainingConfig[K]) => void;
  
  // Florence-2 Configuration
  florenceConfig: Florence2Config;
  updateFlorenceConfig: <K extends keyof Florence2Config>(key: K, value: Florence2Config[K]) => void;
  
  // Images and Captions
  images: ImageFile[];
  addImages: (files: File[]) => void;
  addImagesWithCaptions: (items: { file: File; caption: string }[]) => void;
  removeImage: (id: string) => void;
  updateCaption: (id: string, caption: string) => void;
  clearImages: () => void;
  
  // Training Status
  trainingStatus: TrainingStatus;
  setTrainingStatus: (status: Partial<TrainingStatus>) => void;
  addLog: (log: string) => void;
  
  // Hugging Face
  huggingFace: HuggingFaceConfig;
  setHuggingFaceToken: (token: string) => void;
  setHuggingFaceAuth: (isAuthenticated: boolean, username?: string) => void;

  // Caption job (persists across tabs/routes)
  captionJob: CaptionJob;
  startCaptionJob: (params: Record<string, any>) => Promise<void>;
  cancelCaptionJob: () => void;
  resumeCaptionJob: () => Promise<void>;
}

const defaultConfig: TrainingConfig = {
  name: 'MyLoRA',
  loraName: 'MyLoRA',  // Keep for backwards compatibility
  baseModel: 'black-forest-labs/FLUX.1-dev',
  concept: '',  // Keep for backwards compatibility
  trigger_word: '',
  seed: 42,
  workers: 2,
  learningRate: '8e-4',
  networkDim: 4,
  maxEpochs: 16,
  saveEvery: 4,
  timestepSampling: 'shift',
  guidanceScale: 1.0,
  vram: '20GB',
  samplePrompts: '',
  sampleEverySteps: 0,
  numRepeats: 10,
  trainBatchSize: 1,
  resolution: 512,
  // New defaults
  lrScheduler: 'cosine',
  lrWarmupSteps: 0.05, // 5% of total steps
  noiseOffset: 0.05,
  flipSymmetry: false,
  loraDropout: undefined,
  networkAlpha: undefined,
  rankDropout: undefined,
  moduleDropout: undefined,
  // Bucketing defaults (Flux LoRA)
  enableBucket: true,
  bucketResoSteps: 32,
  minBucketReso: 256,
  maxBucketReso: 1024,
  bucketNoUpscale: false,
  resizeInterpolation: undefined,
};

const defaultTrainingStatus: TrainingStatus = {
  isTraining: false,
  progress: 0,
  currentStep: 0,
  totalSteps: 0,
  logs: [],
  status: 'Ready',
};

const defaultFlorenceConfig: Florence2Config = {
  modelType: 'qwen-vl',
  model: 'Qwen/Qwen2.5-VL-7B-Instruct',
  captionStyle: '<DETAILED_CAPTION>',
  attentionMode: 'eager',
  maxTokens: 1024,
  numBeams: 3,
  temperature: 0.7,
  postProcessing: 'remove_prefix',
  batchSize: 1,
  topP: 0.9,
  repetitionPenalty: 1.0,
  useCache: false,
  doRescale: false,
  qwenPreset: 'brief',
  qwenMinPixels: 256 * 28 * 28,
  qwenMaxPixels: 1280 * 28 * 28,
};

export const useStore = create<AppStore>()(persist((set, get) => ({
  // Models
  models: {},
  setModels: (models) => set({ models }),
  
  // Training Configuration
  config: defaultConfig,
  updateConfig: (key, value) =>
    set((state) => ({
      config: { ...state.config, [key]: value },
    })),
  
  // Florence-2 Configuration
  florenceConfig: defaultFlorenceConfig,
  updateFlorenceConfig: (key, value) =>
    set((state) => ({
      florenceConfig: { ...state.florenceConfig, [key]: value },
    })),
  
  // Images and Captions
  images: [],
  addImages: (files) => {
    console.log('Zustand addImages: Adding', files.length, 'files');
    return set((state) => {
      console.log('Zustand addImages: Current state has', state.images.length, 'images');
      const newImages = [
        ...state.images,
        ...files.map((file) => ({
          id: Math.random().toString(36).substring(7),
          file,
          preview: URL.createObjectURL(file),
          caption: '',
        })),
      ];
      console.log('Zustand addImages: New state will have', newImages.length, 'images');
      return { images: newImages };
    });
  },
  addImagesWithCaptions: (items) =>
    set((state) => {
      const newImages = [
        ...state.images,
        ...items.map(({ file, caption }) => ({
          id: Math.random().toString(36).substring(7),
          file,
          preview: URL.createObjectURL(file),
          caption: caption || '',
        })),
      ];
      return { images: newImages };
    }),
  removeImage: (id) =>
    set((state) => {
      const img = state.images.find((i) => i.id === id)
      if (img) {
        try { URL.revokeObjectURL(img.preview) } catch {}
      }
      return {
        images: state.images.filter((img) => img.id !== id),
      }
    }),
  updateCaption: (id, caption) =>
    set((state) => ({
      images: state.images.map((img) =>
        img.id === id ? { ...img, caption } : img
      ),
    })),
  clearImages: () =>
    set((state) => {
      // Revoke all object URLs to avoid memory leaks
      state.images.forEach((img) => {
        try { URL.revokeObjectURL(img.preview) } catch {}
      })
      return { images: [] }
    }),
  
  // Training Status
  trainingStatus: defaultTrainingStatus,
  setTrainingStatus: (status) =>
    set((state) => ({
      trainingStatus: { ...state.trainingStatus, ...status },
    })),
  addLog: (log) =>
    set((state) => ({
      trainingStatus: {
        ...state.trainingStatus,
        logs: [...state.trainingStatus.logs, log],
      },
    })),
  
  // Hugging Face
  huggingFace: {
    token: '',
    isAuthenticated: false,
  },
  setHuggingFaceToken: (token) =>
    set((state) => ({
      huggingFace: { ...state.huggingFace, token },
    })),
  setHuggingFaceAuth: (isAuthenticated, username) =>
    set((state) => ({
      huggingFace: { ...state.huggingFace, isAuthenticated, username },
    })),

  // Caption job state
  captionJob: { isRunning: false, current: 0, total: 0, queue: [] },
  cancelCaptionJob: () => set({ captionJob: { isRunning: false, cancelRequested: false, current: 0, total: 0, queue: [] } }),
  startCaptionJob: async (params) => {
    const state = get()
    if (state.captionJob.isRunning) return
    const queue = state.images.map(img => img.id)
    set({ captionJob: { isRunning: true, cancelRequested: false, current: 0, total: queue.length, queue, startedAt: Date.now(), params } })
    await get().resumeCaptionJob()
  },
  resumeCaptionJob: async () => {
    const run = async () => {
      while (true) {
        const st = get().captionJob
        if (!st.isRunning || st.cancelRequested) break
        if (st.current >= st.total) break
        const idx = st.current
        const imgId = st.queue[idx]
        // find image
        const img = get().images.find(i => i.id === imgId)
        if (img) {
          try {
            const params = get().captionJob.params || {}
            const modelType = params.modelType || (params.model?.includes('Florence') ? 'florence2' : 'qwen-vl')
            const captions = await generateCaptions([img.file], {
              modelType,
              model: params.model,
              style: params.captionStyle || 'brief',
              attention: params.attention || 'eager',
              maxLength: params.maxLen || 1024,
              beam: params.beam || 3,
              temperature: params.temp || 0.7,
              removePrefix: params.removePrefix ?? true,
              batchSize: params.batchSize || 1,
              triggerWord: params.trigger || '',
              topP: params.topP || 0.9,
              qwenPreset: params.qwenPreset,
              minPixels: params.qwenMinPixels,
              maxPixels: params.qwenMaxPixels,
            })
            const newCaption = captions[0] || `${params.trigger || ''}, image`
            set((state) => ({ images: state.images.map(it => it.id === imgId ? { ...it, caption: newCaption } : it) }))
          } catch (e) {
            // keep existing caption on error
          }
        }
        // advance
        set((state) => ({ captionJob: { ...state.captionJob, current: state.captionJob.current + 1 } }))
        await new Promise(r => setTimeout(r, 0))
      }
      // finalize: if completed without cancel, clear counters so UI chip disappears
      const fin = get().captionJob
      if (!fin.cancelRequested && fin.current >= fin.total) {
        set({ captionJob: { isRunning: false, cancelRequested: false, current: 0, total: 0, queue: [] } })
      } else {
        set((state) => ({ captionJob: { ...state.captionJob, isRunning: false, cancelRequested: false } }))
      }
    }
    if (!get().captionJob.isRunning) return
    run()
  },
}), {
  name: 'kiko-store',
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({ config: state.config, captionJob: state.captionJob }),
}))
