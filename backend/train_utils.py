import os
import sys
import yaml
import shutil
import json
from slugify import slugify
from huggingface_hub import hf_hub_download
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
# Base models directory can be overridden by env var to unify with API
BASE_MODELS_DIR = os.environ.get('KIKO_MODELS_DIR', os.path.join(ROOT, 'models'))


def load_models_yaml():
    models_path = os.path.join(ROOT, 'models.yaml')
    with open(models_path, 'r') as f:
        return yaml.safe_load(f)


def resolve_path(p: str) -> str:
    norm_path = os.path.normpath(os.path.join(ROOT, p))
    return f'"{norm_path}"'


def resolve_path_without_quotes(p: str) -> str:
    norm_path = os.path.normpath(os.path.join(ROOT, p))
    return norm_path


def resize_image(image_path: str, output_path: str, size: int):
    with Image.open(image_path) as img:
        width, height = img.size
        if width < height:
            new_width = size
            new_height = int((size/width) * height)
        else:
            new_height = size
            new_width = int((size/height) * width)
        img_resized = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
        img_resized.save(output_path)


def download(base_model: str):
    models = load_models_yaml()
    model = models[base_model]
    model_file = model["file"]
    repo = model["repo"]

    # download unet
    if base_model in ("flux-dev", "flux-schnell"):
        unet_folder = os.path.join(BASE_MODELS_DIR, "unet")
    else:
        unet_folder = os.path.join(BASE_MODELS_DIR, f"unet/{repo}")
    unet_path = os.path.join(unet_folder, model_file)
    if not os.path.exists(unet_path):
        os.makedirs(unet_folder, exist_ok=True)
        hf_hub_download(repo_id=repo, local_dir=unet_folder, filename=model_file)

    # download vae
    vae_folder = os.path.join(BASE_MODELS_DIR, "vae")
    vae_path = os.path.join(vae_folder, "ae.sft")
    if not os.path.exists(vae_path):
        os.makedirs(vae_folder, exist_ok=True)
        hf_hub_download(repo_id="cocktailpeanut/xulf-dev", local_dir=vae_folder, filename="ae.sft")

    # download clip
    clip_folder = os.path.join(BASE_MODELS_DIR, "clip")
    # Support either nested 'clip/clip_l.safetensors' or top-level 'clip_l.safetensors'
    clip_l_path = os.path.join(clip_folder, "clip_l.safetensors")
    if not os.path.exists(clip_l_path):
        # If top-level exists, don't redownload
        top_level_clip = os.path.join(BASE_MODELS_DIR, "clip_l.safetensors")
        if not os.path.exists(top_level_clip):
            os.makedirs(clip_folder, exist_ok=True)
            hf_hub_download(repo_id="comfyanonymous/flux_text_encoders", local_dir=clip_folder, filename="clip_l.safetensors")

    # download t5xxl
    t5xxl_path = os.path.join(clip_folder, "t5xxl_fp16.safetensors")
    if not os.path.exists(t5xxl_path):
        top_level_t5 = os.path.join(BASE_MODELS_DIR, "t5xxl_fp16.safetensors")
        if not os.path.exists(top_level_t5):
            hf_hub_download(repo_id="comfyanonymous/flux_text_encoders", local_dir=clip_folder, filename="t5xxl_fp16.safetensors")


def gen_sh(
    base_model,
    output_name,
    resolution,
    seed,
    workers,
    learning_rate,
    network_dim,
    max_train_epochs,
    save_every_n_epochs,
    timestep_sampling,
    guidance_scale,
    vram,
    sample_prompts,
    sample_every_n_steps,
    advanced_flags=None,
):
    output_dir = resolve_path(f"outputs/{output_name}")
    sample_prompts_path = resolve_path(f"outputs/{output_name}/sample_prompts.txt")

    line_break = "\\" if os.name != 'nt' else "^"
    file_type = "sh" if os.name != 'nt' else "bat"

    sample = ""
    if sample_prompts and sample_every_n_steps and int(sample_every_n_steps) > 0:
        sample = f"--sample_prompts={sample_prompts_path} --sample_every_n_steps=\"{sample_every_n_steps}\" {line_break}"

    if vram == "16G":
        optimizer = f"""--optimizer_type adafactor {line_break}
  --optimizer_args \"relative_step=False\" \"scale_parameter=False\" \"warmup_init=False\" {line_break}
  --lr_scheduler constant_with_warmup {line_break}
  --max_grad_norm 0.0 {line_break}"""
    elif vram == "12G":
        optimizer = f"""--optimizer_type adafactor {line_break}
  --optimizer_args \"relative_step=False\" \"scale_parameter=False\" \"warmup_init=False\" {line_break}
  --split_mode {line_break}
  --network_args \"train_blocks=single\" {line_break}
  --lr_scheduler constant_with_warmup {line_break}
  --max_grad_norm 0.0 {line_break}"""
    else:
        optimizer = f"--optimizer_type adamw8bit {line_break}"

    models = load_models_yaml()
    model_config = models[base_model]
    model_file = model_config["file"]
    repo = model_config["repo"]
    if base_model in ("flux-dev", "flux-schnell"):
        model_folder = os.path.join(BASE_MODELS_DIR, "unet")
    else:
        model_folder = os.path.join(BASE_MODELS_DIR, f"unet/{repo}")
    model_path = os.path.join(model_folder, model_file)
    pretrained_model_path = resolve_path(os.path.relpath(model_path, ROOT))

    # Resolve component paths with fallbacks (nested subfolders vs top-level files)
    def _first_existing(paths):
        for p in paths:
            if os.path.exists(p):
                return p
        return paths[0]

    clip_abs = _first_existing([
        os.path.join(BASE_MODELS_DIR, "clip/clip_l.safetensors"),
        os.path.join(BASE_MODELS_DIR, "clip_l.safetensors"),
    ])
    t5_abs = _first_existing([
        os.path.join(BASE_MODELS_DIR, "clip/t5xxl_fp16.safetensors"),
        os.path.join(BASE_MODELS_DIR, "t5xxl_fp16.safetensors"),
    ])
    ae_abs = _first_existing([
        os.path.join(BASE_MODELS_DIR, "vae/ae.sft"),
        os.path.join(BASE_MODELS_DIR, "ae.sft"),
    ])

    clip_path = resolve_path(os.path.relpath(clip_abs, ROOT))
    t5_path = resolve_path(os.path.relpath(t5_abs, ROOT))
    ae_path = resolve_path(os.path.relpath(ae_abs, ROOT))

    sh = f"""accelerate launch {line_break}
  --mixed_precision bf16 {line_break}
  --num_cpu_threads_per_process 1 {line_break}
  sd-scripts/flux_train_network.py {line_break}
  --pretrained_model_name_or_path {pretrained_model_path} {line_break}
  --clip_l {clip_path} {line_break}
  --t5xxl {t5_path} {line_break}
  --ae {ae_path} {line_break}
  --cache_latents_to_disk {line_break}
  --save_model_as safetensors {line_break}
  --sdpa --persistent_data_loader_workers {line_break}
  --max_data_loader_n_workers {workers} {line_break}
  --seed {seed} {line_break}
  --gradient_checkpointing {line_break}
  --mixed_precision bf16 {line_break}
  --save_precision bf16 {line_break}
  --network_module networks.lora_flux {line_break}
  --network_dim {network_dim} {line_break}
  {optimizer}{sample}
  --learning_rate {learning_rate} {line_break}
  --cache_text_encoder_outputs {line_break}
  --cache_text_encoder_outputs_to_disk {line_break}
  --fp8_base {line_break}
  --highvram {line_break}
  --max_train_epochs {max_train_epochs} {line_break}
  --save_every_n_epochs {save_every_n_epochs} {line_break}
  --dataset_config {resolve_path(f"outputs/{output_name}/dataset.toml")} {line_break}
  --output_dir {output_dir} {line_break}
  --output_name {output_name} {line_break}
  --timestep_sampling {timestep_sampling} {line_break}
  --discrete_flow_shift 3.1582 {line_break}
  --model_prediction_type raw {line_break}
  --guidance_scale {guidance_scale} {line_break}
  --loss_type l2 {line_break}"""

    # Remove trailing line continuation to avoid passing a stray '\\' arg
    sh = sh.rstrip()
    if sh.endswith(line_break):
        sh = sh[: -len(line_break)]
    sh += "\n"

    if advanced_flags:
        advanced_flags_str = f" {line_break}\n  ".join(advanced_flags)
        sh = sh + "\n  " + advanced_flags_str
    return sh


def gen_toml(dataset_folder, resolution, class_tokens, num_repeats, train_batch_size: int = 1):
    return f"""[general]
shuffle_caption = false
caption_extension = '.txt'
keep_tokens = 1

[[datasets]]
resolution = {resolution}
batch_size = {train_batch_size}
keep_tokens = 1

[[datasets.subsets]]
image_dir = '{resolve_path_without_quotes(dataset_folder)}'
class_tokens = '{class_tokens}'
num_repeats = {num_repeats}
"""


def get_loras():
    try:
        outputs_path = resolve_path_without_quotes("outputs")
        files = os.listdir(outputs_path)
        folders = [os.path.join(outputs_path, item) for item in files if os.path.isdir(os.path.join(outputs_path, item)) and item != "sample"]
        folders.sort(key=lambda file: os.path.getctime(file), reverse=True)
        return folders
    except Exception:
        return []
