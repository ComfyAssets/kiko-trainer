# Kiko Trainer

A fresh, React + FastAPI based UI to replace the Gradio application for Flux LoRA training, captioning, and publishing.

## Layout
- `sd-scripts/`: kohya scripts (copied from root).
- `backend/`: training utilities reused by the API.
- `server.py`: FastAPI server providing endpoints for captioning, dataset creation, training, and publishing.
- `web/`: React UI (Vite) that calls the API.
- `requirements.txt`: Python deps for the API.
- `models.yaml`: Copy from root if you want independent config.

## Run
1) Backend

```
cd kiko-trainer
./setup.sh                 # installs backend deps (see sd-scripts note below)
source env/bin/activate
uvicorn backend.server:app --host 0.0.0.0 --port 8001 --reload
```

2) Frontend

```
cd kiko-trainer/web
npm install
npm run dev
# open http://localhost:5173
```

By default, the frontend proxies `/api` to `http://localhost:8001` (adjust `web/vite.config.js` if you change ports).

### Notes on sd-scripts
- This project relies on kohya-ss/sd-scripts for training. The repository is not included here and should be cloned locally at `./sd-scripts`.
- Recommended: clone the `sd3` branch and install its requirements:
  ```
  git clone -b sd3 https://github.com/kohya-ss/sd-scripts sd-scripts
  pip install -r sd-scripts/requirements.txt
  ```
  The Docker build will clone `sd-scripts` during image build; for local development, clone it manually as shown.

## Notes
- Captioning uses Florence-2 with `attn_implementation` selection and safe fallbacks.
- Training reuses the same flags you used before and writes `train.sh/.bat` + `dataset.toml` under `outputs/<lora>/`.
- Publishing uses `sd-scripts/library/huggingface_util.upload`.

## Migrate models.yaml
Copy `../models.yaml` to `kiko-trainer/models.yaml` if you want to keep configs separate from the root.

## API Quick Reference
- `GET  /api/health` → `{ ok: true }`
- `GET  /api/models` → models.yaml contents
- `POST /api/caption` (multipart): `model_repo`, `attn_mode`, `concept_sentence`, `images[]`
- `POST /api/create_dataset` (multipart): `dest_folder`, `size`, `captions`, `images[]`
- `POST /api/train/prepare` (JSON): build train script + dataset.toml
- `POST /api/train/start` (JSON): start async training
- `POST /api/train/stop` (JSON): stop training process
- `GET  /api/train/logs?run_id=...` → `{ status, logs }`
- `GET  /api/train/logs/download?run_id=...` → raw log download
- `GET  /api/loras` → list of `outputs/*` folders
- `POST /api/publish` (JSON): upload a folder to Hugging Face

## Troubleshooting
- If Torch can’t see your GPU, install a matching CUDA wheel after `setup.sh`. Example (CUDA 12.1):
  `pip install --pre torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121`
- Florence‑2: default to `eager` attention to avoid SDPA/flash‑attn mismatches; switch if your environment supports it.
- Ensure `models.yaml` entries and licenses are correct.

## Docker
One-command local run with Docker Compose:

```
cd kiko-trainer
docker compose up -d --build
# API → http://localhost:8001
# Web → http://localhost:8080 (proxied to API)
```

Notes:
- The compose file mounts `./models` and `./outputs` into the API container for persistence.
- The web container serves a production build (Nginx) and proxies `/api` to the API service.
- If you need a custom Torch build for your GPU, consider running the API outside Docker to match your local CUDA stack, or bake it into the image.
