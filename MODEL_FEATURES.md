# Model Tab - Advanced Features

## 🎯 Features Implemented

### 1. Duplicate File Detection for FLUX Components
- **Automatic Check**: Before downloading FLUX components, the system checks if they already exist
- **Confirmation Dialog**: Shows a warning modal listing existing files
- **User Choice**: Option to cancel or overwrite existing files
- **Files Checked**:
  - `ae.sft` (VAE)
  - `clip_l.safetensors` (CLIP L)
  - `t5xxl_fp16.safetensors` (T5XXL)

### 2. CivitAI Model Preview
- **Automatic Fetching**: When you paste a CivitAI URL, the preview loads automatically
- **Image Display**: Shows the model's preview image directly in the UI
- **Model Name**: Displays the model name from CivitAI
- **Metadata Storage**: Saves model info for future reference

### 3. Model Image Storage
When downloading from CivitAI:
- **Preview Image Saved**: The model's preview image is downloaded and saved as `{model_name}_preview.jpg`
- **Metadata File**: Creates `model_{id}_metadata.json` with:
  - Model name and description
  - Image URL
  - Version ID
  - Download timestamp
  - Actual filename

### 4. Available Models Endpoint
- **Endpoint**: `GET /models/available`
- **Purpose**: List all downloaded models with their metadata
- **Returns**: Model files with associated preview images and metadata

## 🔧 Technical Implementation

### Frontend Changes

#### ModelPage.tsx
```typescript
// New state variables
const [showOverwriteDialog, setShowOverwriteDialog] = useState(false)
const [modelPreview, setModelPreview] = useState<{url: string, name: string} | null>(null)
const [isLoadingPreview, setIsLoadingPreview] = useState(false)

// Check for existing files before download
const checkFluxComponentsExist = async () => {...}

// Fetch CivitAI preview with debounce
const fetchCivitaiPreview = async (url: string) => {...}
```

### Backend Changes

#### New Endpoints in server.py

1. **`POST /check-flux-components`**
   - Checks if FLUX component files exist in the specified directory
   - Returns: `{exists: boolean, path: string}`

2. **`POST /civitai/preview`**
   - Fetches model metadata and preview image from CivitAI API
   - Saves metadata to disk for future use
   - Returns: `{name, description, image_url, model_id}`

3. **`GET /models/available`**
   - Lists all downloaded models with their metadata
   - Includes preview images and file sizes
   - Returns: `{models: [...], count: number}`

### Data Flow

1. **User pastes CivitAI URL** → Debounced API call → Fetch preview → Display image
2. **User clicks Download FLUX** → Check files exist → Show dialog if needed → Download
3. **Model download** → Save model file → Save metadata JSON → Download preview image

## 🎨 UI Components

### Confirmation Dialog
- Clean modal with warning icon
- Lists existing files that will be overwritten
- Clear Cancel/Overwrite buttons
- Dark theme consistent with app design

### Model Preview Card
- Responsive image display
- Loading state with spinner
- Model name display
- Integrated within CivitAI download card

## 📁 File Structure

```
models/
├── flux-dev.safetensors           # Model file
├── flux-dev_preview.jpg           # Preview image
├── model_12345_metadata.json      # Model metadata
├── ae.sft                         # FLUX VAE
├── clip_l.safetensors            # CLIP encoder
└── t5xxl_fp16.safetensors        # T5XXL encoder
```

## 🚀 Usage

### Downloading with Preview
1. Paste a CivitAI URL
2. Preview loads automatically
3. Click "Download Model"
4. Model + preview image + metadata saved

### Handling Duplicates
1. Click "Download All Components"
2. If files exist, see warning dialog
3. Choose to cancel or overwrite
4. Download proceeds based on choice

### Future Training Integration
When selecting a model for training:
- Can display saved preview images
- Show model metadata (name, description)
- Better visual model selection experience

## 🔄 Server Restart Required

After these changes, restart the server:
```bash
./restart_server.sh
```

This enables all the new endpoints and functionality.