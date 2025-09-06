# Qwen Model Scripts Guide

## Overview
This directory contains several scripts for working with Qwen2.5-VL models, particularly with ablation to reduce refusal behaviors.

## Scripts Summary

### 1. **server.py** (Main Application Server)
- **Purpose**: FastAPI server that provides captioning API for both Florence and Qwen models
- **Qwen Features**: 
  - Automatically applies ablation if refusal direction file exists
  - Supports Qwen2.5-VL models (3B, 7B, 72B)
  - Custom prompts for detailed image descriptions
- **Usage**: `python server.py` or `uvicorn server:app`
- **Port**: 8888

### 2. **inference_qwen2_5_vl.py** (Standalone Qwen Inference)
- **Purpose**: Run Qwen2.5-VL model directly without server
- **Features**:
  - Interactive mode for single images
  - Batch processing for directories
  - Applies ablation automatically
  - 8-bit/4-bit quantization support
- **Usage**: 
  - Interactive: `python inference_qwen2_5_vl.py`
  - Batch: `python inference_qwen2_5_vl.py /path/to/images`
  - Test: `python inference_qwen2_5_vl.py --test`

### 3. **test_qwen_ablation.py** (Ablation Testing)
- **Purpose**: Test and compare Qwen model with and without ablation
- **Features**:
  - Loads model with ablation
  - Generates with ablation
  - Generates without ablation for comparison
  - Shows behavior differences
- **Usage**: `python test_qwen_ablation.py`

### 4. **debug_qwen_server.py** (API Testing)
- **Purpose**: Test the server's API endpoint with Qwen model
- **Features**:
  - Creates test image
  - Sends request to server
  - Uses Qwen2.5-VL-7B specifically
  - Tests detailed caption preset
- **Usage**: `python debug_qwen_server.py`
- **Requires**: Server running on port 8888

### 5. **test_models.py** (Multi-Model Testing)
- **Purpose**: Test both Florence and Qwen models through the API
- **Features**:
  - Tests server health
  - Tests Florence-2 models
  - Tests Qwen-VL models
  - Compares different model outputs
- **Usage**: `python test_models.py`

## Required Files

### Ablation File
- **Name**: `Qwen_Qwen2.5-VL-7B-Instruct_refusal_dir.pt`
- **Purpose**: Contains the refusal direction for ablation
- **Location**: Project root directory
- **Note**: If missing, models run without ablation

### Dependencies
```bash
pip install transformers qwen-vl-utils einops torch torchvision accelerate bitsandbytes
```

## Quick Start

1. **Start the server with Qwen support**:
   ```bash
   python server.py
   ```

2. **Test Qwen through API**:
   ```bash
   python debug_qwen_server.py
   ```

3. **Run Qwen directly**:
   ```bash
   python inference_qwen2_5_vl.py
   ```

4. **Test ablation**:
   ```bash
   python test_qwen_ablation.py
   ```

## Notes

- All Qwen scripts automatically apply ablation if the refusal direction file exists
- The ablation reduces refusal behaviors while maintaining model capabilities
- Use 8-bit quantization for 24GB VRAM, 4-bit for 12-16GB VRAM
- The server supports both Florence and Qwen models simultaneously