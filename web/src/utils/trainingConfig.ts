interface TrainingConfig {
  baseModel: string
  pretrainedPath?: string
  loraName: string
  resolution: number
  seed: number
  workers: number
  learningRate: string
  networkDim: number
  maxTrainEpochs: number
  saveEveryNEpochs: number
  timestepSampling: string
  guidanceScale: number
  vram: string
  samplePrompts: string
  sampleEveryNSteps: number
  classTokens: string
  numRepeats: number
  trainBatchSize: number
  advancedFlags?: string[]
  datasetFolder: string
  // Bucketing
  enableBucket?: boolean
  bucketResoSteps?: number
  minBucketReso?: number
  maxBucketReso?: number
  bucketNoUpscale?: boolean
  resizeInterpolation?: string | undefined
}

export function generateTrainingScript(config: TrainingConfig): string {
  const lineBreak = '\\'
  const outputDir = `/home/vito/ai-apps/kiko-trainer/outputs/${config.loraName}`
  const samplePromptsPath = `${outputDir}/sample_prompts.txt`
  
  // Model paths - adjust these based on your setup
  const modelPaths = {
    'FLUX.1-dev': '/home/vito/ai-apps/kiko-trainer/models/unet/flux1-dev.sft',
    'FLUX.1-schnell': '/home/vito/ai-apps/kiko-trainer/models/unet/flux1-schnell.sft'
  }
  
  const modelPath = config.pretrainedPath || modelPaths[config.baseModel as keyof typeof modelPaths] || modelPaths['FLUX.1-dev']
  const clipPath = '/home/vito/ai-apps/kiko-trainer/models/clip/clip_l.safetensors'
  const t5Path = '/home/vito/ai-apps/kiko-trainer/models/clip/t5xxl_fp16.safetensors'
  const aePath = '/home/vito/ai-apps/kiko-trainer/models/vae/ae.sft'

  // Sample generation
  let sampleConfig = ''
  if (config.samplePrompts && config.sampleEveryNSteps > 0) {
    sampleConfig = `--sample_prompts="${samplePromptsPath}" --sample_every_n_steps="${config.sampleEveryNSteps}" ${lineBreak}\n  `
  }

  // Optimizer configuration based on VRAM
  let optimizerConfig = ''
  if (config.vram === '12GB') {
    optimizerConfig = `--optimizer_type adafactor ${lineBreak}
  --optimizer_args "relative_step=False" "scale_parameter=False" "warmup_init=False" ${lineBreak}
  --split_mode ${lineBreak}
  --network_args "train_blocks=single" ${lineBreak}
  --lr_scheduler constant_with_warmup ${lineBreak}
  --max_grad_norm 0.0 ${lineBreak}`
  } else if (config.vram === '16GB') {
    optimizerConfig = `--optimizer_type adafactor ${lineBreak}
  --optimizer_args "relative_step=False" "scale_parameter=False" "warmup_init=False" ${lineBreak}
  --lr_scheduler constant_with_warmup ${lineBreak}
  --max_grad_norm 0.0 ${lineBreak}`
  } else {
    // 20GB+ - use adamw8bit
    optimizerConfig = `--optimizer_type adamw8bit ${lineBreak}`
  }

  const script = `accelerate launch ${lineBreak}
  --mixed_precision bf16 ${lineBreak}
  --num_cpu_threads_per_process 1 ${lineBreak}
  sd-scripts/flux_train_network.py ${lineBreak}
  --pretrained_model_name_or_path "${modelPath}" ${lineBreak}
  --clip_l "${clipPath}" ${lineBreak}
  --t5xxl "${t5Path}" ${lineBreak}
  --ae "${aePath}" ${lineBreak}
  --cache_latents_to_disk ${lineBreak}
  --save_model_as safetensors ${lineBreak}
  --sdpa --persistent_data_loader_workers ${lineBreak}
  --max_data_loader_n_workers ${config.workers} ${lineBreak}
  --seed ${config.seed} ${lineBreak}
  --gradient_checkpointing ${lineBreak}
  --mixed_precision bf16 ${lineBreak}
  --save_precision bf16 ${lineBreak}
  --network_module networks.lora_flux ${lineBreak}
  --network_dim ${config.networkDim} ${lineBreak}
  ${optimizerConfig}${sampleConfig}--learning_rate ${config.learningRate} ${lineBreak}
  --cache_text_encoder_outputs ${lineBreak}
  --cache_text_encoder_outputs_to_disk ${lineBreak}
  --fp8_base ${lineBreak}
  --highvram ${lineBreak}
  --max_train_epochs ${config.maxTrainEpochs} ${lineBreak}
  --save_every_n_epochs ${config.saveEveryNEpochs} ${lineBreak}
  --dataset_config "${outputDir}/dataset.toml" ${lineBreak}
  --output_dir "${outputDir}" ${lineBreak}
  --output_name ${config.loraName} ${lineBreak}
  --timestep_sampling ${config.timestepSampling.toLowerCase()} ${lineBreak}
  --discrete_flow_shift 3.1582 ${lineBreak}
  --model_prediction_type raw ${lineBreak}
  --guidance_scale ${config.guidanceScale} ${lineBreak}
  --loss_type l2`

  // Add advanced flags if provided
  if (config.advancedFlags && config.advancedFlags.length > 0) {
    return script + ' ' + lineBreak + '\n  ' + config.advancedFlags.join(' ' + lineBreak + '\n  ')
  }

  return script
}

export function generateDatasetToml(config: TrainingConfig): string {
  const lines: string[] = []
  lines.push(`[general]`)
  lines.push('shuffle_caption = false')
  lines.push("caption_extension = '.txt'")
  lines.push('keep_tokens = 1')

  lines.push('')
  lines.push('[[datasets]]')
  lines.push(`resolution = ${config.resolution}`)
  lines.push(`batch_size = ${config.trainBatchSize}`)
  lines.push(`keep_tokens = 1`)
  if (config.enableBucket) {
    lines.push(`enable_bucket = true`)
    if (config.minBucketReso != null) lines.push(`min_bucket_reso = ${config.minBucketReso}`)
    if (config.maxBucketReso != null) lines.push(`max_bucket_reso = ${config.maxBucketReso}`)
    if (config.bucketResoSteps != null) lines.push(`bucket_reso_steps = ${config.bucketResoSteps}`)
    if (config.bucketNoUpscale) lines.push(`bucket_no_upscale = true`)
  }
  if (config.resizeInterpolation) {
    lines.push(`resize_interpolation = '${config.resizeInterpolation}'`)
  }
  lines.push('')
  lines.push('[[datasets.subsets]]')
  lines.push(`image_dir = '${config.datasetFolder}'`)
  lines.push(`class_tokens = '${config.classTokens}'`)
  lines.push(`num_repeats = ${config.numRepeats}`)
  return lines.join('\n') + '\n'
}

export function generateSamplePrompts(prompts: string): string {
  return prompts.split('\n').filter(line => line.trim()).join('\n')
}
