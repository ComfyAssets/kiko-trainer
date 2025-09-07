#!/usr/bin/env python3
"""Backend server for FLUX LoRA Trainer with CivitAI and HuggingFace downloads"""

import io
import os
import json
import asyncio
import aiohttp
from pathlib import Path
from typing import Optional, Dict, Any, List
import httpx
from fastapi import FastAPI, HTTPException, BackgroundTasks, Form, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import hashlib
import shutil
from datetime import datetime
from urllib.parse import urlparse, parse_qs
import uuid
import time
import random
from contextlib import asynccontextmanager
import re
try:
    import psutil  # optional
except Exception:
    psutil = None  # type: ignore
import subprocess
import threading
import sys

# Vision model imports
import einops
import torch
from PIL import Image
from transformers import AutoModelForCausalLM, AutoProcessor, Qwen2_5_VLForConditionalGeneration

try:
    from qwen_vl_utils import process_vision_info
    QWEN_VL_AVAILABLE = True
except ImportError:
    QWEN_VL_AVAILABLE = False
    process_vision_info = None

app = FastAPI(title="FLUX LoRA Trainer API")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Download tracking
downloads: Dict[str, Dict[str, Any]] = {}
# Track cancellation requests
cancel_tokens: Dict[str, asyncio.Event] = {}
# Track file paths for cleanup
download_files: Dict[str, Path] = {}

# Default models directory
MODELS_DIR = Path.home() / "ai-apps" / "kiko-trainer" / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)
os.environ.setdefault('KIKO_MODELS_DIR', str(MODELS_DIR))

# Project root
ROOT = Path(__file__).resolve().parent.parent
# Ensure we can import helper modules
if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
try:
    from train_utils import (
        download as tu_download,
        gen_sh as tu_gen_sh,
        gen_toml as tu_gen_toml,
        resolve_path_without_quotes as tu_resolve_path_without_quotes,
        load_models_yaml as tu_load_models_yaml,
    )
except Exception:
    # Fallback: try package-style import if available
    try:
        from backend.train_utils import download as tu_download, gen_sh as tu_gen_sh, gen_toml as tu_gen_toml, resolve_path_without_quotes as tu_resolve_path_without_quotes, load_models_yaml as tu_load_models_yaml
    except Exception as e:
        print(f"[WARN] Could not import train_utils: {e}")
        tu_download = tu_gen_sh = tu_gen_toml = tu_resolve_path_without_quotes = None

def ensure_train_utils() -> tuple[bool, str]:
    """Attempt to (re)import train_utils if not already loaded."""
    global tu_download, tu_gen_sh, tu_gen_toml, tu_resolve_path_without_quotes, tu_load_models_yaml
    if tu_gen_sh and tu_gen_toml and tu_resolve_path_without_quotes:
        return True, ""
    try:
        import importlib, sys as _sys
        importlib.invalidate_caches()
        _sys.modules.pop('train_utils', None)
        _sys.modules.pop('backend.train_utils', None)
        from train_utils import (
            download as _dl,
            gen_sh as _gsh,
            gen_toml as _gtoml,
            resolve_path_without_quotes as _r,
            load_models_yaml as _load,
        )
        tu_download, tu_gen_sh, tu_gen_toml, tu_resolve_path_without_quotes, tu_load_models_yaml = _dl, _gsh, _gtoml, _r, _load
        return True, ""
    except Exception as e1:
        try:
            import importlib, sys as _sys
            importlib.invalidate_caches()
            _sys.modules.pop('backend.train_utils', None)
            from backend.train_utils import download as _dl, gen_sh as _gsh, gen_toml as _gtoml, resolve_path_without_quotes as _r, load_models_yaml as _load
            tu_download, tu_gen_sh, tu_gen_toml, tu_resolve_path_without_quotes, tu_load_models_yaml = _dl, _gsh, _gtoml, _r, _load
            return True, ""
        except Exception as e2:
            # Final fallback: load directly from file path
            try:
                import importlib.util as _util, types as _types
                from pathlib import Path as _Path
                here = _Path(__file__).resolve().parent
                fpath = here / 'train_utils.py'
                spec = _util.spec_from_file_location('train_utils_dyn', fpath)
                if spec and spec.loader:
                    mod = _util.module_from_spec(spec)  # type: ignore
                    spec.loader.exec_module(mod)  # type: ignore
                    tu_download, tu_gen_sh, tu_gen_toml = mod.download, mod.gen_sh, mod.gen_toml
                    tu_resolve_path_without_quotes, tu_load_models_yaml = mod.resolve_path_without_quotes, mod.load_models_yaml
                    return True, ""
                else:
                    msg = f"train_utils import failed: {e1} | {e2} | direct load spec failed"
                    print(f"[ERROR] {msg}")
                    return False, msg
            except Exception as e3:
                msg = f"train_utils import failed: {e1} | {e2} | {e3}"
                print(f"[ERROR] {msg}")
                return False, msg

# Serve model assets (previews) statically
app.mount("/static", StaticFiles(directory=MODELS_DIR), name="static")
# Serve arbitrary project files (used to preview output images)
app.mount("/files", StaticFiles(directory=ROOT), name="files")

# --- Sample prompt helpers (shared across endpoints) ---
def _round16(x: int) -> int:
    try:
        return max(64, (int(x) // 16) * 16)
    except Exception:
        return 512


def _max_sample_res_for_vram(v: str) -> Optional[int]:
    v = str(v or '').upper().replace('B', '')
    if v.startswith('12'):
        return 512
    if v.startswith('16'):
        return 640
    if v.startswith('20'):
        return 768
    if v.startswith('24'):
        return 768
    return None


def _cap_width_height_in_toml(src: str, max_res: Optional[int]) -> str:
    if not max_res:
        return src
    out_lines: list[str] = []
    for ln in src.replace('\r\n', '\n').replace('\r', '\n').split('\n'):
        s = ln.strip()
        if s.startswith('width') and '=' in s:
            try:
                val = int(s.split('=')[1].strip())
                if val > max_res:
                    ln = f"width = {_round16(max_res)}"
            except Exception:
                pass
        elif s.startswith('height') and '=' in s:
            try:
                val = int(s.split('=')[1].strip())
                if val > max_res:
                    ln = f"height = {_round16(max_res)}"
            except Exception:
                pass
        out_lines.append(ln)
    return '\n'.join(out_lines)


def _convert_simple_prompt_toml(src: str) -> str:
    lines = src.replace('\r\n', '\n').replace('\r', '\n').split('\n')
    blocks: list[list[str]] = []
    current: list[str] | None = None
    for ln in lines:
        s = ln.strip()
        if not s:
            continue
        if s.startswith('[[prompt]]'):
            if current:
                blocks.append(current)
            current = []
            continue
        # collect k = v lines only
        if '=' in s and not s.startswith('#'):
            if current is None:
                current = []
            # normalize 'text' -> 'prompt'
            if s.startswith('text'):
                key, val = s.split('=', 1)
                s = f"prompt ={val}"
            current.append(s)
    if current:
        blocks.append(current)
    # Build target TOML
    out: list[str] = []
    out.append('[prompt]')
    for blk in blocks:
        out.append('')
        out.append('[[prompt.subset]]')
        out.extend(blk)
    out.append('')
    return '\n'.join(out)


def _rename_text_key_in_toml(src: str) -> str:
    out_lines: list[str] = []
    for ln in src.replace('\r\n', '\n').replace('\r', '\n').split('\n'):
        s = ln.strip()
        if s.startswith('text') and '=' in s:
            try:
                _, val = s.split('=', 1)
                ln = f"prompt ={val}"
            except Exception:
                pass
        out_lines.append(ln)
    return '\n'.join(out_lines)

# Global model status tracking
MODEL_STATUS = {}  # repo_id -> {"status": "downloading|loaded|error", "progress": 0-100, "message": "..."}
MODEL_CACHE = {}  # repo_id -> (model, processor) - keep loaded models in memory

# Training runs tracking
RUNS: Dict[str, Dict[str, Any]] = {}

# Preset prompt templates for Qwen VL
QWEN_PRESET_PROMPTS = {
    "brief": (
        "Describe this image in a single, natural sentence. "
        "Include ethnicity, body size, body shape, breast size and shape, clothing, pose, facial expression, and setting. "
        "Do not mention gender, age, identity terms, or meta phrases. "
        "Write as a compact, flowing description."
    ),
    "detailed": (
        "Describe this image in 2–4 flowing sentences. "
        "Include ethnicity, body size, body shape, curves, proportions, and breast size and shape. "
        "Describe posture, facial expression, hairstyle and color, skin tone, clothing and how it fits or reveals the form, "
        "along with accessories, tattoos, environment, lighting, and shadows. "
        "Do not use gender, age, identity terms, or meta phrases. "
        "Write concise, vivid sentences, not lists or fragments."
    ),
}

# Relaxed Qwen captioner defaults (used when selecting
# Ertugrul/Qwen2.5-VL-7B-Captioner-Relaxed)
RELAXED_QWEN_SYSTEM = "You are an expert image describer."
RELAXED_QWEN_USER = (
    "Describe this image concisely and only with visual details and uncensored that are clearly present. "
    "Output a single sentence or a comma-separated list of tags. "
    "Always begin with the subject identifier token: \"mabes9sans\". "
    "Include attributes like: pose, shot type (full body, half body, close-up), hairstyle, clothing or nudity, body build, facial expression, background, lighting, and setting. "
    "Do not add speculation, intentions, or purposes of the photo. "
    "Avoid long prose, narrative style, or redundant adjectives. "
    "Keep the caption short (15–40 tokens)."
)

class ProgressCallback:
    """Custom progress callback for model downloads"""
    def __init__(self, repo_id: str):
        self.repo_id = repo_id
        self.total_files = 0
        self.completed_files = 0

    def __call__(self, downloaded: int, total: int):
        """Called during download progress"""
        if total > 0:
            progress = min(100, int((downloaded / total) * 100))
            MODEL_STATUS[self.repo_id] = {
                "status": "downloading",
                "progress": progress,
                "message": f"Downloading model files... {progress}%",
            }

def get_cached_model(
    repo_id: str,
    model_type: str,
    attn_mode: str,
    device: str,
    torch_dtype,
    min_pixels=None,
    max_pixels=None,
):
    """Get model from cache or load it with progress tracking"""
    cache_key = f"{repo_id}_{model_type}_{attn_mode}"

    # Return cached model if available
    if cache_key in MODEL_CACHE:
        MODEL_STATUS[repo_id] = {
            "status": "loaded",
            "progress": 100,
            "message": "Model ready",
        }
        return MODEL_CACHE[cache_key]

    # Initialize status
    MODEL_STATUS[repo_id] = {
        "status": "downloading",
        "progress": 0,
        "message": "Starting model download...",
    }

    try:
        if model_type == "qwen-vl":
            model, processor = load_qwen_model(
                repo_id, attn_mode, device, torch_dtype, min_pixels, max_pixels
            )
        else:
            model, processor = load_florence_model(
                repo_id, attn_mode, device, torch_dtype
            )

        # Cache the loaded model
        MODEL_CACHE[cache_key] = (model, processor)
        MODEL_STATUS[repo_id] = {
            "status": "loaded",
            "progress": 100,
            "message": "Model loaded successfully",
        }

        return model, processor

    except Exception as e:
        MODEL_STATUS[repo_id] = {
            "status": "error",
            "progress": 0,
            "message": f"Error loading model: {str(e)}",
        }
        raise

def load_florence_model(repo_id: str, attn_mode: str, device: str, torch_dtype):
    # Update status to loading model
    MODEL_STATUS[repo_id] = {
        "status": "downloading",
        "progress": 50,
        "message": "Loading Florence-2 model...",
    }

    model = AutoModelForCausalLM.from_pretrained(
        repo_id,
        torch_dtype=torch_dtype,
        trust_remote_code=True,
        attn_implementation=attn_mode,
    ).to(device)

    MODEL_STATUS[repo_id] = {
        "status": "downloading",
        "progress": 75,
        "message": "Loading processor...",
    }

    processor = AutoProcessor.from_pretrained(repo_id, trust_remote_code=True)
    if not hasattr(model, "_supports_sdpa"):
        setattr(model, "_supports_sdpa", attn_mode == "sdpa")
    if not hasattr(model, "_supports_flash_attn_2"):
        setattr(model, "_supports_flash_attn_2", attn_mode == "flash_attention_2")
    return model, processor

class AblationLayer:
    """Apply ablation to remove refusal direction from model outputs."""
    def __init__(self, refusal_dir):
        self.refusal_dir = refusal_dir

    def __call__(self, module, input, output):
        # Apply ablation to the output
        hidden_states = output[0] if isinstance(output, tuple) else output

        # Ensure refusal_dir is on the same device and dtype as hidden_states
        device = hidden_states.device
        dtype = hidden_states.dtype
        refusal_dir_on_device = self.refusal_dir.to(device=device, dtype=dtype)

        proj = (
            einops.einsum(
                hidden_states,
                refusal_dir_on_device.view(-1, 1),
                "... d_act, d_act single -> ... single",
            )
            * refusal_dir_on_device
        )
        ablated = hidden_states - proj
        if isinstance(output, tuple):
            return (ablated,) + output[1:]
        return ablated

def load_qwen_model(
    repo_id: str,
    attn_mode: str,
    device: str,
    torch_dtype,
    min_pixels=None,
    max_pixels=None,
):
    if not QWEN_VL_AVAILABLE:
        raise RuntimeError(
            "Qwen VL utilities not available. Please install: pip install qwen-vl-utils"
        )

    def progress_callback(downloaded, total):
        """Update model download progress"""
        if repo_id in MODEL_STATUS and total > 0:
            percentage = int((downloaded / total) * 100)
            MODEL_STATUS[repo_id]["progress"] = percentage
            MODEL_STATUS[repo_id][
                "message"
            ] = f"Downloaded {downloaded}/{total} bytes ({percentage}%)"

    # Configure processor with optional min/max pixel budget
    processor_kwargs = {}
    if min_pixels is not None and max_pixels is not None:
        processor_kwargs = {"min_pixels": min_pixels, "max_pixels": max_pixels}

    # Try to add progress callback if supported
    try:
        processor_kwargs["progress_callback"] = progress_callback
        processor = AutoProcessor.from_pretrained(repo_id, **processor_kwargs)
    except Exception:
        # Remove progress callback and try again
        processor_kwargs.pop("progress_callback", None)
        processor = AutoProcessor.from_pretrained(repo_id, **processor_kwargs)

    model_kwargs = {
        "torch_dtype": torch_dtype,
        "device_map": "auto" if device == "cuda" else None,
    }
    if attn_mode and attn_mode != "eager":
        model_kwargs["attn_implementation"] = attn_mode

    # Try to add progress callback if supported
    try:
        model_kwargs["progress_callback"] = progress_callback
        model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
            repo_id, **model_kwargs
        )
    except Exception:
        # Remove progress callback and try again
        model_kwargs.pop("progress_callback", None)
        model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
            repo_id, **model_kwargs
        )

    # Apply ablation if refusal direction file exists
    refusal_dir_filename = f"{repo_id.replace('/', '_')}_refusal_dir.pt"
    # Resolve project root (two levels up from this file)
    PROJECT_ROOT = Path(__file__).resolve().parents[1]
    candidate_paths = [
        os.path.join(os.getcwd(), refusal_dir_filename),
        str(PROJECT_ROOT / refusal_dir_filename),
    ]
    refusal_dir_path = next((p for p in candidate_paths if os.path.exists(p)), None)
    if refusal_dir_path:
        try:
            print(f"Loading refusal direction from {refusal_dir_path}")
            # Load to CPU first - the AblationLayer will handle device placement
            refusal_dir = torch.load(refusal_dir_path, map_location="cpu")

            # Apply hooks to all decoder layers to perform ablation
            ablation = AblationLayer(refusal_dir)
            for layer in model.model.language_model.layers:
                layer.register_forward_hook(ablation)

            print(
                f"Applied ablation to {len(model.model.language_model.layers)} layers"
            )
        except Exception as e:
            print(f"Warning: Could not apply ablation: {e}")
            import traceback
            traceback.print_exc()
            # Continue without ablation if it fails
    else:
        print(
            f"Refusal direction file not found in {candidate_paths}, running without ablation"
        )

    return model, processor

class CivitAIDownloadRequest(BaseModel):
    url: str
    api_key: str
    output_path: Optional[str] = None

class HuggingFaceDownloadRequest(BaseModel):
    repo: str
    file: str
    output_path: Optional[str] = None

class DownloadStatus(BaseModel):
    id: str
    name: str
    status: str  # pending, downloading, completed, error, cancelled
    progress: float
    size: Optional[str] = None
    error: Optional[str] = None
    file_path: Optional[str] = None

class ModelInfo(BaseModel):
    name: str
    path: str
    size: str
    size_bytes: int
    modified: str
    type: str  # checkpoint, lora, vae, clip, t5xxl
    preview_image: Optional[str] = None
    integrity: Optional[Dict[str, Any]] = None
    source_url: Optional[str] = None

class RenameModelRequest(BaseModel):
    old_name: str
    new_name: str
    path: Optional[str] = None

@app.get("/")
async def root():
    return {"message": "FLUX LoRA Trainer API"}

@app.get("/downloads")
async def get_downloads():
    """Get all download statuses"""
    return list(downloads.values())

@app.post("/downloads/cleanup")
async def cleanup_failed_downloads():
    """Clean up all failed and cancelled downloads"""
    cleaned = []
    
    for download_id in list(downloads.keys()):
        download = downloads[download_id]
        
        if download['status'] in ['error', 'cancelled']:
            # Delete file if it exists
            if download.get('file_path'):
                file_path = Path(download['file_path'])
                if file_path.exists():
                    file_path.unlink()
            
            # Remove from tracking
            del downloads[download_id]
            if download_id in cancel_tokens:
                del cancel_tokens[download_id]
            if download_id in download_files:
                del download_files[download_id]
            
            cleaned.append(download_id)
    
    return {"message": f"Cleaned up {len(cleaned)} downloads", "cleaned": cleaned}

@app.get("/downloads/{download_id}")
async def get_download_status(download_id: str):
    """Get specific download status"""
    if download_id not in downloads:
        raise HTTPException(status_code=404, detail="Download not found")
    return downloads[download_id]

def parse_civitai_url(url: str) -> Dict[str, Optional[int]]:
    """Extract model and version IDs from CivitAI URL"""
    parsed = urlparse(url)
    result = {'model_id': None, 'version_id': None}
    
    # Direct API download URL
    if '/api/download/models/' in url:
        match = url.split('/api/download/models/')[-1].split('?')[0]
        if match.isdigit():
            result['version_id'] = int(match)
            return result
    
    # Model page URL
    if '/models/' in url:
        parts = parsed.path.split('/')
        if 'models' in parts:
            idx = parts.index('models')
            if idx + 1 < len(parts) and parts[idx + 1].isdigit():
                result['model_id'] = int(parts[idx + 1])
    
    # Version specific URL
    query_params = parse_qs(parsed.query)
    if 'modelVersionId' in query_params:
        version_id = query_params['modelVersionId'][0]
        if version_id.isdigit():
            result['version_id'] = int(version_id)
    
    return result

async def robust_http_request(session: aiohttp.ClientSession, method: str, url: str, **kwargs):
    """Robust HTTP request with retry logic and exponential backoff"""
    max_retries = 3
    base_delay = 1.0
    
    for attempt in range(max_retries + 1):
        try:
            # Much longer timeouts for large model downloads (30 minutes total)
            timeout = aiohttp.ClientTimeout(total=1800, connect=60, sock_read=300)
            async with session.request(method, url, timeout=timeout, **kwargs) as resp:
                if resp.status == 429:  # Rate limited
                    if attempt < max_retries:
                        delay = base_delay * (2 ** attempt) + random.uniform(0, 1)
                        await asyncio.sleep(delay)
                        continue
                return resp
        except (aiohttp.ClientError, asyncio.TimeoutError) as e:
            if attempt < max_retries:
                delay = base_delay * (2 ** attempt) + random.uniform(0, 1)
                await asyncio.sleep(delay)
                continue
            raise e
    
    raise Exception(f"Failed to complete request after {max_retries + 1} attempts")

async def download_with_resume(session: aiohttp.ClientSession, url: str, file_path: Path, 
                              cancel_token: asyncio.Event, download_id: str, headers: Dict[str, str] = None):
    """Download file with resume capability and progress tracking"""
    if headers is None:
        headers = {}
    
    # Check if partial file exists
    resume_pos = 0
    if file_path.exists():
        resume_pos = file_path.stat().st_size
        headers['Range'] = f'bytes={resume_pos}-'
    
    # Try to get file info with HEAD request (but handle redirects)
    total_size = None
    accept_ranges = False
    try:
        async with session.head(url, headers={k: v for k, v in headers.items() if k != 'Range'}, 
                               allow_redirects=True, timeout=aiohttp.ClientTimeout(total=30)) as head_resp:
            if head_resp.status in [200, 206]:
                total_size = head_resp.headers.get('Content-Length')
                if total_size:
                    total_size = int(total_size)
                    if resume_pos == 0:  # Only set size if not resuming
                        downloads[download_id]['size'] = f"{total_size / (1024*1024):.1f}MB"
                
                # Check if server supports range requests
                accept_ranges = head_resp.headers.get('Accept-Ranges', '').lower() == 'bytes'
                
                # Get filename from headers
                content_disp = head_resp.headers.get('Content-Disposition', '')
                if 'filename=' in content_disp:
                    filename = content_disp.split('filename=')[1].strip('"')
                    if file_path.name != filename:
                        file_path = file_path.parent / filename
                        downloads[download_id]['name'] = filename
                        downloads[download_id]['file_path'] = str(file_path)
    except (aiohttp.ClientError, asyncio.TimeoutError):
        # HEAD request failed or timed out, we'll get info from GET request instead
        pass
    
    # Download the file
    file_mode = 'ab' if resume_pos > 0 and accept_ranges else 'wb'
    if file_mode == 'wb':
        resume_pos = 0  # Reset if we can't resume
    
    async with session.get(url, headers=headers, allow_redirects=True) as resp:
        if resp.status not in [200, 206]:
            error_text = ""
            try:
                error_text = await resp.text()
            except:
                pass
            raise Exception(f"Download failed with status {resp.status}: {error_text}")
        
        # Update total size if we got content-length from actual download
        if not total_size:
            content_length = resp.headers.get('Content-Length')
            if content_length:
                total_size = int(content_length) + resume_pos
                downloads[download_id]['size'] = f"{total_size / (1024*1024):.1f}MB"
        
        downloaded = resume_pos
        chunk_size = 64 * 1024  # 64KB chunks for better progress granularity
        
        with open(file_path, file_mode) as f:
            async for chunk in resp.content.iter_chunked(chunk_size):
                # Check for cancellation every chunk
                if cancel_token.is_set():
                    raise asyncio.CancelledError("Download cancelled by user")
                
                f.write(chunk)
                downloaded += len(chunk)
                
                # Update progress
                if total_size and total_size > 0:
                    progress = (downloaded / total_size) * 100
                    downloads[download_id]['progress'] = round(min(progress, 100), 1)
                
                # Yield control to allow other tasks
                await asyncio.sleep(0)
    
    return file_path

async def download_civitai_model(download_id: str, url: str, api_key: str, output_path: Path):
    """Download from CivitAI using the proven downloader implementation"""
    print(f"[DEBUG] Starting download_civitai_model for {download_id}")
    print(f"[DEBUG] URL: {url}")
    print(f"[DEBUG] Output path: {output_path}")
    
    try:
        from civitai_downloader import CivitAIDownloader
        print("[DEBUG] Successfully imported CivitAIDownloader")
    except Exception as e:
        print(f"[ERROR] Failed to import CivitAIDownloader: {e}")
        downloads[download_id]['status'] = 'error'
        downloads[download_id]['error'] = f"Import error: {str(e)}"
        return
    
    cancel_token = asyncio.Event()
    cancel_tokens[download_id] = cancel_token
    file_path = None
    
    try:
        downloads[download_id]['status'] = 'downloading'
        print(f"[DEBUG] Set download status to 'downloading' for {download_id}")
        
        # Progress callback to update download state
        async def progress_callback(data):
            print(f"[DEBUG] Progress callback: {data}")
            status = data.get('status', 'downloading')
            if status == 'downloading':
                downloads[download_id]['progress'] = round(data.get('progress', 0), 1)
                if data.get('speed'):
                    downloads[download_id]['speed'] = f"{data['speed']:.2f} MB/s"
                if data.get('total'):
                    downloads[download_id]['size'] = f"{data['total'] / (1024*1024):.1f}MB"
            elif status == 'resuming':
                downloads[download_id]['status'] = 'resuming'
                downloads[download_id]['progress'] = round(data.get('progress', 0), 1)
            elif status == 'completed':
                downloads[download_id]['status'] = 'completed'
                downloads[download_id]['progress'] = 100
        
        print("[DEBUG] Creating downloader instance")
        # Use the proven downloader
        downloader = CivitAIDownloader(token=api_key, progress_callback=progress_callback)
        downloader.set_cancel_event(cancel_token)
        
        print("[DEBUG] Starting download_model call")
        # Download the model
        file_path = await downloader.download_model(url, str(output_path))
        
        print(f"[DEBUG] Download complete, file_path: {file_path}")
        # Update download info
        downloads[download_id]['file_path'] = file_path
        downloads[download_id]['name'] = os.path.basename(file_path)
        downloads[download_id]['status'] = 'completed'
        downloads[download_id]['progress'] = 100
        download_files[download_id] = Path(file_path)
        print(f"[DEBUG] Download marked as completed for {download_id}")

        # After successful download, try to fetch and save preview + metadata
        try:
            ids = parse_civitai_url(url)
            model_id = ids.get('model_id')
            version_id = ids.get('version_id')
            preview_url = None

            # Prefer image URL from previously saved metadata if present
            try:
                if model_id:
                    meta_path = output_path / f"model_{model_id}_metadata.json"
                    if meta_path.exists():
                        with open(meta_path, 'r') as f:
                            meta_existing = json.load(f)
                            if meta_existing.get('image_url'):
                                preview_url = meta_existing['image_url']
            except Exception:
                pass

            async with httpx.AsyncClient() as client:
                headers = {'Authorization': f'Bearer {api_key}'} if api_key else {}
                if not preview_url and version_id:
                    resp = await client.get(f'https://civitai.com/api/v1/model-versions/{version_id}', headers=headers)
                    if resp.status_code == 200:
                        data = resp.json()
                        images = data.get('images', [])
                        if images:
                            preview_url = images[0].get('url')
                elif not preview_url and model_id:
                    resp = await client.get(f'https://civitai.com/api/v1/models/{model_id}', headers=headers)
                    if resp.status_code == 200:
                        data = resp.json()
                        versions = data.get('modelVersions', [])
                        if versions and versions[0].get('images'):
                            preview_url = versions[0]['images'][0].get('url')

            # Save sidecar metadata and preview file next to the model
            if file_path and preview_url:
                base = Path(file_path).with_suffix('')
                preview_path = base.parent / f"{base.name}_preview.jpg"
                meta = {
                    'model_id': model_id,
                    'version_id': version_id,
                    'filename': Path(file_path).name,
                    'image_url': preview_url,
                    'source_url': url,
                    'download_date': time.time(),
                }
                # Save metadata
                try:
                    with open(output_path / f"model_{model_id}_metadata.json", 'w') as f:
                        json.dump(meta, f, indent=2)
                except Exception as e:
                    print(f"[WARN] Failed saving metadata JSON: {e}")
                # Download and save preview image
                try:
                    async with httpx.AsyncClient() as client:
                        r = await client.get(preview_url)
                        if r.status_code == 200:
                            preview_path.write_bytes(r.content)
                except Exception as e:
                    print(f"[WARN] Failed downloading preview image: {e}")

            # Validate and hash the downloaded file
            try:
                fp = Path(file_path)
                integ = _validate_model_file(fp)
                _save_integrity_sidecar(fp, integ)
            except Exception as e:
                print(f"[WARN] Integrity check failed: {e}")
        except Exception as e:
            print(f"[WARN] Post-download preview attach failed: {e}")
        
    except asyncio.CancelledError:
        print(f"[DEBUG] Download cancelled for {download_id}")
        downloads[download_id]['status'] = 'cancelled'
        downloads[download_id]['error'] = 'Download cancelled by user'
        # Keep partial file for resume capability
        
    except Exception as e:
        print(f"[ERROR] Download failed for {download_id}: {e}")
        import traceback
        traceback.print_exc()
        downloads[download_id]['status'] = 'error'
        downloads[download_id]['error'] = str(e)
        # Clean up only on non-recoverable errors
        if file_path and file_path.exists() and "cancelled" not in str(e).lower():
            try:
                # Keep partial files for most errors to allow resume
                if "parse" in str(e).lower() or "unauthorized" in str(e).lower():
                    file_path.unlink()  # Remove only for auth/parse errors
            except:
                pass  # Ignore cleanup errors
    
    finally:
        # Clean up tracking but keep cancel token until download is truly done
        if download_id in download_files:
            del download_files[download_id]
        if download_id in cancel_tokens:
            del cancel_tokens[download_id]

@app.post("/download/civitai")
async def download_from_civitai(request: CivitAIDownloadRequest, background_tasks: BackgroundTasks):
    """Start CivitAI model download"""
    print(f"[DEBUG] POST /download/civitai called with URL: {request.url}")
    download_id = str(uuid.uuid4())
    output_path = Path(request.output_path) if request.output_path else MODELS_DIR
    
    print(f"[DEBUG] Download ID: {download_id}")
    print(f"[DEBUG] Output path: {output_path}")
    print(f"[DEBUG] API key provided: {'Yes' if request.api_key else 'No'}")
    
    # Initialize download status
    downloads[download_id] = {
        'id': download_id,
        'name': 'CivitAI Model',
        'status': 'pending',
        'progress': 0,
        'size': None,
        'error': None
    }
    
    print(f"[DEBUG] Added download to tracking dict")
    
    # Start download in background
    background_tasks.add_task(
        download_civitai_model,
        download_id,
        request.url,
        request.api_key,
        output_path
    )
    
    print(f"[DEBUG] Background task started for download {download_id}")
    
    return downloads[download_id]

async def download_huggingface_file(download_id: str, repo: str, file: str, output_path: Path):
    """Download file from HuggingFace with cancellation support"""
    cancel_token = asyncio.Event()
    cancel_tokens[download_id] = cancel_token
    file_path = None
    
    try:
        downloads[download_id]['status'] = 'downloading'
        
        # Construct HuggingFace URL
        hf_url = f"https://huggingface.co/{repo}/resolve/main/{file}"
        
        async with aiohttp.ClientSession() as session:
            async with session.get(hf_url, allow_redirects=True) as resp:
                if resp.status != 200:
                    raise Exception(f"Download failed with status {resp.status}")
                
                # Get total size
                total_size = resp.headers.get('Content-Length')
                if total_size:
                    total_size = int(total_size)
                    downloads[download_id]['size'] = f"{total_size / (1024*1024):.1f}MB"
                
                # Download with progress tracking
                file_path = output_path / file
                file_path.parent.mkdir(parents=True, exist_ok=True)
                download_files[download_id] = file_path
                downloads[download_id]['file_path'] = str(file_path)
                downloaded = 0
                
                with open(file_path, 'wb') as f:
                    async for chunk in resp.content.iter_chunked(1024 * 1024):  # 1MB chunks
                        # Check for cancellation
                        if cancel_token.is_set():
                            raise asyncio.CancelledError("Download cancelled by user")
                        
                        f.write(chunk)
                        downloaded += len(chunk)
                        if total_size:
                            progress = (downloaded / total_size) * 100
                            downloads[download_id]['progress'] = round(progress, 1)
        downloads[download_id]['status'] = 'completed'
        downloads[download_id]['progress'] = 100
        # Save simple sidecar metadata with source URL
        try:
            meta = {
                'filename': file_path.name if isinstance(file_path, Path) else Path(file).name,
                'source_url': f"https://huggingface.co/{repo}/resolve/main/{file}",
                'download_date': time.time(),
            }
            side = (file_path if isinstance(file_path, Path) else Path(str(file_path))).with_suffix((Path(file).suffix or '') + '.meta.json')
            # Use <filename>.meta.json
            side = (output_path / file).with_suffix(Path(file).suffix + '.meta.json')
            with open(side, 'w') as mf:
                json.dump(meta, mf, indent=2)
        except Exception as e:
            print(f"[WARN] Could not save HF metadata: {e}")
        
    except asyncio.CancelledError:
        downloads[download_id]['status'] = 'cancelled'
        downloads[download_id]['error'] = 'Download cancelled by user'
        # Clean up partial file
        if file_path and file_path.exists():
            file_path.unlink()
        
    except Exception as e:
        downloads[download_id]['status'] = 'error'
        downloads[download_id]['error'] = str(e)
        # Clean up partial file on error
        if file_path and file_path.exists():
            file_path.unlink()
    
    finally:
        # Clean up tracking
        if download_id in cancel_tokens:
            del cancel_tokens[download_id]
        if download_id in download_files:
            del download_files[download_id]

        # Validate and hash (best-effort) for huggingface downloads
        try:
            if file_path and file_path.exists():
                integ = _validate_model_file(file_path)
                _save_integrity_sidecar(file_path, integ)
        except Exception as e:
            print(f"[WARN] Integrity check failed: {e}")

@app.post("/download/huggingface")
async def download_from_huggingface(request: HuggingFaceDownloadRequest, background_tasks: BackgroundTasks):
    """Start HuggingFace file download"""
    download_id = str(uuid.uuid4())
    output_path = Path(request.output_path) if request.output_path else MODELS_DIR
    
    # Initialize download status
    downloads[download_id] = {
        'id': download_id,
        'name': f"{request.file} from {request.repo}",
        'status': 'pending',
        'progress': 0,
        'size': None,
        'error': None
    }
    
    # Start download in background
    background_tasks.add_task(
        download_huggingface_file,
        download_id,
        request.repo,
        request.file,
        output_path
    )
    
    return downloads[download_id]

@app.post("/check-flux-components")
async def check_flux_components(request: Dict[str, Any]):
    """Check if FLUX components already exist"""
    path = Path(request.get('path', MODELS_DIR))
    
    components = {
        'vae': {'file': 'ae.sft', 'name': 'FLUX VAE (ae.sft)'},
        'clip': {'file': 'clip_l.safetensors', 'name': 'CLIP L'},
        't5xxl': {'file': 't5xxl_fp16.safetensors', 'name': 'T5XXL FP16'}
    }
    
    status = {}
    for key, comp in components.items():
        file_path = path / comp['file']
        exists = file_path.exists()
        status[key] = {
            'exists': exists,
            'name': comp['name'],
            'file': comp['file'],
            'size': f"{file_path.stat().st_size / (1024*1024):.1f}MB" if exists else None
        }
    
    all_exist = all(s['exists'] for s in status.values())
    
    return {'exists': all_exist, 'status': status, 'path': str(path)}

@app.post("/civitai/preview")
async def get_civitai_preview(request: Dict[str, Any]):
    """Fetch CivitAI model preview image and metadata"""
    url = request.get('url', '')
    api_key = request.get('api_key', '')
    save_path = Path(request.get('path', MODELS_DIR))
    chosen_image_url = request.get('chosen_image_url')
    
    if not url:
        raise HTTPException(status_code=400, detail="URL required")
    
    # Parse URL to get model ID
    ids = parse_civitai_url(url)
    model_id = ids.get('model_id')
    version_id = ids.get('version_id')
    
    if not model_id and not version_id:
        # Try to extract from simple ID input
        if url.isdigit():
            model_id = int(url)
        else:
            raise HTTPException(status_code=400, detail="Could not parse model ID from URL")
    
    try:
        async with httpx.AsyncClient() as client:
            headers = {'Authorization': f'Bearer {api_key}'} if api_key else {}
            
            # Get model details
            if version_id:
                # Get specific version
                response = await client.get(
                    f'https://civitai.com/api/v1/model-versions/{version_id}',
                    headers=headers
                )
            else:
                # Get model and use first version
                response = await client.get(
                    f'https://civitai.com/api/v1/models/{model_id}',
                    headers=headers
                )
            
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="Failed to fetch model details")
            
            data = response.json()
            
            # Extract preview info
            if version_id:
                # Direct version response
                images = data.get('images', [])
                name = data.get('model', {}).get('name', 'Unknown Model')
                version_name = data.get('name', '')
                if version_name:
                    name = f"{name} - {version_name}"
            else:
                # Model response with versions
                first_version = data.get('modelVersions', [{}])[0]
                images = first_version.get('images', [])
                name = data.get('name', 'Unknown Model')
                version_name = first_version.get('name', '')
                if version_name:
                    name = f"{name} - {version_name}"
            
            # Collect image options and pick first by default
            image_options = [img.get('url', '') for img in images if img.get('url')]
            image_url = ''
            if image_options:
                image_url = image_options[0]
            # If client specified a chosen image, prefer it
            if chosen_image_url:
                image_url = chosen_image_url
            
            result = {
                'image_url': image_url,
                'name': name,
                'model_id': model_id,
                'version_id': version_id,
                'images': image_options
            }

            # Persist lightweight metadata so the downloader can attach preview later
            try:
                if model_id:
                    meta = {
                        'model_id': model_id,
                        'version_id': version_id,
                        'name': name,
                        'image_url': image_url,
                        'saved_at': time.time()
                    }
                    meta_path = save_path / f"model_{model_id}_metadata.json"
                    meta_path.parent.mkdir(parents=True, exist_ok=True)
                    with open(meta_path, 'w') as f:
                        json.dump(meta, f, indent=2)
            except Exception as e:
                print(f"[WARN] Failed to persist CivitAI preview metadata: {e}")

            return result

    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"Network error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching preview: {str(e)}")

@app.post("/civitai/resolve")
async def civitai_resolve(request: Dict[str, Any]):
    """Resolve a CivitAI URL to an expected filename and whether it exists locally."""
    url = request.get('url', '')
    api_key = request.get('api_key', '')
    path = Path(request.get('path', MODELS_DIR))
    if not url:
        return JSONResponse({'error': 'URL required'}, status_code=400)

    ids = parse_civitai_url(url)
    if not ids.get('version_id') and not ids.get('model_id'):
        return JSONResponse({'error': 'Could not parse model or version id'}, status_code=400)

    # Build API download URL
    api_url = None
    try:
        async with aiohttp.ClientSession() as session:
            headers = {'Authorization': f'Bearer {api_key}'} if api_key else {}
            if ids.get('version_id'):
                api_url = f"https://civitai.com/api/download/models/{ids['version_id']}"
            else:
                # Find first version id
                async with session.get(f"https://civitai.com/api/v1/models/{ids['model_id']}", headers=headers) as resp:
                    if resp.status != 200:
                        return JSONResponse({'error': f'Failed to fetch model: {resp.status}'}, status_code=resp.status)
                    md = await resp.json()
                    ver = (md.get('modelVersions') or [{}])[0]
                    vid = ver.get('id')
                    if vid:
                        api_url = f"https://civitai.com/api/download/models/{vid}"
            if not api_url:
                return JSONResponse({'error': 'Could not resolve download URL'}, status_code=400)

            # Fetch headers to get filename (HEAD may be blocked; do GET without reading body)
            async with session.get(api_url, headers=headers, allow_redirects=True) as resp:
                if resp.status != 200:
                    return JSONResponse({'error': f'Failed to resolve: {resp.status}'}, status_code=resp.status)
                content_disp = resp.headers.get('Content-Disposition', '')
                if 'filename=' in content_disp:
                    filename = content_disp.split('filename=')[1].strip('"')
                else:
                    # Fallback filename
                    filename = f"model_{ids.get('version_id') or ids.get('model_id')}.safetensors"
    except Exception as e:
        return JSONResponse({'error': str(e)}, status_code=500)

    exists = (path / filename).exists()
    return {'filename': filename, 'exists': exists, 'path': str(path)}

@app.post("/civitai/attach-preview")
async def civitai_attach_preview(request: Dict[str, Any]):
    """Fetch and save preview metadata and image for an existing model file."""
    url = request.get('url', '')
    api_key = request.get('api_key', '')
    path = Path(request.get('path', MODELS_DIR))
    filename = request.get('filename')
    if not (url and filename):
        return JSONResponse({'error': 'url and filename required'}, status_code=400)
    target = path / filename
    if not target.exists():
        return JSONResponse({'error': 'target file does not exist'}, status_code=404)

    try:
        ids = parse_civitai_url(url)
        model_id = ids.get('model_id')
        version_id = ids.get('version_id')
        preview_url = request.get('image_url')
        async with httpx.AsyncClient() as client:
            headers = {'Authorization': f'Bearer {api_key}'} if api_key else {}
            if not preview_url and version_id:
                r = await client.get(f'https://civitai.com/api/v1/model-versions/{version_id}', headers=headers)
                if r.status_code == 200:
                    data = r.json()
                    imgs = data.get('images', [])
                    if imgs:
                        preview_url = imgs[0].get('url')
            elif not preview_url and model_id:
                r = await client.get(f'https://civitai.com/api/v1/models/{model_id}', headers=headers)
                if r.status_code == 200:
                    data = r.json()
                    versions = data.get('modelVersions', [])
                    if versions and versions[0].get('images'):
                        preview_url = versions[0]['images'][0].get('url')

        if not preview_url:
            return JSONResponse({'error': 'Could not fetch preview'}, status_code=400)

        base = target.with_suffix('')
        preview_path = base.parent / f"{base.name}_preview.jpg"
        meta = {
            'model_id': model_id,
            'version_id': version_id,
            'filename': filename,
            'image_url': preview_url,
            'updated_at': time.time(),
        }

        # Save metadata JSON
        try:
            if model_id:
                with open(path / f"model_{model_id}_metadata.json", 'w') as f:
                    json.dump(meta, f, indent=2)
        except Exception as e:
            print(f"[WARN] Failed saving metadata JSON: {e}")

        # Download and save preview image
        try:
            async with httpx.AsyncClient() as client:
                r = await client.get(preview_url)
                if r.status_code == 200:
                    preview_path.write_bytes(r.content)
                else:
                    return JSONResponse({'error': f'Failed to download preview: {r.status_code}'}, status_code=500)
        except Exception as e:
            return JSONResponse({'error': str(e)}, status_code=500)

        return {'ok': True, 'preview_image': str(preview_path)}
    except Exception as e:
        return JSONResponse({'error': str(e)}, status_code=500)

@app.post("/download/flux-components")
async def download_flux_components(background_tasks: BackgroundTasks):
    """Download all FLUX components (VAE, CLIP, T5XXL)"""
    components = [
        {'name': 'FLUX VAE (ae.sft)', 'repo': 'cocktailpeanut/xulf-dev', 'file': 'ae.sft'},
        {'name': 'CLIP L', 'repo': 'comfyanonymous/flux_text_encoders', 'file': 'clip_l.safetensors'},
        {'name': 'T5XXL FP16', 'repo': 'comfyanonymous/flux_text_encoders', 'file': 't5xxl_fp16.safetensors'}
    ]
    
    download_ids = []
    
    for comp in components:
        download_id = str(uuid.uuid4())
        
        downloads[download_id] = {
            'id': download_id,
            'name': comp['name'],
            'status': 'pending',
            'progress': 0,
            'size': None,
            'error': None
        }
        
        background_tasks.add_task(
            download_huggingface_file,
            download_id,
            comp['repo'],
            comp['file'],
            MODELS_DIR
        )
        
        download_ids.append(download_id)
    
    return {'downloads': download_ids, 'status': 'started'}

@app.post("/downloads/{download_id}/cancel")
async def cancel_download(download_id: str):
    """Cancel an ongoing download"""
    if download_id not in downloads:
        raise HTTPException(status_code=404, detail="Download not found")
    
    if downloads[download_id]['status'] not in ['pending', 'downloading']:
        raise HTTPException(status_code=400, detail="Download cannot be cancelled")
    
    # Set the cancellation token
    if download_id in cancel_tokens:
        cancel_tokens[download_id].set()
        downloads[download_id]['status'] = 'cancelling'
        return {"message": "Cancellation requested", "download_id": download_id}
    
    return {"message": "Download already completed or cancelled", "download_id": download_id}

@app.delete("/downloads/{download_id}")
async def delete_download(download_id: str):
    """Delete a download record and optionally its file"""
    if download_id not in downloads:
        raise HTTPException(status_code=404, detail="Download not found")
    
    download = downloads[download_id]
    
    # If file exists and download failed/cancelled, delete the file
    if download.get('file_path') and download['status'] in ['error', 'cancelled']:
        file_path = Path(download['file_path'])
        if file_path.exists():
            file_path.unlink()
    
    # Remove from tracking
    del downloads[download_id]
    if download_id in cancel_tokens:
        del cancel_tokens[download_id]
    if download_id in download_files:
        del download_files[download_id]
    
    return {"message": "Download record deleted", "download_id": download_id}


@app.get("/models")
async def list_models(path: Optional[str] = None):
    """List all models in the specified directory"""
    model_path = Path(path) if path else MODELS_DIR
    
    if not model_path.exists():
        return {"models": [], "error": "Directory not found"}
    
    models = []
    
    # Model file extensions and their types
    model_extensions = {
        '.safetensors': 'checkpoint',
        '.ckpt': 'checkpoint',
        '.pt': 'checkpoint',
        '.pth': 'checkpoint',
        '.bin': 'checkpoint',
        '.sft': 'vae',
    }
    
    # Special file name patterns
    special_patterns = {
        'ae.sft': 'vae',
        'clip_l': 'clip',
        't5xxl': 't5xxl',
        'lora': 'lora',
        'lycoris': 'lora',
    }
    
    try:
        # Walk recursively so nested component folders (unet/clip/vae) are discovered
        for file_path in model_path.rglob('*'):
            if file_path.is_file():
                # Get file extension
                ext = file_path.suffix.lower()
                
                # Skip non-model files
                if ext not in model_extensions and not any(pattern in file_path.name.lower() for pattern in special_patterns):
                    continue
                
                # Determine model type
                model_type = 'unknown'
                name_lower = file_path.name.lower()
                
                # Check special patterns first
                for pattern, mtype in special_patterns.items():
                    if pattern in name_lower:
                        model_type = mtype
                        break
                
                # If no special pattern, use extension
                if model_type == 'unknown' and ext in model_extensions:
                    model_type = model_extensions[ext]
                
                # Get file stats
                stats = file_path.stat()
                size_bytes = stats.st_size
                size_str = format_file_size(size_bytes)
                modified = datetime.fromtimestamp(stats.st_mtime).isoformat()
                
                # Optional preview image sidecar
                preview = None
                for ext2 in ('.jpg', '.jpeg', '.png'):
                    candidate = file_path.parent / f"{file_path.stem}_preview{ext2}"
                    if candidate.exists():
                        preview = str(candidate)
                        break

                # Optional integrity sidecar
                integrity = None
                integ_path = file_path.parent / f"{file_path.name}.integrity.json"
                if integ_path.exists():
                    try:
                        with open(integ_path, 'r') as f:
                            integrity = json.load(f)
                    except Exception:
                        integrity = {'ok': False, 'error': 'invalid integrity file'}

                # Try to locate source URL from metadata
                source_url = None
                # Pattern 1: CivitAI metadata files tracking mapping to filename
                for meta_file in file_path.parent.glob('model_*_metadata.json'):
                    try:
                        with open(meta_file, 'r') as f:
                            md = json.load(f)
                            if md.get('filename') == file_path.name and md.get('source_url'):
                                source_url = md.get('source_url')
                                break
                    except Exception:
                        continue
                # Pattern 2: sidecar per-file metadata
                if not source_url:
                    side_meta = file_path.parent / f"{file_path.name}.meta.json"
                    if side_meta.exists():
                        try:
                            with open(side_meta, 'r') as f:
                                md2 = json.load(f)
                                source_url = md2.get('source_url')
                        except Exception:
                            pass

                models.append(ModelInfo(
                    name=file_path.name,
                    path=str(file_path),
                    size=size_str,
                    size_bytes=size_bytes,
                    modified=modified,
                    type=model_type,
                    preview_image=preview,
                    integrity=integrity,
                    source_url=source_url
                ).dict())
        
        # Sort by modified date (newest first)
        models.sort(key=lambda x: x['modified'], reverse=True)
        
        return {
            "models": models,
            "total_size": format_file_size(sum(m['size_bytes'] for m in models)),
            "count": len(models),
            "path": str(model_path)
        }
        
    except Exception as e:
        return {"models": [], "error": str(e)}


@app.post("/api/system/purge-vram")
async def api_purge_vram():
    """Attempt to free GPU VRAM by clearing caches and unloading cached models."""
    try:
        import gc
        before_alloc = None
        before_reserved = None
        # Best-effort global GPU memory snapshot via nvidia-smi
        def _gpu_mem_snapshot():
            try:
                import subprocess as _sp
                out = _sp.check_output(
                    [
                        "nvidia-smi",
                        "--query-gpu=memory.total,memory.used",
                        "--format=csv,noheader,nounits",
                    ],
                    text=True,
                    stderr=_sp.DEVNULL,
                )
                vals = []
                for line in out.strip().splitlines():
                    parts = [p.strip() for p in line.split(',')]
                    if len(parts) == 2:
                        total_mb = float(parts[0])
                        used_mb = float(parts[1])
                        vals.append({"total_mb": total_mb, "used_mb": used_mb})
                return vals
            except Exception:
                return []

        gpu_before = _gpu_mem_snapshot()
        if torch.cuda.is_available():
            try:
                before_alloc = torch.cuda.memory_allocated()
                before_reserved = torch.cuda.memory_reserved()
            except Exception:
                pass

        # Clear any app-level model caches
        try:
            MODEL_CACHE.clear()
        except Exception:
            pass

        # Python GC + torch CUDA cache purge
        try:
            gc.collect()
        except Exception:
            pass
        if torch.cuda.is_available():
            try:
                torch.cuda.empty_cache()
                if hasattr(torch.cuda, 'ipc_collect'):
                    torch.cuda.ipc_collect()
                torch.cuda.synchronize()
            except Exception:
                pass

        after_alloc = None
        after_reserved = None
        if torch.cuda.is_available():
            try:
                after_alloc = torch.cuda.memory_allocated()
                after_reserved = torch.cuda.memory_reserved()
            except Exception:
                pass
        gpu_after = _gpu_mem_snapshot()
        gpu_freed = []
        if gpu_before and gpu_after and len(gpu_before) == len(gpu_after):
            for b, a in zip(gpu_before, gpu_after):
                freed_mb = max(0.0, (b.get("used_mb", 0.0) - a.get("used_mb", 0.0)))
                gpu_freed.append({
                    "freed_gb": round(freed_mb / 1024.0, 3),
                    "before_used_gb": round(b.get("used_mb", 0.0) / 1024.0, 3),
                    "after_used_gb": round(a.get("used_mb", 0.0) / 1024.0, 3),
                })

        def fmt(x):
            return None if x is None else round(x / (1024**3), 3)

        return {
            "ok": True,
            "before": {"allocated_gb": fmt(before_alloc), "reserved_gb": fmt(before_reserved)},
            "after": {"allocated_gb": fmt(after_alloc), "reserved_gb": fmt(after_reserved)},
            "gpu": {"before": gpu_before, "after": gpu_after, "freed": gpu_freed},
        }
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)

@app.delete("/models/{model_name}")
async def delete_model(model_name: str, path: Optional[str] = None):
    """Delete a model file and associated metadata/images"""
    model_path = Path(path) if path else MODELS_DIR
    file_path = model_path / model_name
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Model not found")
    
    if not file_path.is_file():
        raise HTTPException(status_code=400, detail="Not a file")
    
    try:
        # Get file size before deletion for response
        size = file_path.stat().st_size
        size_str = format_file_size(size)
        
        # Clean up associated files
        cleaned_files = []
        base_name = file_path.stem  # filename without extension
        
        # Common patterns for associated files
        patterns = [
            f"{base_name}.png",     # Preview image
            f"{base_name}.jpg",     # Preview image
            f"{base_name}.jpeg",    # Preview image
            f"{base_name}.json",    # Metadata
            f"{base_name}.yaml",    # Config
            f"{base_name}.yml",     # Config
            f"{base_name}.txt",     # Info file
            f"{base_name}_info.json",  # Extended metadata
            f"{base_name}_preview.*",  # Any preview files
        ]
        
        # Look for and delete associated files
        for pattern in patterns:
            # Handle wildcards
            if '*' in pattern:
                for match in model_path.glob(pattern):
                    if match.exists() and match.is_file():
                        match.unlink()
                        cleaned_files.append(match.name)
            else:
                associated_file = model_path / pattern
                if associated_file.exists() and associated_file.is_file():
                    associated_file.unlink()
                    cleaned_files.append(pattern)
        
        # Delete the main model file
        file_path.unlink()
        
        return {
            "message": f"Model '{model_name}' and associated files deleted successfully",
            "deleted": model_name,
            "size_freed": size_str,
            "cleaned_files": cleaned_files
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete model: {str(e)}")

@app.post("/models/rename")
async def rename_model(request: RenameModelRequest):
    """Rename a model file"""
    model_path = Path(request.path) if request.path else MODELS_DIR
    old_path = model_path / request.old_name
    new_path = model_path / request.new_name
    
    if not old_path.exists():
        raise HTTPException(status_code=404, detail="Model not found")
    
    if new_path.exists():
        raise HTTPException(status_code=400, detail="A model with that name already exists")
    
    try:
        # Rename the file
        old_path.rename(new_path)
        
        return {
            "message": f"Model renamed successfully",
            "old_name": request.old_name,
            "new_name": request.new_name
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to rename model: {str(e)}")

@app.post("/models/validate")
async def validate_model(request: Dict[str, Any]):
    """Compute sha256 and try reading safetensors header; save sidecar and return result."""
    path = Path(request.get('path') or MODELS_DIR)
    filename = request.get('filename')
    if not filename:
        raise HTTPException(status_code=400, detail="filename required")
    fp = path / filename
    if not fp.exists() or not fp.is_file():
        raise HTTPException(status_code=404, detail="file not found")
    integ = _validate_model_file(fp)
    _save_integrity_sidecar(fp, integ)
    return integ

@app.get("/downloads/stream/{download_id}")
async def stream_download_progress(download_id: str):
    """Server-Sent Events endpoint for real-time download progress"""
    async def event_generator():
        last_progress = -1
        while True:
            if download_id not in downloads:
                yield f"data: {json.dumps({'status': 'error', 'message': 'Download not found'})}\n\n"
                break
            
            download = downloads[download_id]
            current_progress = download.get('progress', 0)
            
            # Send update if progress changed or status changed
            if current_progress != last_progress or download['status'] in ['completed', 'error', 'cancelled']:
                data = {
                    'id': download_id,
                    'status': download['status'],
                    'progress': current_progress,
                    'name': download.get('name', ''),
                    'size': download.get('size', ''),
                    'speed': download.get('speed', ''),
                    'error': download.get('error', '')
                }
                yield f"data: {json.dumps(data)}\n\n"
                last_progress = current_progress
                
                # Stop streaming if download is finished
                if download['status'] in ['completed', 'error', 'cancelled']:
                    break
            
            # Wait a bit before next check
            await asyncio.sleep(0.5)
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable proxy buffering
        }
    )

@app.get("/api/model-status/{model_repo:path}")
def api_model_status(model_repo: str):
    """Get the current status of a model (downloading, loaded, error)"""
    status = MODEL_STATUS.get(
        model_repo,
        {"status": "not_loaded", "progress": 0, "message": "Model not loaded"},
    )
    return {"model_repo": model_repo, **status}

# ---------------------------
# Model integrity utilities
# ---------------------------

def _compute_sha256(file_path: Path) -> str:
    h = hashlib.sha256()
    with open(file_path, 'rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()

def _validate_model_file(file_path: Path) -> Dict[str, Any]:
    result: Dict[str, Any] = {
        'file': str(file_path),
        'ok': True,
        'error': None,
        'sha256': None,
        'validated_at': time.time(),
    }
    try:
        result['sha256'] = _compute_sha256(file_path)
        if file_path.suffix.lower() == '.safetensors':
            try:
                from safetensors.torch import safe_open
                with safe_open(str(file_path), framework='pt') as f:
                    _ = f.keys()  # iterate to ensure readable
            except Exception as e:
                result['ok'] = False
                result['error'] = f'safetensors error: {e}'
    except Exception as e:
        result['ok'] = False
        result['error'] = f'validate failed: {e}'
    return result

def _save_integrity_sidecar(file_path: Path, data: Dict[str, Any]):
    try:
        sidecar = file_path.parent / f"{file_path.name}.integrity.json"
        with open(sidecar, 'w') as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print(f"[WARN] Failed to write integrity sidecar: {e}")

# ---------------------------
# System metrics endpoint
# ---------------------------

def _get_cpu_mem_metrics() -> Dict[str, Any]:
    info: Dict[str, Any] = {
        'cpu': {},
        'memory': {},
    }
    try:
        if psutil:
            info['cpu'] = {
                'percent': psutil.cpu_percent(interval=0.0),
                'cores': psutil.cpu_count() or 0,
                'load_avg': os.getloadavg() if hasattr(os, 'getloadavg') else None,
            }
            vm = psutil.virtual_memory()
            info['memory'] = {
                'total': vm.total,
                'available': vm.available,
                'used': vm.used,
                'percent': vm.percent,
            }
        else:
            # Fallback: use /proc/meminfo and loadavg
            load_avg = os.getloadavg() if hasattr(os, 'getloadavg') else (0, 0, 0)
            info['cpu'] = {
                'percent': None,
                'cores': os.cpu_count() or 0,
                'load_avg': load_avg,
            }
            meminfo = {}
            try:
                with open('/proc/meminfo') as f:
                    for line in f:
                        k, v = line.split(':', 1)
                        meminfo[k.strip()] = v.strip()
                def _to_bytes(s: str) -> int:
                    parts = s.split()
                    val = int(parts[0])
                    unit = parts[1].lower() if len(parts) > 1 else 'kb'
                    mult = 1024 if unit in ('kb',) else 1
                    return val * mult
                total = _to_bytes(meminfo.get('MemTotal', '0 kB'))
                free = _to_bytes(meminfo.get('MemAvailable', '0 kB'))
                used = total - free
                percent = (used / total * 100) if total > 0 else 0
                info['memory'] = {
                    'total': total,
                    'available': free,
                    'used': used,
                    'percent': percent,
                }
            except Exception:
                info['memory'] = None  # best-effort
    except Exception:
        pass
    return info

def _get_gpu_metrics() -> List[Dict[str, Any]]:
    gpus: List[Dict[str, Any]] = []
    try:
        # Query minimal set without units for easy parsing
        q = [
            'index','name','utilization.gpu','memory.used','memory.total','temperature.gpu'
        ]
        cmd = ['nvidia-smi', f"--query-gpu={','.join(q)}", '--format=csv,noheader,nounits']
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode == 0:
            for line in res.stdout.strip().splitlines():
                parts = [p.strip() for p in line.split(',')]
                if len(parts) >= 6:
                    gpus.append({
                        'index': int(parts[0]),
                        'name': parts[1],
                        'util': float(parts[2]),
                        'mem_used': float(parts[3]),  # MiB
                        'mem_total': float(parts[4]), # MiB
                        'temp': float(parts[5]),
                    })
    except Exception:
        pass
    return gpus

@app.get('/api/system/metrics')
def api_system_metrics():
    base = _get_cpu_mem_metrics()
    base['gpus'] = _get_gpu_metrics()
    base['timestamp'] = time.time()
    return base

# ---------------------------
# Outputs (finished trainings) file manager
# ---------------------------

def _human_size(n: int) -> str:
    return format_file_size(n)

@app.get('/api/outputs')
def api_outputs_list():
    outputs_root = ROOT / 'outputs'
    outputs_root.mkdir(exist_ok=True)
    runs = []
    try:
        for entry in outputs_root.iterdir():
            if not entry.is_dir():
                continue
            if entry.name == 'sample':
                continue
            # compute folder size
            size = 0
            latest_mtime = 0
            sample_images = []
            try:
                for root, dirs, files in os.walk(entry):
                    for f in files:
                        p = Path(root) / f
                        try:
                            st = p.stat()
                            size += st.st_size
                            latest_mtime = max(latest_mtime, int(st.st_mtime))
                        except Exception:
                            pass
                        if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
                            # store relative path and prefix with /files for serving
                            rel = str(p.relative_to(ROOT))
                            sample_images.append('/files/' + rel)
            except Exception:
                pass
            # sort images by modified time desc
            try:
                sample_images = sorted(sample_images, key=lambda s: (Path(ROOT / s.replace('/files/','')).stat().st_mtime if (ROOT / s.replace('/files/','')).exists() else 0), reverse=True)
            except Exception:
                sample_images = sample_images[:]
            runs.append({
                'name': entry.name,
                'path': str(entry),
                'size_bytes': size,
                'size': _human_size(size),
                'modified': datetime.fromtimestamp(latest_mtime).isoformat() if latest_mtime else None,
                'images': sample_images[:12],
                'image_count': len(sample_images),
            })
        runs.sort(key=lambda x: x['modified'] or '', reverse=True)
        return {'ok': True, 'runs': runs}
    except Exception as e:
        return JSONResponse({'ok': False, 'message': str(e), 'runs': []}, status_code=500)

@app.get('/api/outputs/{name}/images')
def api_outputs_images(name: str, offset: int = 0, limit: int = 24, order: str = 'desc'):
    target = ROOT / 'outputs' / name
    if not target.exists() or not target.is_dir():
        return JSONResponse({'ok': False, 'message': 'not found', 'images': [], 'total': 0}, status_code=404)
    imgs = []
    try:
        for root, dirs, files in os.walk(target):
            for f in files:
                if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
                    p = Path(root) / f
                    rel = str(p.relative_to(ROOT))
                    imgs.append(('/files/' + rel, p.stat().st_mtime))
        reverse = (order != 'asc')
        imgs.sort(key=lambda t: t[1], reverse=reverse)
        total = len(imgs)
        slice_imgs = [p for (p, _) in imgs[offset: offset + limit]]
        return {'ok': True, 'images': slice_imgs, 'total': total, 'offset': offset, 'limit': limit}
    except Exception as e:
        return JSONResponse({'ok': False, 'message': str(e), 'images': [], 'total': 0}, status_code=500)

@app.delete('/api/outputs/{name}')
def api_outputs_delete(name: str):
    target = ROOT / 'outputs' / name
    if not target.exists() or not target.is_dir():
        return JSONResponse({'ok': False, 'message': 'not found'}, status_code=404)
    try:
        import shutil as _shutil
        _shutil.rmtree(target)
        return {'ok': True}
    except Exception as e:
        return JSONResponse({'ok': False, 'message': str(e)}, status_code=500)

@app.post("/api/caption")
async def api_caption(
    model_repo: str = Form("Qwen/Qwen2.5-VL-7B-Instruct"),
    model_type: str = Form("qwen-vl"),
    attn_mode: str = Form("eager"),
    concept_sentence: Optional[str] = Form(""),
    # Florence2 specific
    caption_style: Optional[str] = Form("<DETAILED_CAPTION>"),
    # Qwen VL specific
    qwen_preset: Optional[str] = Form("brief"),
    min_pixels: Optional[int] = Form(None),
    max_pixels: Optional[int] = Form(None),
    # Common parameters
    max_new_tokens: int = Form(1024),
    num_beams: int = Form(3),
    temperature: float = Form(0.0),
    top_p: float = Form(1.0),
    images: List[UploadFile] = File(...),
):
    device = "cuda" if torch.cuda.is_available() else "cpu"
    torch_dtype = torch.bfloat16 if torch.cuda.is_available() else torch.float32

    try:
        # Use cached model function which handles progress tracking
        model, processor = get_cached_model(
            model_repo,
            model_type,
            attn_mode,
            device,
            torch_dtype,
            min_pixels,
            max_pixels,
        )

        out: List[str] = []
        for uf in images:
            content = await uf.read()
            img = Image.open(io.BytesIO(content)).convert("RGB")

            if model_type == "qwen-vl":
                # Qwen VL processing
                is_relaxed = isinstance(model_repo, str) and "Qwen2.5-VL-7B-Captioner-Relaxed" in model_repo
                if is_relaxed:
                    # Use relaxed system+prompt defaults
                    messages = [
                        {"role": "system", "content": [{"type": "text", "text": RELAXED_QWEN_SYSTEM}]},
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": RELAXED_QWEN_USER},
                                {"type": "image", "image": img},
                            ],
                        },
                    ]
                else:
                    # Use preset brief/detailed instructions
                    prompt = QWEN_PRESET_PROMPTS.get(
                        qwen_preset, QWEN_PRESET_PROMPTS["detailed"]
                    )
                    messages = [
                        {
                            "role": "user",
                            "content": [
                                {"type": "image", "image": img},
                                {"type": "text", "text": prompt},
                            ],
                        }
                    ]

                # Build chat template + vision inputs
                text = processor.apply_chat_template(
                    messages, tokenize=False, add_generation_prompt=True
                )
                image_inputs, video_inputs = process_vision_info(messages)
                inputs = processor(
                    text=[text],
                    images=image_inputs,
                    videos=video_inputs,
                    padding=True,
                    return_tensors="pt",
                )

                if device == "cuda":
                    inputs = {
                        k: v.to("cuda") if hasattr(v, "to") else v
                        for k, v in inputs.items()
                    }

                # Generate
                gen_kwargs = {
                    "max_new_tokens": max_new_tokens,
                    "num_beams": num_beams,
                    "temperature": temperature,
                    "top_p": top_p,
                }
                with torch.inference_mode():
                    generated_ids = model.generate(**inputs, **gen_kwargs)

                # Decode
                generated_ids_trimmed = [
                    out_ids[len(in_ids) :]
                    for in_ids, out_ids in zip(inputs["input_ids"], generated_ids)
                ]
                outputs = processor.batch_decode(
                    generated_ids_trimmed,
                    skip_special_tokens=True,
                    clean_up_tokenization_spaces=False,
                )
                cap = outputs[0].strip()

            else:  # Florence2
                # Map human-friendly styles to Florence-2 tasks for robustness
                if caption_style and caption_style.lower() in ("brief", "detailed"):
                    prompt = "<CAPTION>" if caption_style.lower() == "brief" else "<DETAILED_CAPTION>"
                else:
                    prompt = caption_style or "<DETAILED_CAPTION>"
                inputs = processor(
                    text=prompt, images=img, return_tensors="pt", do_rescale=False
                ).to(device, torch_dtype)
                generated_ids = model.generate(
                    input_ids=inputs["input_ids"],
                    pixel_values=inputs["pixel_values"],
                    max_new_tokens=max_new_tokens,
                    num_beams=num_beams,
                    temperature=temperature if temperature > 0 else None,
                    use_cache=False,
                )
                generated_text = processor.batch_decode(
                    generated_ids, skip_special_tokens=False
                )[0]
                parsed = processor.post_process_generation(
                    generated_text, task=prompt, image_size=img.size
                )
                cap = parsed[prompt].replace("The image shows ", "")

            if concept_sentence:
                cap = f"{concept_sentence} {cap}"
            out.append(cap)

        # Note: We keep models in cache for reuse, so no cleanup here
        # Models will be kept in MODEL_CACHE for subsequent requests

        return {"captions": out}

    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        print(f"Error in caption generation: {e}")
        print(f"Full traceback:\n{error_detail}")
        return JSONResponse(
            {"error": f"Caption generation failed: {str(e)}", "detail": error_detail},
            status_code=500,
        )

def format_file_size(size_bytes: int) -> str:
    """Format file size in human-readable format"""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.1f} PB"

# ---------------------------
# Training endpoints (prepare/start/stop/logs)
# ---------------------------

@app.post("/api/train/prepare")
def api_train_prepare(payload: Dict[str, Any]):
    try:
        ok_utils, msg_utils = ensure_train_utils()
        if not ok_utils:
            return JSONResponse({"ok": False, "message": "training utilities unavailable", "detail": msg_utils}, status_code=500)

        base_model = payload.get("base_model")
        pretrained_path = payload.get("pretrained_path")

        # Normalize common aliases from UI
        if isinstance(base_model, str):
            bm_norm = base_model.strip()
            bm_norm = bm_norm.replace('_', '-')
            low = bm_norm.lower()
            if low in ("flux.1-dev", "flux1-dev", "flux-1-dev", "flux-dev", "flux.1 dev", "black-forest-labs/flux.1-dev"):
                base_model = "flux-dev"
            elif low in ("flux.1-schnell", "flux1-schnell", "flux-1-schnell", "flux-schnell", "schnell", "black-forest-labs/flux.1-schnell"):
                base_model = "flux-schnell"
            else:
                base_model = bm_norm

        lora_name = payload.get("lora_name") or "MyLoRA"
        output_name = lora_name
        resolution = int(payload.get("resolution", 512))
        seed = int(payload.get("seed", 42))
        workers = int(payload.get("workers", 2))
        learning_rate = str(payload.get("learning_rate", "8e-4"))
        network_dim = int(payload.get("network_dim", 4))
        blocks_to_swap = payload.get("blocks_to_swap")
        try:
            blocks_to_swap = None if blocks_to_swap is None or blocks_to_swap == "" else int(blocks_to_swap)
        except Exception:
            blocks_to_swap = None
        network_alpha = payload.get("network_alpha")
        try:
            network_alpha = float(network_alpha) if network_alpha is not None else None
        except Exception:
            network_alpha = None
        # Flux LoRA-specific dropouts
        rank_dropout = payload.get("rank_dropout")
        module_dropout = payload.get("module_dropout")
        try:
            rank_dropout = float(rank_dropout) if rank_dropout is not None else None
        except Exception:
            rank_dropout = None
        try:
            module_dropout = float(module_dropout) if module_dropout is not None else None
        except Exception:
            module_dropout = None
        max_train_epochs = int(payload.get("max_train_epochs", 16))
        save_every_n_epochs = int(payload.get("save_every_n_epochs", 4))
        timestep_sampling = str(payload.get("timestep_sampling", "shift"))
        guidance_scale = float(payload.get("guidance_scale", 1.0))
        vram = payload.get("vram", "20G")
        force_highvram = bool(payload.get("high_vram", False))
        sample_prompts = payload.get("sample_prompts", "")
        sample_every_n_steps = int(payload.get("sample_every_n_steps", 0))
        class_tokens = payload.get("class_tokens", "")
        num_repeats = int(payload.get("num_repeats", 10))
        train_batch_size = int(payload.get("train_batch_size", 1))
        advanced_flags = payload.get("advanced_components", [])
        # New optional training params
        lr_scheduler = payload.get("lr_scheduler")
        lr_warmup_steps = payload.get("lr_warmup_steps")
        noise_offset = payload.get("noise_offset")
        network_dropout = payload.get("network_dropout")
        flip_aug = bool(payload.get("flip_aug", False))
        # Bucketing options
        enable_bucket = bool(payload.get("enable_bucket", True))
        min_bucket_reso = payload.get("min_bucket_reso")
        max_bucket_reso = payload.get("max_bucket_reso")
        bucket_reso_steps = payload.get("bucket_reso_steps")
        bucket_no_upscale = bool(payload.get("bucket_no_upscale", False))
        resize_interpolation = payload.get("resize_interpolation")
        try:
            min_bucket_reso = int(min_bucket_reso) if min_bucket_reso is not None else None
        except Exception:
            min_bucket_reso = None
        try:
            max_bucket_reso = int(max_bucket_reso) if max_bucket_reso is not None else None
        except Exception:
            max_bucket_reso = None
        try:
            bucket_reso_steps = int(bucket_reso_steps) if bucket_reso_steps is not None else None
        except Exception:
            bucket_reso_steps = None

        # Cap overly large LoRA rank for given VRAM to avoid OOM
        try:
            vram_norm = str(vram).upper().replace('B','') if isinstance(vram, str) else str(vram)
            cap_map = {"12G": 32, "16G": 64, "20G": 96, "24G": 192}
            cap = cap_map.get(vram_norm)
            if cap is not None and network_dim > cap:
                network_dim = cap
        except Exception:
            pass
        effective_network_dim = network_dim
        # Decide effective blocks_to_swap mirroring gen_sh
        eff_blocks_to_swap = None
        try:
            if isinstance(blocks_to_swap, int):
                eff_blocks_to_swap = blocks_to_swap if blocks_to_swap > 0 else None
            else:
                if vram_norm == "20G":
                    eff_blocks_to_swap = 18  # default on 20G
                elif vram_norm == "24G":
                    eff_blocks_to_swap = None  # default off on 24G to use more VRAM
        except Exception:
            pass

        # Decide sample prompts path ext
        sp_ext = 'txt'
        converted_sample_prompts = None

        def _max_sample_res_for_vram(v: str) -> int | None:
            v = str(v or '').upper().replace('B', '')
            if v.startswith('12'):
                return 512
            if v.startswith('16'):
                return 640
            if v.startswith('20'):
                return 768
            if v.startswith('24'):
                return 768
            return None

        def _round16(x: int) -> int:
            return max(64, (int(x) // 16) * 16)

        def _cap_width_height_in_toml(src: str, max_res: int | None) -> str:
            if not max_res:
                return src
            out_lines: list[str] = []
            for ln in src.replace('\r\n', '\n').replace('\r', '\n').split('\n'):
                s = ln.strip()
                if s.startswith('width') and '=' in s:
                    try:
                        val = int(s.split('=')[1].strip())
                        if val > max_res:
                            ln = f"width = {_round16(max_res)}"
                    except Exception:
                        pass
                elif s.startswith('height') and '=' in s:
                    try:
                        val = int(s.split('=')[1].strip())
                        if val > max_res:
                            ln = f"height = {_round16(max_res)}"
                    except Exception:
                        pass
                out_lines.append(ln)
            return '\n'.join(out_lines)

        def _max_sample_res_for_vram(v: str) -> int | None:
            v = str(v or '').upper().replace('B', '')
            if v.startswith('12'):
                return 512
            if v.startswith('16'):
                return 640
            if v.startswith('20'):
                return 768
            if v.startswith('24'):
                return 768
            return None

        def _round16(x: int) -> int:
            return max(64, (int(x) // 16) * 16)

        def _cap_width_height_in_toml(src: str, max_res: int | None) -> str:
            if not max_res:
                return src
            out_lines: list[str] = []
            for ln in src.replace('\r\n', '\n').replace('\r', '\n').split('\n'):
                s = ln.strip()
                if s.startswith('width') and '=' in s:
                    try:
                        val = int(s.split('=')[1].strip())
                        if val > max_res:
                            ln = f"width = {_round16(max_res)}"
                    except Exception:
                        pass
                elif s.startswith('height') and '=' in s:
                    try:
                        val = int(s.split('=')[1].strip())
                        if val > max_res:
                            ln = f"height = {_round16(max_res)}"
                    except Exception:
                        pass
                out_lines.append(ln)
            return '\n'.join(out_lines)
        if isinstance(sample_prompts, str):
            sps = sample_prompts.strip()
            if sps.startswith('[[prompt]]'):
                # Our UI may send a simple TOML array-of-tables format ([[prompt]] ...)
                # sd-scripts expects [prompt] with [[prompt.subset]] entries.
                # Convert here to avoid runtime errors in load_prompts.
                sp_ext = 'toml'

                def _convert_simple_prompt_toml(src: str) -> str:
                    lines = src.replace('\r\n', '\n').replace('\r', '\n').split('\n')
                    blocks: list[list[str]] = []
                    current: list[str] | None = None
                    for ln in lines:
                        s = ln.strip()
                        if not s:
                            continue
                        if s.startswith('[[prompt]]'):
                            if current:
                                blocks.append(current)
                            current = []
                            continue
                        # collect k = v lines only
                        if '=' in s and not s.startswith('#'):
                            if current is None:
                                current = []
                            current.append(s)
                    if current:
                        blocks.append(current)
                    # Build target TOML
                    out: list[str] = []
                    out.append('[prompt]')
                    for blk in blocks:
                        out.append('')
                        out.append('[[prompt.subset]]')
                        out.extend(blk)
                    out.append('')
                    return '\n'.join(out)

                try:
                    converted_sample_prompts = _cap_width_height_in_toml(
                        _rename_text_key_in_toml(_convert_simple_prompt_toml(sps)), _max_sample_res_for_vram(vram)
                    )
                except Exception:
                    # Fall back to original text if conversion fails
                    converted_sample_prompts = _cap_width_height_in_toml(
                        _rename_text_key_in_toml(sps), _max_sample_res_for_vram(vram)
                    )
            elif sps.startswith('[prompt]') or '[[prompt.subset]]' in sps:
                sp_ext = 'toml'
                converted_sample_prompts = _cap_width_height_in_toml(
                    _rename_text_key_in_toml(sps), _max_sample_res_for_vram(vram)
                )
            elif sps.startswith('{') or sps.startswith('['):
                sp_ext = 'json'
        sp_path = tu_resolve_path_without_quotes(f"outputs/{output_name}/sample_prompts.{sp_ext}")

        sh_text = tu_gen_sh(
            base_model,
            output_name,
            resolution,
            seed,
            workers,
            learning_rate,
            network_dim,
            network_alpha,
            # advanced
            max_train_epochs,
            save_every_n_epochs,
            timestep_sampling,
            guidance_scale,
            vram,
            sample_prompts,
            sample_every_n_steps,
            advanced_flags,
            lr_scheduler,
            lr_warmup_steps,
            noise_offset,
            network_dropout,
            rank_dropout,
            module_dropout,
            pretrained_path,
            payload.get('sample_sampler'),
            sp_path,
            blocks_to_swap_override=eff_blocks_to_swap,
            force_highvram=force_highvram,
        )
        dataset_folder = payload.get("dataset_folder") or f"datasets/{output_name}"
        toml_text = tu_gen_toml(
            dataset_folder,
            resolution,
            class_tokens,
            num_repeats,
            train_batch_size,
            flip_aug,
            enable_bucket,
            min_bucket_reso,
            max_bucket_reso,
            bucket_reso_steps,
            bucket_no_upscale,
            resize_interpolation,
        )

        out_dir = tu_resolve_path_without_quotes(f"outputs/{output_name}")
        os.makedirs(out_dir, exist_ok=True)
        file_type = "bat" if os.name == "nt" else "sh"
        sh_path = tu_resolve_path_without_quotes(f"outputs/{output_name}/train.{file_type}")
        # Override handled directly inside gen_sh when pretrained_path is provided
        with open(sh_path, "w", encoding="utf-8") as f:
            f.write(sh_text)
        ds_path = tu_resolve_path_without_quotes(f"outputs/{output_name}/dataset.toml")
        with open(ds_path, "w", encoding="utf-8") as f:
            f.write(toml_text)
        # Write sample prompts with chosen extension
        with open(sp_path, "w", encoding="utf-8") as f:
            if converted_sample_prompts is not None:
                f.write(converted_sample_prompts)
            else:
                f.write(sample_prompts)

        run_id = str(uuid.uuid4())
        RUNS[run_id] = {
            "status": "prepared",
            "logs": [],
            "output_name": output_name,
            "base_model": base_model,
            "sh_path": sh_path,
            "pretrained_path": pretrained_path,
        }
        return {
            "ok": True,
            "run_id": run_id,
            "output_name": output_name,
            "sh_path": sh_path,
            "script": sh_text,
            "dataset": toml_text,
            "effective_network_dim": effective_network_dim,
            "blocks_to_swap": eff_blocks_to_swap or 0,
        }
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print("[ERROR] /api/train/prepare failed:\n", tb)
        return JSONResponse({"ok": False, "error": str(e), "trace": tb}, status_code=500)

@app.post("/api/train/prepare-upload")
async def api_train_prepare_upload(
    base_model: str = Form(...),
    lora_name: str = Form(...),
    resolution: int = Form(512),
    seed: int = Form(42),
    workers: int = Form(2),
    learning_rate: str = Form("8e-4"),
    network_dim: int = Form(4),
    network_alpha: float | None = Form(None),
    blocks_to_swap: Optional[int] = Form(None),
    rank_dropout: float | None = Form(None),
    module_dropout: float | None = Form(None),
    max_train_epochs: int = Form(16),
    save_every_n_epochs: int = Form(4),
    timestep_sampling: str = Form("shift"),
    guidance_scale: float = Form(1.0),
    vram: str = Form("20G"),
    high_vram: Optional[bool] = Form(False),
    sample_prompts: str = Form(""),
    sample_every_n_steps: int = Form(0),
    sample_sampler: Optional[str] = Form(None),
    class_tokens: str = Form(""),
    num_repeats: int = Form(10),
    train_batch_size: int = Form(1),
    dataset_folder: Optional[str] = Form(None),
    pretrained_path: Optional[str] = Form(None),
    # Advanced options (optional)
    lr_scheduler: Optional[str] = Form(None),
    lr_warmup_steps: Optional[float] = Form(None),
    noise_offset: Optional[float] = Form(None),
    flip_aug: Optional[bool] = Form(False),
    # Bucketing options
    enable_bucket: Optional[bool] = Form(True),
    min_bucket_reso: Optional[int] = Form(256),
    max_bucket_reso: Optional[int] = Form(1024),
    bucket_reso_steps: Optional[int] = Form(32),
    bucket_no_upscale: Optional[bool] = Form(False),
    resize_interpolation: Optional[str] = Form(None),
    network_dropout: Optional[float] = Form(None),
    captions: str = Form("[]"),
    images: List[UploadFile] = File(None),
):
    try:
        ok_utils, msg_utils = ensure_train_utils()
        if not ok_utils:
            return JSONResponse({"ok": False, "message": "training utilities unavailable", "detail": msg_utils}, status_code=500)
        ok_utils, msg_utils = ensure_train_utils()
        if not ok_utils:
            return JSONResponse({"ok": False, "message": "training utilities unavailable", "detail": msg_utils}, status_code=500)
        # Determine dataset folder
        output_name = lora_name
        ds_folder = dataset_folder or f"datasets/{output_name}"
        ds_abs = tu_resolve_path_without_quotes(ds_folder) if tu_resolve_path_without_quotes else str((ROOT / ds_folder))
        os.makedirs(ds_abs, exist_ok=True)

        # Save uploaded images + captions
        try:
            caps = json.loads(captions or "[]")
        except Exception:
            caps = []
        if images:
            for idx, uf in enumerate(images):
                content = await uf.read()
                fname = uf.filename or f"img_{idx}.png"
                out_path = Path(ds_abs) / fname
                with open(out_path, 'wb') as f:
                    f.write(content)
                # Write caption sidecar
                cap_text = ''
                if idx < len(caps):
                    cap_text = str(caps[idx] or '')
                full_caption = f"{class_tokens} {cap_text}".strip()
                with open(out_path.with_suffix('.txt'), 'w') as tf:
                    tf.write(full_caption)

        # Decide sample prompts path ext
        sp_ext = 'txt'
        converted_sample_prompts = None
        if isinstance(sample_prompts, str):
            sps = sample_prompts.strip()
            if sps.startswith('[[prompt]]'):
                sp_ext = 'toml'

                def _convert_simple_prompt_toml(src: str) -> str:
                    lines = src.replace('\r\n', '\n').replace('\r', '\n').split('\n')
                    blocks: list[list[str]] = []
                    current: list[str] | None = None
                    for ln in lines:
                        s = ln.strip()
                        if not s:
                            continue
                        if s.startswith('[[prompt]]'):
                            if current:
                                blocks.append(current)
                            current = []
                            continue
                        if '=' in s and not s.startswith('#'):
                            if current is None:
                                current = []
                            current.append(s)
                    if current:
                        blocks.append(current)
                    out: list[str] = []
                    out.append('[prompt]')
                    for blk in blocks:
                        out.append('')
                        out.append('[[prompt.subset]]')
                        out.extend(blk)
                    out.append('')
                    return '\n'.join(out)

                try:
                    converted_sample_prompts = _cap_width_height_in_toml(
                        _rename_text_key_in_toml(_convert_simple_prompt_toml(sps)), _max_sample_res_for_vram(vram)
                    )
                except Exception:
                    converted_sample_prompts = _cap_width_height_in_toml(
                        _rename_text_key_in_toml(sps), _max_sample_res_for_vram(vram)
                    )
            elif sps.startswith('[prompt]') or '[[prompt.subset]]' in sps:
                sp_ext = 'toml'
                converted_sample_prompts = _cap_width_height_in_toml(
                    _rename_text_key_in_toml(sps), _max_sample_res_for_vram(vram)
                )
            elif sps.startswith('{') or sps.startswith('['):
                sp_ext = 'json'
        sp_path = tu_resolve_path_without_quotes(f"outputs/{lora_name}/sample_prompts.{sp_ext}")

        # Build payload
        payload = {
            "base_model": base_model,
            "lora_name": lora_name,
            "resolution": resolution,
            "seed": seed,
            "workers": workers,
            "learning_rate": learning_rate,
            "network_dim": network_dim,
            "network_alpha": network_alpha,
            "rank_dropout": rank_dropout,
            "module_dropout": module_dropout,
            "max_train_epochs": max_train_epochs,
            "save_every_n_epochs": save_every_n_epochs,
            "timestep_sampling": timestep_sampling,
            "guidance_scale": guidance_scale,
            "vram": vram,
            "high_vram": bool(high_vram),
            "sample_prompts": sample_prompts,
            "sample_every_n_steps": sample_every_n_steps,
            "class_tokens": class_tokens,
            "num_repeats": num_repeats,
            "train_batch_size": train_batch_size,
            "dataset_folder": ds_folder,
        }
        if blocks_to_swap is not None:
            payload["blocks_to_swap"] = blocks_to_swap
        if pretrained_path:
            payload["pretrained_path"] = pretrained_path
        if lr_scheduler is not None:
            payload["lr_scheduler"] = lr_scheduler
        if lr_warmup_steps is not None:
            payload["lr_warmup_steps"] = lr_warmup_steps
        if noise_offset is not None:
            payload["noise_offset"] = noise_offset
        if flip_aug is not None:
            payload["flip_aug"] = flip_aug
        if network_dropout is not None:
            payload["network_dropout"] = network_dropout
        # Bucketing
        if enable_bucket is not None:
            payload["enable_bucket"] = enable_bucket
        if min_bucket_reso is not None:
            payload["min_bucket_reso"] = min_bucket_reso
        if max_bucket_reso is not None:
            payload["max_bucket_reso"] = max_bucket_reso
        if bucket_reso_steps is not None:
            payload["bucket_reso_steps"] = bucket_reso_steps
        if bucket_no_upscale is not None:
            payload["bucket_no_upscale"] = bucket_no_upscale
        if resize_interpolation is not None:
            payload["resize_interpolation"] = resize_interpolation
        # Normalize VRAM alias
        if isinstance(payload.get("vram"), str):
            vr = str(payload["vram"]).upper().replace("B", "")
            payload["vram"] = vr

        # Write prompts file now for upload path as well
        try:
            os.makedirs(os.path.dirname(sp_path), exist_ok=True)
            with open(sp_path, 'w', encoding='utf-8') as f:
                if converted_sample_prompts is not None:
                    f.write(converted_sample_prompts)
                else:
                    f.write(sample_prompts or '')
        except Exception:
            pass
        if sample_sampler is not None:
            payload["sample_sampler"] = sample_sampler
        # Inject prompts path override via advanced flag in prepare path
        res = api_train_prepare({ **payload, "_sample_prompts_path": sp_path })
        return res
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print("[ERROR] /api/train/prepare-upload failed:\n", tb)
        return JSONResponse({"ok": False, "error": str(e), "trace": tb}, status_code=500)


def _stream_process(proc: subprocess.Popen, run_id: str):
    try:
        # Read text lines until EOF
        for line in iter(proc.stdout.readline, ""):
            RUNS[run_id]["logs"].append(line)
        proc.wait()
        code = proc.returncode
        RUNS[run_id]["status"] = "finished" if code == 0 else f"error:{code}"
    except Exception as e:
        RUNS[run_id]["status"] = f"error:{e}"


@app.post("/api/train/start")
def api_train_start(payload: Dict[str, Any]):
    run_id = payload.get("run_id")
    run = RUNS.get(run_id)
    if not run:
        return JSONResponse({"ok": False, "message": "invalid run_id"}, status_code=400)
    # Optionally download base model assets if we recognize the key
    try:
        # If a custom pretrained path is provided, skip any base model download
        if not run.get("pretrained_path") and tu_download and tu_load_models_yaml and isinstance(run.get("base_model"), str):
            models = tu_load_models_yaml()
            if run["base_model"] in models:
                tu_download(run["base_model"])
    except Exception as e:
        return {"ok": False, "message": f"download failed: {e}"}
    sh_path = run["sh_path"]
    cmd = sh_path if os.name == "nt" else f'bash "{sh_path}"'
    # Ensure our virtualenv bin is on PATH so 'accelerate' is found
    env_vars = dict(os.environ)
    env_vars["PYTHONIOENCODING"] = "utf-8"
    env_vars["LOG_LEVEL"] = "DEBUG"
    # Reduce fragmentation-related OOMs per PyTorch docs
    env_vars.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
    venv_bin = (ROOT / "venv" / "bin")
    alt_env_bin = (ROOT / "env" / "bin")
    path_parts = []
    if venv_bin.exists():
        env_vars["VIRTUAL_ENV"] = str(ROOT / "venv")
        path_parts.append(str(venv_bin))
    if alt_env_bin.exists():
        env_vars.setdefault("VIRTUAL_ENV", str(ROOT / "env"))
        path_parts.append(str(alt_env_bin))
    path_parts.append(env_vars.get("PATH", ""))
    env_vars["PATH"] = os.pathsep.join(path_parts)

    # Start process with a new session so we can terminate group on stop
    proc = subprocess.Popen(
        cmd,
        cwd=str(ROOT),
        shell=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=env_vars,
        bufsize=1,
        text=True,
        encoding="utf-8",
        errors="ignore",
        start_new_session=True,
    )
    run["status"] = "running"
    run["started_at"] = time.time()
    run["proc"] = proc
    threading.Thread(target=_stream_process, args=(proc, run_id), daemon=True).start()
    return {"ok": True, "run_id": run_id}


@app.post("/api/train/stop")
def api_train_stop(payload: Dict[str, Any]):
    run_id = payload.get("run_id")
    run = RUNS.get(run_id)
    if not run:
        return JSONResponse({"ok": False, "message": "invalid run_id"}, status_code=400)
    proc: subprocess.Popen = run.get("proc")  # type: ignore
    if not proc:
        return {"ok": False, "message": "no process"}
    try:
        if os.name != "nt":
            import signal
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        else:
            proc.terminate()
        run["status"] = "stopping"
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "message": str(e)}


@app.get("/api/train/logs")
def api_train_logs(run_id: str):
    run = RUNS.get(run_id)
    if not run:
        return JSONResponse({"ok": False, "message": "invalid run_id"}, status_code=400)
    return {
        "ok": True,
        "status": run.get("status"),
        "logs": "".join(run.get("logs", []))[-20000:],
    }


@app.get("/api/train/logs/download")
def api_train_logs_download(run_id: str):
    run = RUNS.get(run_id)
    if not run:
        return JSONResponse({"ok": False, "message": "invalid run_id"}, status_code=400)
    text = "".join(run.get("logs", []))
    from fastapi.responses import PlainTextResponse
    headers = {"Content-Disposition": f'attachment; filename="train_{run_id}.log"'}
    return PlainTextResponse(text, headers=headers)

@app.get("/api/train/active")
def api_train_active():
    runs = []
    for rid, info in RUNS.items():
        status = info.get("status")
        if status in ("prepared", "running", "stopping"):
            runs.append({
                "run_id": rid,
                "status": status,
                "output_name": info.get("output_name"),
                "base_model": info.get("base_model"),
                "started_at": info.get("started_at"),
            })
    return {"ok": True, "runs": runs}

if __name__ == "__main__":
    import uvicorn
    import sys
    
    # Get port from command line argument or default to 8888
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8888
    print(f"Starting server on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port)
