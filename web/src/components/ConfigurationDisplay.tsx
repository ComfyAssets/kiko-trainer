import React from 'react';
import { useStore } from '../store/useStore';
import { DocumentTextIcon } from '@heroicons/react/24/outline';

export const ConfigurationDisplay: React.FC = () => {
  const { config, images } = useStore();

  // Generate the training command that will be used
  const generateTrainingCommand = () => {
    const outputName = config.name.toLowerCase().replace(/\s+/g, '-');
    const commands = [
      'python sd-scripts/flux_train_network.py',
      `--pretrained_model_name_or_path "${config.baseModel}"`,
      `--output_dir "outputs/${outputName}"`,
      `--output_name "${outputName}"`,
      `--dataset_config "outputs/${outputName}/dataset.toml"`,
      `--resolution ${config.resolution}`,
      `--network_module "networks.lora_flux"`,
      `--network_dim ${config.networkDim}`,
      `--learning_rate ${config.learningRate}`,
      `--max_train_epochs ${config.maxEpochs}`,
      `--save_every_n_epochs ${config.saveEvery}`,
      `--timestep_sampling ${config.timestepSampling}`,
      `--guidance_scale ${config.guidanceScale}`,
      `--seed ${config.seed}`,
      `--max_data_loader_n_workers ${config.workers}`,
      `--train_batch_size ${config.trainBatchSize}`,
    ];

    if (config.samplePrompts && config.sampleEverySteps > 0) {
      commands.push(`--sample_prompts "outputs/${outputName}/sample_prompts.txt"`);
      commands.push(`--sample_every_n_steps ${config.sampleEverySteps}`);
    }

    // Add VRAM optimizations
    if (config.vram === '12GB' || config.vram === '16GB') {
      commands.push('--optimizer_type adafactor');
      commands.push('--optimizer_args "relative_step=False" "scale_parameter=False" "warmup_init=False"');
      commands.push('--lr_scheduler constant_with_warmup');
      commands.push('--max_grad_norm 0.0');
    }

    if (config.vram === '12GB') {
      commands.push('--split_mode');
      commands.push('--network_args "train_blocks=single"');
      commands.push('--single_dim');
      commands.push('--single_alpha');
    }

    return commands.join(' \\\n  ');
  };

  // Generate dataset TOML config
  const generateDatasetConfig = () => {
    const outputName = config.name.toLowerCase().replace(/\s+/g, '-');
    return `[general]
shuffle_caption = false
caption_extension = ".txt"
keep_tokens = 1

[[datasets]]
resolution = ${config.resolution}
batch_size = 1
keep_tokens = 1

  [[datasets.subsets]]
  image_dir = "${outputName}/dataset"
  class_tokens = "${config.trigger_word}"
  num_repeats = ${config.numRepeats}`;
  };

  return (
    <div className="space-y-4">
      {/* Current Configuration Summary */}
      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center mb-3">
          <DocumentTextIcon className="h-5 w-5 text-gray-500 dark:text-gray-400 mr-2" />
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Current Configuration</h4>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">LoRA Name:</span>
            <span className="font-mono text-gray-900 dark:text-gray-100">{config.name || 'Not set'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Trigger Word:</span>
            <span className="font-mono text-gray-900 dark:text-gray-100">{config.trigger_word || 'Not set'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Base Model:</span>
            <span className="font-mono text-gray-900 dark:text-gray-100">{config.baseModel.split('/').pop()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Images:</span>
            <span className="font-mono text-gray-900 dark:text-gray-100">{images.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Learning Rate:</span>
            <span className="font-mono text-gray-900 dark:text-gray-100">{config.learningRate}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Network Dim:</span>
            <span className="font-mono text-gray-900 dark:text-gray-100">{config.networkDim}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Epochs:</span>
            <span className="font-mono text-gray-900 dark:text-gray-100">{config.maxEpochs}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">VRAM:</span>
            <span className="font-mono text-gray-900 dark:text-gray-100">{config.vram}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Resolution:</span>
            <span className="font-mono text-gray-900 dark:text-gray-100">{config.resolution}x{config.resolution}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Batch Size:</span>
            <span className="font-mono text-gray-900 dark:text-gray-100">{config.trainBatchSize}</span>
          </div>
        </div>
      </div>

      {/* Collapsible sections for detailed configs */}
      <details className="group">
        <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100">
          View Training Script
        </summary>
        <div className="mt-2 bg-gray-900 dark:bg-black rounded-lg p-3 overflow-x-auto">
          <pre className="text-xs text-gray-300 font-mono whitespace-pre">
            {generateTrainingCommand()}
          </pre>
        </div>
      </details>

      <details className="group">
        <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100">
          View Dataset Config
        </summary>
        <div className="mt-2 bg-gray-900 dark:bg-black rounded-lg p-3 overflow-x-auto">
          <pre className="text-xs text-gray-300 font-mono whitespace-pre">
            {generateDatasetConfig()}
          </pre>
        </div>
      </details>
    </div>
  );
};