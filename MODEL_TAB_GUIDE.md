# Model Tab - Download Guide

## Overview
The Model tab allows you to download FLUX models from CivitAI and essential components from HuggingFace directly into your training environment.

## Setup

### 1. Start the Application
```bash
./start.sh
```
This starts both the backend API (port 8080) and frontend (port 3000).

### 2. Get Your CivitAI API Key
1. Go to https://civitai.com/user/account
2. Navigate to the "API Keys" section
3. Create a new API key
4. Copy the key

### 3. Configure the Model Tab
1. Open http://localhost:3000
2. Go to the "Models" tab
3. Paste your API key and click "Save Key"
4. Set your model storage path (default: ~/ai-apps/kiko-trainer/models)

## Downloading Models

### From CivitAI
1. Find a model on CivitAI (e.g., FLUX.1-dev)
2. Copy the model URL or model ID
3. Paste into the "Model URL or ID" field
4. Click "Download Model"

Example URLs that work:
- `https://civitai.com/models/618692/flux1-dev-fp8`
- `https://civitai.com/models/618692?modelVersionId=691639`
- Just the model ID: `618692`

### FLUX Components from HuggingFace
Click "Download All Components" to get:
- **VAE (ae.sft)** - ~335MB - Required for image encoding/decoding
- **CLIP L** - ~246MB - Text encoder for prompts
- **T5XXL FP16** - ~9.5GB - Advanced text encoder for FLUX

## Features

### Download Progress
- Real-time progress tracking for each download
- File size display
- Error handling with clear messages
- Multiple concurrent downloads supported

### Storage Management
- All models saved to your specified path
- Organized file structure maintained
- Automatic directory creation

## Troubleshooting

### "Authentication required" Error
- Your API key may be invalid or expired
- Regenerate a new key from CivitAI

### "Model not found" Error
- Check the URL format is correct
- Ensure the model is publicly available
- Some models may require special permissions

### Download Stuck
- Check your internet connection
- Large models (like T5XXL) can take time
- Backend logs available at the terminal running ./start.sh

## Backend API Endpoints

The backend provides these endpoints for programmatic access:

- `POST /download/civitai` - Download from CivitAI
- `POST /download/huggingface` - Download from HuggingFace  
- `POST /download/flux-components` - Download all FLUX components
- `GET /downloads` - List all downloads
- `GET /downloads/{id}` - Get specific download status

## Next Steps

After downloading models:
1. Go to the Setup tab to prepare your dataset
2. Configure training parameters in the Training tab
3. Start training your LoRA!