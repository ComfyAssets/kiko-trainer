import { apiUrl } from '../config/api';

export interface ModelStatus {
  model_repo: string;
  status: 'not_loaded' | 'downloading' | 'loaded' | 'error';
  progress: number;
  message: string;
}

interface CaptionRequest {
  modelType: 'florence2' | 'qwen-vl';
  model: string;
  style: string;
  attention: string;
  maxLength: number;
  beam: number;
  temperature: number;
  removePrefix: boolean;
  batchSize: number;
  triggerWord: string;
  // Qwen specific
  qwenPreset?: string;
  minPixels?: number;
  maxPixels?: number;
  topP?: number;
}

export async function generateCaptions(
  images: File[],
  config: CaptionRequest
): Promise<string[]> {
  const formData = new FormData();
  
  // Add images to form data
  images.forEach((image) => {
    formData.append(`images`, image);
  });
  
  // Add configuration parameters as expected by the backend
  formData.append('model_repo', config.model);
  formData.append('model_type', config.modelType);
  formData.append('attn_mode', config.attention || 'eager');
  formData.append('concept_sentence', config.triggerWord || '');
  formData.append('max_new_tokens', config.maxLength.toString());
  formData.append('num_beams', config.beam.toString());
  formData.append('temperature', config.temperature.toString());
  formData.append('top_p', (config.topP || 1.0).toString());
  
  // Florence2 specific parameters
  if (config.modelType === 'florence2') {
    // Map UI-friendly styles to Florence-2 task tokens
    const style = (config.style || '').toLowerCase()
    const task = style === 'brief' ? '<CAPTION>' : style === 'detailed' ? '<DETAILED_CAPTION>' : (config.style || '<DETAILED_CAPTION>')
    formData.append('caption_style', task)
  }
  
  // Qwen VL specific parameters
  if (config.modelType === 'qwen-vl') {
    formData.append('qwen_preset', config.qwenPreset || 'detailed');
    if (config.minPixels) {
      formData.append('min_pixels', config.minPixels.toString());
    }
    if (config.maxPixels) {
      formData.append('max_pixels', config.maxPixels.toString());
    }
  }

  try {
    const response = await fetch(apiUrl('/api/caption'), {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error);
    }
    
    return data.captions || [];
  } catch (error) {
    console.error('Error generating captions:', error);
    throw error;
  }
}

export async function getModelStatus(modelRepo: string): Promise<ModelStatus> {
  try {
    const response = await fetch(apiUrl(`/api/model-status/${encodeURIComponent(modelRepo)}`));
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error getting model status:', error);
    throw error;
  }
}
