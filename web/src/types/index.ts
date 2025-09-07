export interface Model {
  repo: string;
  base: string;
  license?: string;
  license_name?: string;
  license_link?: string;
  file: string;
}

export interface TrainingConfig {
  name: string;  // LoRA name
  loraName: string;  // Keep for backwards compatibility
  baseModel: string;
  concept: string;  // Keep for backwards compatibility
  trigger_word: string;  // New field for trigger word
  seed: number;
  workers: number;
  learningRate: string;
  networkDim: number;
  maxEpochs: number;
  saveEvery: number;
  timestepSampling: 'shift' | 'uniform' | 'sigmoid';
  guidanceScale: number;
  vram: '12GB' | '16GB' | '20GB' | '24GB';
  samplePrompts: string;
  sampleEverySteps: number;
  numRepeats: number;
  trainBatchSize: number;
  resolution: number;
  // New advanced options
  lrScheduler?: string;
  lrWarmupSteps?: number; // int steps or <1.0 ratio
  noiseOffset?: number;   // e.g., 0.05 for Flux
  flipSymmetry?: boolean; // enable horizontal flip aug if character is symmetrical
  loraDropout?: number;   // network_dropout rate, e.g., 0.1
  networkAlpha?: number;  // LoRA alpha scaling
  rankDropout?: number;   // Flux LoRA rank dropout
  moduleDropout?: number; // Flux LoRA module dropout
  // Bucketing
  enableBucket?: boolean;
  bucketResoSteps?: number;
  minBucketReso?: number;
  maxBucketReso?: number;
  bucketNoUpscale?: boolean;
  resizeInterpolation?: 'lanczos' | 'nearest' | 'bilinear' | 'linear' | 'bicubic' | 'cubic' | 'area' | 'box';
}

export interface ImageFile {
  id: string;
  file: File;
  preview: string;
  caption: string;
}

export interface TrainingStatus {
  isTraining: boolean;
  progress: number;
  currentStep: number;
  totalSteps: number;
  logs: string[];
  status: string;
}

export interface CaptionJob {
  isRunning: boolean;
  cancelRequested?: boolean;
  current: number;
  total: number;
  queue: string[]; // image ids in order
  startedAt?: number;
  params?: Record<string, any>;
}

export interface HuggingFaceConfig {
  token: string;
  isAuthenticated: boolean;
  username?: string;
}

export type CaptionModelType = 'florence2' | 'qwen-vl';

export interface Florence2Config {
  modelType: CaptionModelType;
  model: string;
  captionStyle: string;
  attentionMode: string;
  maxTokens: number;
  numBeams: number;
  temperature: number;
  postProcessing: string;
  batchSize: number;
  topP: number;
  repetitionPenalty: number;
  useCache: boolean;
  doRescale: boolean;
  // Qwen VL specific options
  qwenPreset?: 'brief' | 'detailed' | 'ultra';
  qwenMinPixels?: number;
  qwenMaxPixels?: number;
}
