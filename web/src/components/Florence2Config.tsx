import React from 'react';
import { motion } from 'framer-motion';
import { InfoTooltip } from './InfoTooltip';
import { useStore } from '../store/useStore';
import { CaptionModelType } from '../types';

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

export const Florence2Config: React.FC = () => {
  const { florenceConfig, updateFlorenceConfig } = useStore();

  const modelTypeOptions = [
    { value: 'florence2' as CaptionModelType, label: 'Florence-2 - Microsoft Vision-Language Model' },
    { value: 'qwen-vl' as CaptionModelType, label: 'Qwen2.5-VL - Alibaba Vision-Language Model' },
  ];

  const florence2Models = [
    { value: 'microsoft/Florence-2-base', label: 'Florence-2 Base (Faster, smaller)' },
    { value: 'microsoft/Florence-2-large', label: 'Florence-2 Large (Better quality)' },
    { value: 'microsoft/Florence-2-base-ft', label: 'Florence-2 Base Fine-tuned' },
    { value: 'microsoft/Florence-2-large-ft', label: 'Florence-2 Large Fine-tuned' },
  ];

  const qwenModels = [
    { value: 'Qwen/Qwen2.5-VL-3B-Instruct', label: 'Qwen2.5-VL 3B (Fastest, 8GB+ VRAM)' },
    { value: 'Qwen/Qwen2.5-VL-7B-Instruct', label: 'Qwen2.5-VL 7B (Balanced, 16GB+ VRAM)' },
    { value: 'Qwen/Qwen2.5-VL-72B-Instruct', label: 'Qwen2.5-VL 72B (Best quality, 80GB+ VRAM)' },
  ];

  const florence2CaptionStyles = [
    { value: '<CAPTION>', label: 'Brief Caption - Short, concise descriptions' },
    { value: '<DETAILED_CAPTION>', label: 'Detailed Caption - Standard detailed descriptions' },
    { value: '<MORE_DETAILED_CAPTION>', label: 'More Detailed Caption - Very thorough descriptions' },
  ];

  const qwenPresets = [
    { value: 'brief', label: 'Brief - Short one-liner captions' },
    { value: 'detailed', label: 'Detailed - Full scene description (recommended)' },
    { value: 'ultra', label: 'Ultra - Exhaustive descriptions with all elements' },
  ];

  const attentionModes = [
    { value: 'eager', label: 'Eager - Standard mode (default)' },
    { value: 'sdpa', label: 'SDPA - Scaled dot product attention (faster)' },
    { value: 'flash_attention_2', label: 'Flash Attention 2 - Optimized for speed (requires support)' },
  ];

  const postProcessingOptions = [
    { value: 'none', label: 'None - Keep original caption' },
    { value: 'remove_prefix', label: 'Remove Prefix - Remove "The image shows"' },
    { value: 'lowercase', label: 'Lowercase - Convert to lowercase' },
    { value: 'remove_prefix_lowercase', label: 'Both - Remove prefix and lowercase' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-6"
    >
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100 flex items-center">
          <svg className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          Vision-Language Model Auto-Caption Settings
        </h3>

        <div className="space-y-6">
          {/* Model Type Selection */}
          <div className="space-y-2">
            <FieldLabel
              label="Vision-Language Model Type"
              tooltip={
                <div>
                  <p className="font-semibold">Choose the model architecture</p>
                  <ul className="mt-1 list-disc pl-4 text-gray-300">
                    <li><strong>Florence-2</strong>: Microsoft's vision-language model (0.2-0.7B params)</li>
                    <li><strong>Qwen2.5-VL</strong>: Alibaba's latest model (3B-72B params)</li>
                  </ul>
                </div>
              }
            />
            <select
              value={florenceConfig.modelType}
              onChange={(e) => {
                const newModelType = e.target.value as CaptionModelType;
                updateFlorenceConfig('modelType', newModelType);
                // Set appropriate default model when switching types
                if (newModelType === 'florence2') {
                  updateFlorenceConfig('model', 'microsoft/Florence-2-large');
                } else {
                  updateFlorenceConfig('model', 'Qwen/Qwen2.5-VL-7B-Instruct');
                }
              }}
              className="input-field"
            >
              {modelTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Model Selection */}
            <div className="space-y-2">
              <FieldLabel
                label={florenceConfig.modelType === 'florence2' ? 'Florence-2 Model' : 'Qwen2.5-VL Model'}
                tooltip={
                  <div>
                    <p className="font-semibold">Choose the {florenceConfig.modelType === 'florence2' ? 'Florence-2' : 'Qwen2.5-VL'} model variant</p>
                    <ul className="mt-1 list-disc pl-4 text-gray-300">
                      {florenceConfig.modelType === 'florence2' ? (
                        <>
                          <li><strong>Base</strong>: Faster, uses less memory (~0.2B params)</li>
                          <li><strong>Large</strong>: Better quality captions (~0.7B params)</li>
                          <li><strong>Fine-tuned</strong>: Optimized for specific tasks</li>
                        </>
                      ) : (
                        <>
                          <li><strong>3B</strong>: Fastest, good quality (8GB+ VRAM)</li>
                          <li><strong>7B</strong>: Balanced performance (16GB+ VRAM)</li>
                          <li><strong>72B</strong>: Best quality (80GB+ VRAM)</li>
                        </>
                      )}
                    </ul>
                  </div>
                }
              />
              <select
                value={florenceConfig.model}
                onChange={(e) => updateFlorenceConfig('model', e.target.value)}
                className="input-field"
              >
                {(florenceConfig.modelType === 'florence2' ? florence2Models : qwenModels).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Caption Style / Preset */}
            <div className="space-y-2">
              <FieldLabel
                label={florenceConfig.modelType === 'florence2' ? 'Caption Style' : 'Qwen Preset'}
                tooltip={
                  <div>
                    <p className="font-semibold">Control caption detail level</p>
                    <ul className="mt-1 list-disc pl-4 text-gray-300">
                      {florenceConfig.modelType === 'florence2' ? (
                        <>
                          <li><strong>Brief</strong>: 1-2 sentences, main subjects only</li>
                          <li><strong>Detailed</strong>: Full scene description (recommended)</li>
                          <li><strong>More Detailed</strong>: Exhaustive descriptions, all elements</li>
                        </>
                      ) : (
                        <>
                          <li><strong>Brief</strong>: Short one-liner captions</li>
                          <li><strong>Detailed</strong>: Full scene description (recommended)</li>
                          <li><strong>Ultra</strong>: Exhaustive descriptions with all elements</li>
                        </>
                      )}
                    </ul>
                  </div>
                }
              />
              {florenceConfig.modelType === 'florence2' ? (
                <select
                  value={florenceConfig.captionStyle}
                  onChange={(e) => updateFlorenceConfig('captionStyle', e.target.value)}
                  className="input-field"
                >
                  {florence2CaptionStyles.map((style) => (
                    <option key={style.value} value={style.value}>
                      {style.label}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  value={florenceConfig.qwenPreset || 'detailed'}
                  onChange={(e) => updateFlorenceConfig('qwenPreset', e.target.value as 'brief' | 'detailed' | 'ultra')}
                  className="input-field"
                >
                  {qwenPresets.map((preset) => (
                    <option key={preset.value} value={preset.value}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Attention Mode */}
            <div className="space-y-2">
            <FieldLabel
              label="Attention Mode"
              tooltip={
                <div>
                  <p className="font-semibold">Performance optimization setting</p>
                  <ul className="mt-1 list-disc pl-4 text-gray-300">
                    <li><strong>Eager</strong>: Standard PyTorch attention</li>
                    <li><strong>SDPA</strong>: ~20% faster on modern GPUs</li>
                    <li><strong>Flash Attention 2</strong>: Up to 50% faster (requires A100/H100)</li>
                  </ul>
                </div>
              }
            />
            <select
              value={florenceConfig.attentionMode}
              onChange={(e) => updateFlorenceConfig('attentionMode', e.target.value)}
              className="input-field"
            >
              {attentionModes.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </select>
          </div>

          {/* Max Caption Length */}
          <div className="space-y-2">
            <FieldLabel
              label="Max Caption Length"
              tooltip={
                <div>
                  <p className="font-semibold">Maximum tokens for caption generation</p>
                  <p className="mt-1 text-gray-300">Higher values allow longer captions but take more time. Range: 50-2048 tokens.</p>
                </div>
              }
            />
            <input
              type="number"
              min="50"
              max="2048"
              step="50"
              value={florenceConfig.maxTokens}
              onChange={(e) => updateFlorenceConfig('maxTokens', parseInt(e.target.value))}
              className="input-field"
            />
          </div>

          {/* Beam Search */}
          <div className="space-y-2">
            <FieldLabel
              label="Beam Search Width"
              tooltip={
                <div>
                  <p className="font-semibold">Quality vs speed trade-off</p>
                  <ul className="mt-1 list-disc pl-4 text-gray-300">
                    <li><strong>1</strong>: Greedy search (fastest)</li>
                    <li><strong>3</strong>: Balanced quality/speed (default)</li>
                    <li><strong>5+</strong>: Higher quality, slower generation</li>
                  </ul>
                </div>
              }
            />
            <input
              type="number"
              min="1"
              max="10"
              value={florenceConfig.numBeams}
              onChange={(e) => updateFlorenceConfig('numBeams', parseInt(e.target.value))}
              className="input-field"
            />
          </div>

          {/* Temperature */}
          <div className="space-y-2">
            <FieldLabel
              label="Temperature"
              tooltip={
                <div>
                  <p className="font-semibold">Caption creativity/randomness</p>
                  <ul className="mt-1 list-disc pl-4 text-gray-300">
                    <li><strong>0.1-0.5</strong>: More factual, consistent</li>
                    <li><strong>0.6-0.9</strong>: Balanced creativity</li>
                    <li><strong>1.0+</strong>: More creative, varied descriptions</li>
                  </ul>
                </div>
              }
            />
            <input
              type="number"
              min="0.1"
              max="2.0"
              step="0.1"
              value={florenceConfig.temperature}
              onChange={(e) => updateFlorenceConfig('temperature', parseFloat(e.target.value))}
              className="input-field"
            />
          </div>

          {/* Post-processing */}
          <div className="space-y-2">
            <FieldLabel
              label="Post-processing"
              tooltip={
                <div>
                  <p className="font-semibold">Caption cleanup options</p>
                  <ul className="mt-1 list-disc pl-4 text-gray-300">
                    <li>Remove common prefixes like "The image shows"</li>
                    <li>Convert to lowercase for consistency</li>
                    <li>Apply both transformations</li>
                  </ul>
                </div>
              }
            />
            <select
              value={florenceConfig.postProcessing}
              onChange={(e) => updateFlorenceConfig('postProcessing', e.target.value)}
              className="input-field"
            >
              {postProcessingOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Batch Size */}
          <div className="space-y-2">
            <FieldLabel
              label="Batch Size"
              tooltip={
                <div>
                  <p className="font-semibold">Images to process simultaneously</p>
                  <p className="mt-1 text-gray-300">Higher batch sizes are faster but use more VRAM. Adjust based on your GPU memory.</p>
                </div>
              }
            />
            <select
              value={florenceConfig.batchSize}
              onChange={(e) => updateFlorenceConfig('batchSize', parseInt(e.target.value))}
              className="input-field"
            >
              <option value="1">1 - Low VRAM (safest)</option>
              <option value="2">2 - 8GB+ VRAM</option>
              <option value="4">4 - 12GB+ VRAM</option>
              <option value="8">8 - 24GB+ VRAM</option>
            </select>
          </div>
          </div>
        </div>

        {/* Advanced Options Toggle */}
        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100">
            Advanced Options
          </summary>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <FieldLabel
                label="Top-p (Nucleus Sampling)"
                tooltip={
                  <div>
                    <p className="font-semibold">Token selection probability</p>
                    <p className="mt-1 text-gray-300">Lower values make captions more focused, higher values more diverse. Default: 0.9</p>
                  </div>
                }
              />
              <input
                type="number"
                min="0.1"
                max="1.0"
                step="0.05"
                value={florenceConfig.topP}
                onChange={(e) => updateFlorenceConfig('topP', parseFloat(e.target.value))}
                className="input-field"
              />
            </div>

            <div className="space-y-2">
              <FieldLabel
                label="Repetition Penalty"
                tooltip={
                  <div>
                    <p className="font-semibold">Reduce repetitive phrases</p>
                    <p className="mt-1 text-gray-300">Higher values reduce repetition. Range: 1.0-2.0, Default: 1.0</p>
                  </div>
                }
              />
              <input
                type="number"
                min="1.0"
                max="2.0"
                step="0.1"
                value={florenceConfig.repetitionPenalty}
                onChange={(e) => updateFlorenceConfig('repetitionPenalty', parseFloat(e.target.value))}
                className="input-field"
              />
            </div>

            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={florenceConfig.useCache}
                  onChange={(e) => updateFlorenceConfig('useCache', e.target.checked)}
                  className="mr-2 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Use KV Cache (faster but uses more memory)
                </span>
              </label>
            </div>

            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={florenceConfig.doRescale}
                  onChange={(e) => updateFlorenceConfig('doRescale', e.target.checked)}
                  className="mr-2 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Rescale Images (preprocess to model size)
                </span>
              </label>
            </div>

            {/* Qwen-specific options */}
            {florenceConfig.modelType === 'qwen-vl' && (
              <>
                <div className="space-y-2">
                  <FieldLabel
                    label="Min Pixels"
                    tooltip={
                      <div>
                        <p className="font-semibold">Minimum pixel budget for visual tokens</p>
                        <p className="mt-1 text-gray-300">Lower values process images faster but may lose detail. Default: 256*28*28 = 200,704</p>
                      </div>
                    }
                  />
                  <input
                    type="number"
                    min="100000"
                    max="500000"
                    step="10000"
                    value={florenceConfig.qwenMinPixels || 256 * 28 * 28}
                    onChange={(e) => updateFlorenceConfig('qwenMinPixels', parseInt(e.target.value))}
                    className="input-field"
                  />
                </div>

                <div className="space-y-2">
                  <FieldLabel
                    label="Max Pixels"
                    tooltip={
                      <div>
                        <p className="font-semibold">Maximum pixel budget for visual tokens</p>
                        <p className="mt-1 text-gray-300">Higher values preserve more detail but use more memory. Default: 1280*28*28 = 1,003,520</p>
                      </div>
                    }
                  />
                  <input
                    type="number"
                    min="500000"
                    max="2000000"
                    step="50000"
                    value={florenceConfig.qwenMaxPixels || 1280 * 28 * 28}
                    onChange={(e) => updateFlorenceConfig('qwenMaxPixels', parseInt(e.target.value))}
                    className="input-field"
                  />
                </div>
              </>
            )}
          </div>
        </details>

        {/* Performance Estimate */}
        <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-800 rounded-md">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            <strong>Estimated Performance:</strong> 
            {florenceConfig.modelType === 'florence2' 
              ? (florenceConfig.model.includes('base') ? ' ~2-3 sec/image' : ' ~4-5 sec/image')
              : (florenceConfig.model.includes('3B') ? ' ~3-4 sec/image' : 
                 florenceConfig.model.includes('7B') ? ' ~5-7 sec/image' : ' ~15-20 sec/image')
            }
            {florenceConfig.numBeams > 3 && ' (slower with high beam search)'}
            {florenceConfig.batchSize > 1 && ` • Batch of ${florenceConfig.batchSize}`}
            {florenceConfig.modelType === 'qwen-vl' && florenceConfig.qwenPreset === 'ultra' && ' (slower with ultra preset)'}
          </p>
        </div>
      </div>
    </motion.div>
  );
};