import React, { useState } from 'react';
import { useStore } from '../store/useStore';
// import { InformationCircleIcon } from '@heroicons/react/24/outline'; // unused
import { InfoTooltip } from './InfoTooltip';
import { Switch } from './ui/switch';

export const TrainingConfig: React.FC = () => {
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

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Training Parameters</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Base Model */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Base Model
            </label>
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

          {/* VRAM */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              VRAM Configuration
            </label>
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
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Learning Rate
            </label>
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
                  placeholder="e.g., 1e-3"
                />
                <button
                  onClick={() => {
                    setUseCustomLearningRate(false);
                    // Set to default if current value isn't in the options
                    const isInOptions = learningRateOptions.some(opt => opt.value === config.learningRate);
                    if (!isInOptions) {
                      updateConfig('learningRate', '4e-4'); // Default to ComfyUI Flux default
                    }
                  }}
                  className="px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  Back
                </button>
              </div>
            )}
          </div>

          {/* Rank & Alpha (paired) */}
          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Network Dimension (Rank)
              </label>
              <input
                type="number"
                value={config.networkDim}
                onChange={(e) => updateConfig('networkDim', parseInt(e.target.value))}
                className="input-field"
                min="1"
                max="128"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Network Alpha
                <InfoTooltip content={<div>LoRA alpha scaling. Often set to same as rank or half of it. Default is 1 if unset.</div>} />
              </label>
              <input
                type="number"
                value={config.networkAlpha ?? 0}
                onChange={(e) => updateConfig('networkAlpha', Number(e.target.value))}
                className="input-field"
                min="0"
                step="0.1"
              />
            </div>
          </div>

          {/* Max Epochs */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Max Epochs
            </label>
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
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Save Every N Epochs
            </label>
            <input
              type="number"
              value={config.saveEvery}
              onChange={(e) => updateConfig('saveEvery', parseInt(e.target.value))}
              className="input-field"
              min="1"
              max="50"
            />
          </div>

          {/* Batch Size */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Train Batch Size
            </label>
            <input
              type="number"
              value={config.trainBatchSize}
              onChange={(e) => updateConfig('trainBatchSize', parseInt(e.target.value))}
              className="input-field"
              min="1"
              max="8"
            />
          </div>

          {/* Resolution */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Resolution
            </label>
            <select
              value={config.resolution}
              onChange={(e) => updateConfig('resolution', parseInt(e.target.value))}
              className="input-field"
            >
              <option value="512">512</option>
              <option value="768">768</option>
              <option value="1024">1024</option>
            </select>
          </div>

          {/* Timestep Sampling */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Timestep Sampling
            </label>
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
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Guidance Scale
            </label>
            <input
              type="number"
              value={config.guidanceScale}
              onChange={(e) => updateConfig('guidanceScale', parseFloat(e.target.value))}
              className="input-field"
              min="0"
              max="20"
              step="0.1"
            />
          </div>

          {/* LR Scheduler */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              LR Scheduler <InfoTooltip content={<div>Select how learning rate changes during training. Cosine often refines late training better than constant.</div>} />
            </label>
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

          {/* Warmup Steps/Ratio */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Warmup (steps or ratio &lt; 1) <InfoTooltip content={<div>Use integer steps or a ratio like 0.05 for 5% of total steps.</div>} />
            </label>
            <input
              type="number"
              value={config.lrWarmupSteps ?? 0}
              onChange={(e) => updateConfig('lrWarmupSteps', Number(e.target.value))}
              className="input-field"
              step="0.01"
              min="0"
            />
          </div>

          {/* Noise Offset */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Noise Offset <InfoTooltip content={<div>Enable slight noise offset (e.g., 0.05) to help Flux LoRAs generalize and preserve detail.</div>} />
            </label>
            <input
              type="number"
              value={config.noiseOffset ?? 0}
              onChange={(e) => updateConfig('noiseOffset', Number(e.target.value))}
              className="input-field"
              step="0.01"
              min="0"
            />
          </div>

          {/* Flip Augmentation */}
          <div className="flex items-center justify-between mt-2">
            <label id="flipSymmetryLabel" htmlFor="flipSymmetry" className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
              Horizontal flip
              <InfoTooltip content={<div>Use for symmetrical characters to augment with mirrored poses.</div>} />
            </label>
            <Switch
              id="flipSymmetry"
              ariaLabelledby="flipSymmetryLabel"
              checked={!!config.flipSymmetry}
              onCheckedChange={(v) => updateConfig('flipSymmetry', v)}
            />
          </div>

          {/* LoRA Dropout */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              LoRA Neuron Dropout <InfoTooltip content={<div>Optional neuron dropout inside LoRA modules (maps to <code>--network_dropout</code>). For Flux LoRA, prefer Rank/Module dropout below.</div>} />
            </label>
            <input
              type="number"
              value={config.loraDropout ?? 0}
              onChange={(e) => updateConfig('loraDropout', Number(e.target.value))}
              className="input-field"
              step="0.01"
              min="0"
              max="1"
            />
          </div>

          {/* Flux LoRA Rank Dropout */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Rank Dropout (Flux LoRA)
              <InfoTooltip content={<div>Randomly drops LoRA ranks each step (maps to <code>--network_args "rank_dropout=..."</code>). Try 0.1.</div>} />
            </label>
            <input
              type="number"
              value={config.rankDropout ?? 0}
              onChange={(e) => updateConfig('rankDropout', Number(e.target.value))}
              className="input-field"
              step="0.01"
              min="0"
              max="1"
            />
          </div>

          {/* Flux LoRA Module Dropout */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Module Dropout (Flux LoRA)
              <InfoTooltip content={<div>Randomly disables entire LoRA modules (maps to <code>--network_args "module_dropout=..."</code>). Try 0.1.</div>} />
            </label>
            <input
              type="number"
              value={config.moduleDropout ?? 0}
              onChange={(e) => updateConfig('moduleDropout', Number(e.target.value))}
              className="input-field"
              step="0.01"
              min="0"
              max="1"
            />
          </div>
        </div>

        {/* Sample Generation */}
        <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-3">Sample Generation (Optional)</h4>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Sample Prompts (one per line)
              </label>
              <textarea
                value={config.samplePrompts}
                onChange={(e) => updateConfig('samplePrompts', e.target.value)}
                className="input-field"
                rows={3}
                placeholder="[trigger] riding a bike&#10;[trigger] as a superhero&#10;[trigger] in space"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Generate Samples Every N Steps (0 = disabled)
              </label>
              <input
                type="number"
                value={config.sampleEverySteps}
                onChange={(e) => updateConfig('sampleEverySteps', parseInt(e.target.value))}
                className="input-field"
                min="0"
                max="1000"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
