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
    network_alpha: float | None,
    max_train_epochs,
    save_every_n_epochs,
    timestep_sampling,
    guidance_scale,
    vram,
    sample_prompts,
    sample_every_n_steps,
    advanced_flags=None,
    lr_scheduler: str | None = None,
    lr_warmup_steps: float | int | None = None,
    noise_offset: float | None = None,
    network_dropout: float | None = None,
    rank_dropout: float | None = None,
    module_dropout: float | None = None,
    pretrained_override: str | None = None,
):
    output_dir = resolve_path(f"outputs/{output_name}")
    sample_prompts_path = resolve_path(f"outputs/{output_name}/sample_prompts.txt")

    line_break = "\\" if os.name != 'nt' else "^"
    file_type = "sh" if os.name != 'nt' else "bat"

    sample_flags = []
    if sample_prompts and sample_every_n_steps and int(sample_every_n_steps) > 0:
        sample_flags.append(f"--sample_prompts {sample_prompts_path}")
        sample_flags.append(f"--sample_every_n_steps {sample_every_n_steps}")

    optimizer_flags = []
    if vram == "16G":
        optimizer_flags = [
            "--optimizer_type adafactor",
            "--optimizer_args \"relative_step=False\" \"scale_parameter=False\" \"warmup_init=False\"",
            f"--lr_scheduler {lr_scheduler or 'constant_with_warmup'}",
            "--max_grad_norm 0.0",
        ]
    elif vram == "12G":
        optimizer_flags = [
            "--optimizer_type adafactor",
            "--optimizer_args \"relative_step=False\" \"scale_parameter=False\" \"warmup_init=False\"",
            "--split_mode",
            "--network_args \"train_blocks=single\"",
            f"--lr_scheduler {lr_scheduler or 'constant_with_warmup'}",
            "--max_grad_norm 0.0",
        ]
    else:
        optimizer_flags = ["--optimizer_type adamw8bit"]

    # Resolve pretrained UNet path purely from user-provided selection; avoid models.yaml
    def _resolve_pretrained(pth: str | None) -> str:
        if not pth and isinstance(base_model, str):
            pth = base_model
        if pth:
            # absolute or relative to ROOT
            abs_path = pth if os.path.isabs(pth) else os.path.normpath(os.path.join(ROOT, pth))
            if os.path.exists(abs_path):
                return resolve_path(os.path.relpath(abs_path, ROOT))
        # Try to find by name under BASE_MODELS_DIR recursively
        if isinstance(base_model, str):
            target = base_model.lower()
            for dirpath, _, filenames in os.walk(BASE_MODELS_DIR):
                for fn in filenames:
                    if target in fn.lower():
                        cand = os.path.join(dirpath, fn)
                        return resolve_path(os.path.relpath(cand, ROOT))
        raise ValueError("Pretrained model path not provided or not found. Select a local model in the UI.")

    pretrained_model_path = _resolve_pretrained(pretrained_override)

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

    # Build argument list and join with proper continuations
    args: list[str] = []
    args.append("accelerate launch")
    args.append("--mixed_precision bf16")
    args.append("--num_cpu_threads_per_process 1")
    args.append("sd-scripts/flux_train_network.py")
    args.append(f"--pretrained_model_name_or_path {pretrained_model_path}")
    args.append(f"--clip_l {clip_path}")
    args.append(f"--t5xxl {t5_path}")
    args.append(f"--ae {ae_path}")
    args.append("--cache_latents_to_disk")
    args.append("--save_model_as safetensors")
    args.append("--sdpa")
    args.append("--persistent_data_loader_workers")
    args.append(f"--max_data_loader_n_workers {workers}")
    args.append(f"--seed {seed}")
    args.append("--gradient_checkpointing")
    args.append("--mixed_precision bf16")
    args.append("--save_precision bf16")
    args.append("--network_module networks.lora_flux")
    args.append(f"--network_dim {network_dim}")
    if network_alpha is not None:
        args.append(f"--network_alpha {network_alpha}")
    args.extend(optimizer_flags)
    args.extend(sample_flags)
    args.append(f"--learning_rate {learning_rate}")
    if lr_scheduler and vram not in ("12G", "16G"):
        args.append(f"--lr_scheduler {lr_scheduler}")
    if lr_warmup_steps is not None:
        args.append(f"--lr_warmup_steps {lr_warmup_steps}")
    args.append("--cache_text_encoder_outputs")
    args.append("--cache_text_encoder_outputs_to_disk")
    args.append("--fp8_base")
    args.append("--highvram")
    args.append(f"--max_train_epochs {max_train_epochs}")
    args.append(f"--save_every_n_epochs {save_every_n_epochs}")
    args.append(f"--dataset_config {resolve_path(f'outputs/{output_name}/dataset.toml')}")
    args.append(f"--output_dir {output_dir}")
    args.append(f"--output_name {output_name}")
    args.append(f"--timestep_sampling {timestep_sampling}")
    args.append("--discrete_flow_shift 3.1582")
    args.append("--model_prediction_type raw")
    args.append(f"--guidance_scale {guidance_scale}")
    args.append("--loss_type l2")
    if noise_offset is not None:
        args.append(f"--noise_offset {noise_offset}")
    if network_dropout is not None:
        args.append(f"--network_dropout {network_dropout}")
    if rank_dropout is not None:
        args.append(f"--network_args \"rank_dropout={rank_dropout}\"")
    if module_dropout is not None:
        args.append(f"--network_args \"module_dropout={module_dropout}\"")

    sh = " \\\n  ".join(args) + "\n"

    # Final cleanup: ensure no trailing continuation dangling at EOF
    sh = sh.rstrip()
    if sh.endswith(line_break):
        sh = sh[: -len(line_break)]
    sh += "\n"

    if advanced_flags:
        advanced_flags_str = f" {line_break}\n  ".join(advanced_flags)
        sh = sh + "\n  " + advanced_flags_str
    return sh



def gen_toml(
    dataset_folder,
    resolution,
    class_tokens,
    num_repeats,
    train_batch_size: int = 1,
    flip_aug: bool = False,
    enable_bucket: bool | None = True,
    min_bucket_reso: int | None = 256,
    max_bucket_reso: int | None = 1024,
    bucket_reso_steps: int | None = 64,
    bucket_no_upscale: bool | None = False,
    resize_interpolation: str | None = None,
):
    lines: list[str] = []
    lines.append('[general]')
    lines.append('shuffle_caption = false')
    lines.append("caption_extension = '.txt'")
    lines.append('keep_tokens = 1')

    lines.append('')
    lines.append('[[datasets]]')
    lines.append(f'resolution = {resolution}')
    lines.append(f'batch_size = {train_batch_size}')
    lines.append('keep_tokens = 1')
    if enable_bucket:
        lines.append('enable_bucket = true')
        if min_bucket_reso is not None:
            lines.append(f'min_bucket_reso = {int(min_bucket_reso)}')
        if max_bucket_reso is not None:
            lines.append(f'max_bucket_reso = {int(max_bucket_reso)}')
        if bucket_reso_steps is not None:
            lines.append(f'bucket_reso_steps = {int(bucket_reso_steps)}')
        if bucket_no_upscale:
            lines.append('bucket_no_upscale = true')
    if resize_interpolation:
        lines.append(f"resize_interpolation = '{resize_interpolation}'")

    lines.append('')
    lines.append('[[datasets.subsets]]')
    lines.append(f"image_dir = '{resolve_path_without_quotes(dataset_folder)}'")
    lines.append(f"class_tokens = '{class_tokens}'")
    lines.append(f'num_repeats = {num_repeats}')
    lines.append(f'flip_aug = {str(bool(flip_aug)).lower()}')

    return '\n'.join(lines) + '\n'


def get_loras():
    try:
        outputs_path = resolve_path_without_quotes("outputs")
        files = os.listdir(outputs_path)
        folders = [os.path.join(outputs_path, item) for item in files if os.path.isdir(os.path.join(outputs_path, item)) and item != "sample"]
        folders.sort(key=lambda file: os.path.getctime(file), reverse=True)
        return folders
    except Exception:
        return []
