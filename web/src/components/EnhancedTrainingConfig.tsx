import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store/useStore';
import { InfoTooltip } from './InfoTooltip';
import { Switch } from './ui/switch';

// Utility: compact number formatting
const nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 });

const BATCH_OPTIONS = [1, 2, 4, 6, 8, 12, 16, 24];
const RES_OPTIONS = [
  { value: 512, label: "512 × 512" },
  { value: 768, label: "768 × 768" },
  { value: 896, label: "896 × 896" },
  { value: 1024, label: "1024 × 1024" },
];

const RANK_OPTIONS = [16, 32, 48, 64, 80, 96, 128, 256];

// Field Label with Tooltip helper
function FieldLabel({ label, tooltip }: { label: string; tooltip: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
      <InfoTooltip content={tooltip} />
    </div>
  );
}

export const EnhancedTrainingConfig: React.FC = () => {
  const { config, updateConfig, models } = useStore();
  const modelOptions = Object.keys(models);
  const [useCustomLearningRate, setUseCustomLearningRate] = useState(false);

  const learningRateOptions = [
    { value: '5e-6', label: '5e-6 (0.000005) – Very Low, SDXL style sets' },
    { value: '1e-5', label: '1e-5 (0.00001) – Low, SDXL standard' },
    { value: '2e-5', label: '2e-5 (0.00002) – Conservative tuning' },
    { value: '5e-5', label: '5e-5 (0.00005) – Text Encoder baseline' },
    { value: '1e-4', label: '1e-4 (0.0001) – Common LoRA/UNet baseline' },
    { value: '2e-4', label: '2e-4 (0.0002) – Faster training, risk of overfit' },
    { value: '3e-4', label: '3e-4 (0.0003) – Upper-medium, balanced speed' },
    { value: '4e-4', label: '4e-4 (0.0004) – ComfyUI Flux default' },
    { value: '5e-4', label: '5e-4 (0.0005) – Aggressive tuning' },
    { value: '6e-4', label: '6e-4 (0.0006) – High, can destabilize long runs' },
    { value: '7e-4', label: '7e-4 (0.0007) – Experimental, risky' },
    { value: '8e-4', label: '8e-4 (0.0008) – Very High, short runs only' },
  ];

  const estCheckpoints = useMemo(() => {
    if (!config.maxEpochs || !config.saveEvery) return 0;
    return Math.floor(Number(config.maxEpochs) / Number(config.saveEvery));
  }, [config.maxEpochs, config.saveEvery]);

  const vramHint = useMemo(() => {
    const vramNumber = parseInt(config.vram.replace('GB', ''));
    if (vramNumber <= 6) return "Use batch 1–2, 512–768 res, enable gradient checkpointing.";
    if (vramNumber <= 8) return "Batch 2–4 at 768–896; careful with 1024.";
    if (vramNumber <= 12) return "Batch 4–6 at 896–1024 on most setups.";
    if (vramNumber <= 16) return "Batch 6–8 at 1024 usually fine.";
    if (vramNumber <= 24) return "Batch 8–12 at 1024; room for extras (TE finetune).";
    return "Plenty of headroom: larger batches or higher ranks possible.";
  }, [config.vram]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-6"
    >
      <div>
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Training Parameters</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Base Model */}
          <div className="space-y-2">
            <FieldLabel
              label="Base Model"
              tooltip={
                <div>
                  <p className="font-semibold">Choose the model to train against</p>
                  <p className="mt-1 text-gray-300">The pre-trained checkpoint your LoRA will build on (e.g., SDXL, Flux). Match this to your dataset and target use.</p>
                </div>
              }
            />
            <select
              value={config.baseModel}
              onChange={(e) => updateConfig('baseModel', e.target.value)}
              className="input-field"
            >
              {modelOptions.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>

          {/* VRAM Configuration */}
          <div className="space-y-2">
            <FieldLabel
              label="VRAM Configuration"
              tooltip={
                <div>
                  <p className="font-semibold">Choose your video card RAM</p>
                  <p className="mt-1 text-gray-300">Optimizes defaults for your GPU. Lower VRAM → smaller batch/resolution and memory savers.</p>
                  <p className="mt-1 text-gray-300"><strong>Tip:</strong> {vramHint}</p>
                </div>
              }
            />
            <select
              value={config.vram}
              onChange={(e) => updateConfig('vram', e.target.value as any)}
              className="input-field"
            >
              <option value="12GB">12GB</option>
              <option value="16GB">16GB</option>
              <option value="20GB">20GB</option>
              <option value="24GB">24GB</option>
            </select>
          </div>

          {/* Learning Rate */}
          <div className="space-y-2">
            <FieldLabel
              label="Learning Rate"
              tooltip={
                <div>
                  <p className="font-semibold">Controls how fast the model learns</p>
                  <ul className="mt-1 list-disc pl-4 text-gray-300">
                    <li>Lower = stable (e.g., <code className="bg-gray-800 px-1 rounded">1e-5</code> for SDXL fine-tune).</li>
                    <li>Common LoRA/UNet: <code className="bg-gray-800 px-1 rounded">1e-4</code>.</li>
                    <li>Flux experiments up to <code className="bg-gray-800 px-1 rounded">8e-4</code> (short runs).</li>
                  </ul>
                </div>
              }
            />
            {!useCustomLearningRate ? (
              <select
                value={config.learningRate}
                onChange={(e) => {
                  if (e.target.value === 'custom') {
                    setUseCustomLearningRate(true);
                  } else {
                    updateConfig('learningRate', e.target.value);
                  }
                }}
                className="input-field"
              >
                {learningRateOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
                <option value="custom">Custom (Enter your own)</option>
              </select>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={config.learningRate}
                  onChange={(e) => updateConfig('learningRate', e.target.value)}
                  className="input-field flex-1"
                  placeholder="e.g., 1.5e-4"
                />
                <button
                  onClick={() => {
                    setUseCustomLearningRate(false);
                    const isInOptions = learningRateOptions.some(opt => opt.value === config.learningRate);
                    if (!isInOptions) {
                      updateConfig('learningRate', '4e-4');
                    }
                  }}
                  className="px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  Back
                </button>
              </div>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Effective LR: <span className="font-mono">{config.learningRate}</span>
            </p>
          </div>

          {/* Rank & Alpha (paired) */}
          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <FieldLabel
                label="Network Dimension (Rank)"
                tooltip={
                  <div>
                    <p className="font-semibold">Defines LoRA capacity</p>
                    <p className="mt-1 text-gray-300">Higher rank captures more detail but uses more VRAM and may overfit. Typical range: 32–128.</p>
                  </div>
                }
              />
              <select
                value={config.networkDim}
                onChange={(e) => updateConfig('networkDim', parseInt(e.target.value))}
                className="input-field"
              >
                {RANK_OPTIONS.map((rank) => (
                  <option key={rank} value={rank}>
                    {rank}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <FieldLabel
                label="Network Alpha"
                tooltip={<div>LoRA alpha scaling. Common choices: same as rank or half the rank. Default is 1 if unset.</div>}
              />
              <input
                type="number"
                value={config.networkAlpha ?? 0}
                onChange={(e) => updateConfig('networkAlpha', Number(e.target.value))}
                className="input-field"
                min={0}
                step={0.1}
              />
            </div>
          </div>

          {/* Max Epochs */}
          <div className="space-y-2">
            <FieldLabel
              label="Max Epochs"
              tooltip={
                <div>
                  <p className="font-semibold">How many full passes over your dataset</p>
                  <p className="mt-1 text-gray-300">More epochs = more learning; too many can overfit. Tune with validation previews.</p>
                </div>
              }
            />
            <input
              type="number"
              value={config.maxEpochs}
              onChange={(e) => updateConfig('maxEpochs', parseInt(e.target.value))}
              className="input-field"
              min="1"
              max="100"
            />
          </div>

          {/* Save Every N Epochs */}
          <div className="space-y-2">
            <FieldLabel
              label="Save Every N Epochs"
              tooltip={
                <div>
                  <p className="font-semibold">This is how many LoRAs you will get</p>
                  <p className="mt-1 text-gray-300">Controls checkpoint frequency. Example: Max Epochs 10, Save Every 2 → 5 checkpoints.</p>
                </div>
              }
            />
            <input
              type="number"
              value={config.saveEvery}
              onChange={(e) => updateConfig('saveEvery', parseInt(e.target.value))}
              className="input-field"
              min="1"
              max="50"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Estimated checkpoints: <span className="font-semibold">{estCheckpoints}</span>
            </p>
          </div>

          {/* Train Batch Size */}
          <div className="space-y-2">
            <FieldLabel
              label="Train Batch Size"
              tooltip={
                <div>
                  <p className="font-semibold">Number of images per step</p>
                  <p className="mt-1 text-gray-300">Larger batch sizes train faster but need more VRAM.</p>
                  <p className="mt-1 text-gray-300"><strong>Tip:</strong> {vramHint}</p>
                </div>
              }
            />
            <select
              value={config.trainBatchSize}
              onChange={(e) => updateConfig('trainBatchSize', parseInt(e.target.value))}
              className="input-field"
            >
              {BATCH_OPTIONS.map((batch) => (
                <option key={batch} value={batch}>
                  {batch}
                </option>
              ))}
            </select>
          </div>

          {/* Resolution */}
          <div className="space-y-2">
            <FieldLabel
              label="Resolution"
              tooltip={
                <div>
                  <p className="font-semibold">Choose resolution for training images</p>
                  <p className="mt-1 text-gray-300">Higher = more detail, more VRAM. Ensure your dataset is prepared/cropped for the target size.</p>
                </div>
              }
            />
            <select
              value={config.resolution}
              onChange={(e) => updateConfig('resolution', parseInt(e.target.value))}
              className="input-field"
            >
              {RES_OPTIONS.map((res) => (
                <option key={res.value} value={res.value}>
                  {res.label}
                </option>
              ))}
            </select>
          </div>

          {/* Timestep Sampling */}
          <div className="space-y-2">
            <FieldLabel
              label="Timestep Sampling"
              tooltip={
                <div>
                  <p className="font-semibold">Controls noise sampling strategy</p>
                  <ul className="mt-1 list-disc pl-4 text-gray-300">
                    <li><span className="font-semibold">Uniform</span>: balanced across all noise levels.</li>
                    <li><span className="font-semibold">Shift</span>: favors low noise (later steps) → sharper details.</li>
                    <li><span className="font-semibold">Sigmoid</span>: favors mid-range → stable generalization.</li>
                  </ul>
                </div>
              }
            />
            <select
              value={config.timestepSampling}
              onChange={(e) => updateConfig('timestepSampling', e.target.value as any)}
              className="input-field"
            >
              <option value="uniform">Uniform – Balanced</option>
              <option value="shift">Shift – Detail-focused (default)</option>
              <option value="sigmoid">Sigmoid – Stable/generalized</option>
            </select>
          </div>

          {/* Guidance Scale */}
          <div className="space-y-2 md:col-span-2">
            <FieldLabel
              label="Guidance Scale"
              tooltip={
                <div>
                  <p className="font-semibold">How strongly prompts steer generation</p>
                  <p className="mt-1 text-gray-300">Lower = more variety; higher = adheres to prompt but can reduce creativity. Commonly 5–8.</p>
                </div>
              }
            />
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <input
                  type="range"
                  min="1"
                  max="15"
                  step="0.1"
                  value={config.guidanceScale}
                  onChange={(e) => updateConfig('guidanceScale', parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                />
              </div>
              <input
                type="number"
                min="1"
                max="15"
                step="0.1"
                value={config.guidanceScale}
                onChange={(e) => updateConfig('guidanceScale', parseFloat(e.target.value || "0"))}
                className="w-24 input-field"
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Current: <span className="font-mono">{nf.format(config.guidanceScale)}</span>
            </p>
          </div>

          {/* LR Scheduler */}
          <div className="space-y-2">
            <FieldLabel
              label="LR Scheduler"
              tooltip={<div>Select how learning rate evolves over time. Cosine with warmup refines late training; constant keeps LR fixed.</div>}
            />
            <select
              value={config.lrScheduler || 'cosine'}
              onChange={(e) => updateConfig('lrScheduler', e.target.value)}
              className="input-field"
            >
              {[
                'constant',
                'constant_with_warmup',
                'linear',
                'cosine',
                'cosine_with_restarts',
                'polynomial',
                'inverse_sqrt',
                'cosine_with_min_lr',
                'warmup_stable_decay',
                'piecewise_constant',
                'adafactor',
              ].map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          {/* Warmup Steps or Ratio */}
          <div className="space-y-2">
            <FieldLabel
              label="Warmup (steps or ratio < 1)"
              tooltip={<div>Provide integer steps or a ratio like 0.05 for 5% of total steps.</div>}
            />
            <input
              type="number"
              value={config.lrWarmupSteps ?? 0}
              onChange={(e) => updateConfig('lrWarmupSteps', Number(e.target.value))}
              className="input-field"
              step={0.01}
              min={0}
            />
          </div>

          {/* Noise Offset */}
          <div className="space-y-2">
            <FieldLabel
              label="Noise Offset"
              tooltip={<div>Enable slight noise offset (e.g., 0.05) to help Flux LoRAs generalize and preserve detail.</div>}
            />
            <input
              type="number"
              value={config.noiseOffset ?? 0}
              onChange={(e) => updateConfig('noiseOffset', Number(e.target.value))}
              className="input-field"
              step={0.01}
              min={0}
            />
          </div>

          {/* Flip Augmentation */}
          <div className="space-y-2">
            <FieldLabel
              label="Horizontal Flip"
              tooltip={<div>Use for symmetrical characters to augment with mirrored poses.</div>}
            />
            <div className="flex items-center justify-between">
              <label id="flipSymmetry2Label" htmlFor="flipSymmetry2" className="text-sm text-gray-700 dark:text-gray-300">
                Horizontal flip
              </label>
              <Switch
                id="flipSymmetry2"
                ariaLabelledby="flipSymmetry2Label"
                checked={!!config.flipSymmetry}
                onCheckedChange={(v) => updateConfig('flipSymmetry', v)}
              />
            </div>
          </div>

          {/* LoRA Dropout */}
          <div className="space-y-2">
            <FieldLabel
              label="LoRA Neuron Dropout"
              tooltip={<div>Neuron-level dropout inside LoRA modules (<code>--network_dropout</code>). For Flux LoRA, consider Rank/Module dropouts below.</div>}
            />
            <input
              type="number"
              value={config.loraDropout ?? 0}
              onChange={(e) => updateConfig('loraDropout', Number(e.target.value))}
              className="input-field"
              step={0.01}
              min={0}
              max={1}
            />
          </div>

          {/* Flux LoRA Rank Dropout */}
          <div className="space-y-2">
            <FieldLabel
              label="Rank Dropout (Flux LoRA)"
              tooltip={<div>Randomly drops LoRA ranks each step (<code>--network_args "rank_dropout=..."</code>). Try 0.1.</div>}
            />
            <input
              type="number"
              value={config.rankDropout ?? 0}
              onChange={(e) => updateConfig('rankDropout', Number(e.target.value))}
              className="input-field"
              step={0.01}
              min={0}
              max={1}
            />
          </div>

          {/* Flux LoRA Module Dropout */}
          <div className="space-y-2">
            <FieldLabel
              label="Module Dropout (Flux LoRA)"
              tooltip={<div>Randomly disables entire LoRA modules (<code>--network_args "module_dropout=..."</code>). Try 0.1.</div>}
            />
            <input
              type="number"
              value={config.moduleDropout ?? 0}
              onChange={(e) => updateConfig('moduleDropout', Number(e.target.value))}
              className="input-field"
              step={0.01}
              min={0}
              max={1}
            />
          </div>
        </div>

        {/* Sample Generation */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mt-8 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
        >
          <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-3">Sample Generation (Optional)</h4>
          
          <div className="space-y-4">
            <div>
              <FieldLabel
                label="Sample Prompts (one per line)"
                tooltip={
                  <div>
                    <p className="font-semibold">Test prompts for sample generation</p>
                    <p className="mt-1 text-gray-300">These will be used to generate preview images during training. Use [trigger] as a placeholder for your trigger word.</p>
                  </div>
                }
              />
              <textarea
                value={config.samplePrompts}
                onChange={(e) => updateConfig('samplePrompts', e.target.value)}
                className="input-field mt-1"
                rows={3}
                placeholder="[trigger] riding a bike&#10;[trigger] as a superhero&#10;[trigger] in space"
              />
            </div>

            <div>
              <FieldLabel
                label="Generate Samples Every N Steps"
                tooltip={
                  <div>
                    <p className="font-semibold">Sample generation frequency</p>
                    <p className="mt-1 text-gray-300">How often to generate preview images during training. Set to 0 to disable. Higher values = less frequent samples.</p>
                  </div>
                }
              />
              <input
                type="number"
                value={config.sampleEverySteps}
                onChange={(e) => updateConfig('sampleEverySteps', parseInt(e.target.value))}
                className="input-field mt-1"
                min="0"
                max="1000"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {config.sampleEverySteps === 0 ? "Disabled" : `Sample every ${config.sampleEverySteps} steps`}
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};
