# Vision Model Selection Implementation

## Overview

Successfully implemented a dropdown selection feature that allows users to choose between Florence2 and Qwen2.5-VL models for image captioning in the Kiko Trainer application.

## Changes Made

### 1. Types and Store Updates
- **File**: `web/src/types/index.ts`
  - Added `CaptionModelType` type with 'florence2' | 'qwen-vl' options
  - Extended `Florence2Config` interface with:
    - `modelType: CaptionModelType`
    - `qwenPreset?: 'brief' | 'detailed' | 'ultra'`
    - `qwenMinPixels?: number`
    - `qwenMaxPixels?: number`

- **File**: `web/src/store/useStore.ts`
  - Updated default Florence config to include new fields
  - Added Qwen-specific default values

### 2. Frontend Component Updates
- **File**: `web/src/components/Florence2Config.tsx`
  - Added model type selection dropdown
  - Conditional rendering based on selected model type
  - Added Qwen-specific configuration options (presets, pixel budgets)
  - Dynamic model options for both Florence2 and Qwen2.5-VL variants
  - Updated performance estimates for different models

- **File**: `web/src/pages/SetupPageEnhanced.tsx`
  - Updated model selection dropdown to include both model types:
    - Florence-2 Base (0.2B params)
    - Florence-2 Large (0.7B params) 
    - Qwen2.5-VL 3B (8GB+ VRAM)
    - Qwen2.5-VL 7B (16GB+ VRAM)
    - Qwen2.5-VL 72B (80GB+ VRAM)
  - Updated API call mapping to properly route to correct models

### 3. Backend API Updates
- **File**: `server.py`
  - Added `Qwen2_5_VLForConditionalGeneration` import
  - Added conditional import for `qwen_vl_utils`
  - Created `load_qwen_model()` function with pixel budget support
  - Added `QWEN_PRESET_PROMPTS` with brief/detailed/ultra presets
  - Updated `/api/caption` endpoint to support both model types:
    - New parameters: `model_type`, `qwen_preset`, `min_pixels`, `max_pixels`
    - Conditional processing logic for Florence2 vs Qwen VL
    - Proper error handling and cleanup for both model types

### 4. API Service Updates
- **File**: `web/src/services/captionApi.ts`
  - Updated `CaptionRequest` interface with new fields
  - Modified `generateCaptions()` to send model-specific parameters
  - Added conditional parameter passing for Florence2 vs Qwen VL

### 5. Support Files
- **File**: `requirements.txt` - Updated with Qwen VL dependencies
- **File**: `test_models.py` - API endpoint validation script
- **File**: `web/src/vite-env.d.ts` - TypeScript environment declarations

## Model Specifications

### Florence2 Options
1. **Florence-2 Base** (microsoft/Florence-2-base)
   - ~0.2B parameters
   - Faster inference (~2-3 sec/image)
   - Lower VRAM usage

2. **Florence-2 Large** (microsoft/Florence-2-large) 
   - ~0.7B parameters
   - Better quality captions (~4-5 sec/image)
   - Higher VRAM usage

### Qwen2.5-VL Options  
1. **Qwen2.5-VL 3B** (Qwen/Qwen2.5-VL-3B-Instruct)
   - 3B parameters
   - Requires 8GB+ VRAM
   - ~3-4 sec/image

2. **Qwen2.5-VL 7B** (Qwen/Qwen2.5-VL-7B-Instruct)
   - 7B parameters  
   - Requires 16GB+ VRAM
   - ~5-7 sec/image

3. **Qwen2.5-VL 72B** (Qwen/Qwen2.5-VL-72B-Instruct)
   - 72B parameters
   - Requires 80GB+ VRAM
   - ~15-20 sec/image

## Qwen VL Features

### Preset Prompts
- **Brief**: Single-sentence captions focusing on key elements
- **Detailed**: Full scene description with person, clothing, pose, setting
- **Ultra**: Exhaustive descriptions including all visual elements

### Advanced Options
- **Min/Max Pixels**: Control visual token budget for speed vs detail balance
- **Default**: min=256×28×28 (200,704), max=1280×28×28 (1,003,520)

## Installation Requirements

All dependencies are now consolidated in a single requirements file:

```bash
pip install -r requirements.txt
```

Key dependencies for Qwen2.5-VL support:
- `qwen-vl-utils[decord]==0.0.8`
- `transformers>=4.51.3` (updated from previous version)
- `accelerate`
- `bitsandbytes` (optional, for 4-bit quantization)
- `flash-attn>=2.0.0` (optional, for A100/H100 GPUs)

## Testing

### API Endpoint Test
```bash
python test_models.py
```

### Frontend Test
1. Start backend: `python server.py`
2. Start frontend: `cd web && npm start` 
3. Navigate to application
4. Upload images
5. Select different models from the dropdown
6. Generate captions and compare results

## Status

✅ **COMPLETED** - Both Florence2 and Qwen2.5-VL model selection working
- Backend API supports both model types
- Frontend dropdown allows model selection  
- Model-specific parameters properly handled
- Error handling and cleanup implemented
- Performance estimates updated
- API endpoint validation successful

## Usage

1. **Select Model Type**: Choose between Florence2 and Qwen2.5-VL from dropdown
2. **Select Model Variant**: Choose specific model size based on VRAM availability
3. **Configure Settings**: Adjust model-specific parameters (presets for Qwen, caption styles for Florence)
4. **Upload Images**: Add images for captioning
5. **Generate Captions**: Click generate to create captions with selected model

The implementation provides seamless switching between two state-of-the-art vision-language models, allowing users to choose the best option based on their hardware capabilities and quality requirements.