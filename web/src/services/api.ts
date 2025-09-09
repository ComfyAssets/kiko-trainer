import axios from 'axios';
import { Model } from '../types';
import { API_CONFIG } from '../config/api';

const API_BASE = import.meta.env.DEV ? '/api' : `${window.location.origin.replace(/:\d+$/, ':8888')}/api`;

const api = axios.create({
  baseURL: `${API_CONFIG.baseUrl}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const trainingAPI = {
  // Get available models
  getModels: async (): Promise<Record<string, Model>> => {
    const response = await api.get('/models');
    return response.data;
  },

  // Caption images with enhanced Florence-2 options
  captionImages: async (files: File[], florenceConfig: any) => {
    const formData = new FormData();
    
    // Add Florence-2 configuration parameters
    formData.append('model_repo', florenceConfig.model || 'microsoft/Florence-2-large');
    formData.append('concept_sentence', florenceConfig.triggerWord || '');
    formData.append('attn_mode', florenceConfig.attentionMode || 'eager');
    formData.append('caption_style', florenceConfig.captionStyle || '<DETAILED_CAPTION>');
    formData.append('max_tokens', String(florenceConfig.maxTokens || 1024));
    formData.append('num_beams', String(florenceConfig.numBeams || 3));
    formData.append('temperature', String(florenceConfig.temperature || 0.7));
    formData.append('post_processing', florenceConfig.postProcessing || 'remove_prefix');
    formData.append('batch_size', String(florenceConfig.batchSize || 1));
    formData.append('top_p', String(florenceConfig.topP || 0.9));
    formData.append('repetition_penalty', String(florenceConfig.repetitionPenalty || 1.0));
    formData.append('use_cache', String(florenceConfig.useCache || false));
    formData.append('do_rescale', String(florenceConfig.doRescale || false));
    
    files.forEach(file => {
      formData.append('images', file);
    });

    const response = await api.post('/caption', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    
    return response.data.captions;
  },

  // Start training
  startTraining: async (config: any, images: File[], captions: string[]) => {
    const formData = new FormData();
    
    // Add config
    Object.entries(config).forEach(([key, value]) => {
      formData.append(key, String(value));
    });
    
    // Add images
    images.forEach(file => {
      formData.append('images', file);
    });
    
    // Add captions
    formData.append('captions', JSON.stringify(captions));
    
    const response = await api.post('/train/start', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    
    return response.data;
  },

  // Stop training
  stopTraining: async (runId: string) => {
    const response = await api.post('/train/stop', { run_id: runId });
    return response.data;
  },

  // Get training status
  getTrainingStatus: async (runId: string) => {
    const response = await api.get(`/train/status/${runId}`);
    return response.data;
  },

  // Get training logs
  getTrainingLogs: async (runId: string, lastLine: number = 0) => {
    const response = await api.get(`/train/logs/${runId}`, {
      params: { last_line: lastLine },
    });
    return response.data;
  },

  // List trained models
  listTrainedModels: async () => {
    const response = await api.get('/trained-models');
    return response.data;
  },

  // Publish to Hugging Face
  publishToHuggingFace: async (modelPath: string, repoName: string, token: string) => {
    const response = await api.post('/publish/huggingface', {
      model_path: modelPath,
      repo_name: repoName,
      token,
    });
    return response.data;
  },
};
