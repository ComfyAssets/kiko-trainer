// Frontend-resolved paths used for script previews and config exports.
// These are NOT validated on the client; the backend resolves real paths.

export const PATHS_CONFIG = {
  modelsDir: import.meta.env.VITE_MODELS_DIR || 'models',
  outputsDir: import.meta.env.VITE_OUTPUTS_DIR || 'outputs',
  get unetFluxDev() {
    return `${this.modelsDir}/unet/flux1-dev.sft`
  },
  get unetFluxSchnell() {
    return `${this.modelsDir}/unet/flux1-schnell.sft`
  },
  get clipL() {
    return `${this.modelsDir}/clip/clip_l.safetensors`
  },
  get t5xxl() {
    return `${this.modelsDir}/clip/t5xxl_fp16.safetensors`
  },
  get ae() {
    return `${this.modelsDir}/vae/ae.sft`
  },
}

const MODEL_MAP: Record<string, () => string> = {
  'FLUX.1-dev': () => PATHS_CONFIG.unetFluxDev,
  'black-forest-labs/FLUX.1-dev': () => PATHS_CONFIG.unetFluxDev,
  'FLUX.1-schnell': () => PATHS_CONFIG.unetFluxSchnell,
  'black-forest-labs/FLUX.1-schnell': () => PATHS_CONFIG.unetFluxSchnell,
}

export function resolveUnetPath(baseModel: string, override?: string): string {
  if (override && override.trim()) return override
  const fn = MODEL_MAP[baseModel]
  return fn ? fn() : PATHS_CONFIG.unetFluxDev
}

