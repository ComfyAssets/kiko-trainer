1. Install (CUDA/PyTorch + Qwen2.5-VL stack)

# 1) PyTorch (pick the CUDA build matching your driver)

# See https://pytorch.org/get-started/locally/ for the exact command if needed.

pip install --upgrade torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# 2) Transformers + Accelerate (Qwen2.5-VL landed in recent Transformers)

pip install --upgrade "transformers>=4.51.3" accelerate

# 3) Qwen vision utils (helps pack images for the model)

pip install "qwen-vl-utils[decord]==0.0.8" # decord is optional but faster for video

# If decord fails on mac/Windows: pip install qwen-vl-utils

# 4) Optional: bitsandbytes for 4-bit loading (saves VRAM if you ever need it)

pip install bitsandbytes

Why these bits:

Qwen’s model card shows Qwen2_5_VLForConditionalGeneration + AutoProcessor and the qwen_vl_utils.process_vision_info helper for assembling inputs; it also suggests FlashAttention 2 for extra speed/memory if you like.
Hugging Face

The official docs confirm Qwen2.5-VL support in recent transformers and describe the model sizes (3B/7B/72B).
Hugging Face
+1

If you ever need 4-bit or 8-bit quant to save VRAM, community guides show bitsandbytes works well with Qwen2.5-VL.
Medium
Hugging Face

2. Full Python script (folder → captions.jsonl + captions.csv)

Reads all images from --input.

Presets: brief (short one-liner), detailed (good default), ultra (max context).

Neutral, factual style (no moral judgment; if nude, describe matter-of-factly).

Deterministic decoding by default (num_beams, temperature=0).

Adjustable visual token budget via --min-pixels/--max-pixels (Qwen supports min/max to balance detail vs. speed).
Hugging Face

Run example:

python qwen25_vl_captioner.py \
 --model Qwen/Qwen2.5-VL-7B-Instruct \
 --input /path/to/images \
 --output /path/to/out \
 --preset detailed \
 --num-beams 5 --max-new-tokens 192

#!/usr/bin/env python3

# qwen25_vl_captioner.py

# Batch caption images with Qwen2.5-VL for LoRA training datasets.

import argparse
import json
import os
from pathlib import Path
from typing import List, Dict

import torch
from transformers import AutoProcessor
from transformers import Qwen2_5_VLForConditionalGeneration # class name from model card
from qwen_vl_utils import process_vision_info
from PIL import Image
import csv

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"}

PRESET_TO_PROMPT = { # Keep the tone neutral and factual. Useful for character LoRA training.
"brief": (
"Provide a concise, neutral, single-sentence caption of this image focused on the person, "
"pose, visible clothing or absence of clothing, facial attributes, and setting."
),
"detailed": (
"Provide a detailed, neutral training caption for this image. "
"Describe the subject (a single person), apparent age/adultness, hair, facial features, "
"pose and body orientation, visible clothing or state of undress (if nude, describe factually), "
"hands/feet visibility, camera perspective and framing, lighting, background elements, "
"and overall style (photo/painting/sculpture). Avoid judgments; be objective."
),
"ultra": (
"Provide an ultra-detailed, neutral training caption. Include subject (single person), "
"apparent adultness, body posture, head tilt, gaze direction, hand/foot placement, "
"visible clothing/fabrics or state of undress (if nude, describe factually without moral terms), "
"hair style/color, facial features, makeup, accessories, tattoos/scars, camera angle and lens feel "
"(e.g., close-up/medium/full body; top/eye/low angle), composition, lighting, color palette, "
"background/scene context, medium (photo/painting/sculpture), and any notable aesthetic style."
),
}

def find_images(root: Path) -> List[Path]:
files = []
for p in sorted(root.rglob("\*")):
if p.is_file() and p.suffix.lower() in IMAGE_EXTS:
files.append(p)
return files

def make_messages(image_path: str, text_prompt: str) -> List[Dict]: # Qwen2.5-VL expects a "messages" structure (chat-style) with image+text. :contentReference[oaicite:4]{index=4}
return [{
"role": "user",
"content": [
{"type": "image", "image": f"file://{image_path}"},
{"type": "text", "text": text_prompt},
],
}]

def main():
ap = argparse.ArgumentParser()
ap.add_argument("--model", default="Qwen/Qwen2.5-VL-7B-Instruct", help="HF model id")
ap.add_argument("--input", required=True, help="Folder with images")
ap.add_argument("--output", required=True, help="Output folder (will be created)")
ap.add_argument("--preset", choices=list(PRESET_TO_PROMPT.keys()), default="detailed")
ap.add_argument("--prompt", default=None, help="Custom prompt (overrides preset)")
ap.add_argument("--max-new-tokens", type=int, default=160)
ap.add_argument("--num-beams", type=int, default=4)
ap.add_argument("--temperature", type=float, default=0.0)
ap.add_argument("--top-p", type=float, default=1.0)
ap.add_argument("--min-pixels", type=int, default=None, help="e.g., 256*28*28")
ap.add_argument("--max-pixels", type=int, default=None, help="e.g., 1280*28*28")
ap.add_argument("--device", default="cuda", choices=["cuda", "cpu"])
ap.add_argument("--attn", default=None, choices=[None, "flash_attention_2"],
help="flash_attention_2 can save memory on long inputs")
ap.add_argument("--load-in-4bit", action="store_true",
help="Optional: load model in 4-bit (requires bitsandbytes)")
args = ap.parse_args()

    in_dir = Path(args.input)
    out_dir = Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)

    images = find_images(in_dir)
    if not images:
        print(f"No images found under: {in_dir}")
        return

    # Configure processor with optional min/max pixel budget. :contentReference[oaicite:5]{index=5}
    processor_kwargs = {}
    if args.min_pixels is not None and args.max_pixels is not None:
        processor_kwargs = {"min_pixels": args.min_pixels, "max_pixels": args.max_pixels}

    print("Loading processor…")
    processor = AutoProcessor.from_pretrained(args.model, **processor_kwargs)

    print("Loading model… (this can take a bit)")
    model_kwargs = {
        "torch_dtype": torch.bfloat16 if torch.cuda.is_available() else "auto",
        "device_map": "auto" if args.device == "cuda" else None,
    }
    if args.attn:
        model_kwargs["attn_implementation"] = args.attn  # suggested in model card :contentReference[oaicite:6]{index=6}
    if args.load_in_4bit:
        # Optional 4-bit quantization to save VRAM; needs bitsandbytes installed. :contentReference[oaicite:7]{index=7}
        model_kwargs.update({
            "load_in_4bit": True,
            "bnb_4bit_compute_dtype": torch.bfloat16 if torch.cuda.is_available() else torch.float32,
        })

    model = Qwen2_5_VLForConditionalGeneration.from_pretrained(args.model, **model_kwargs)

    # Output files
    jsonl_path = out_dir / "captions.jsonl"
    csv_path   = out_dir / "captions.csv"

    # Pick prompt
    if args.prompt:
        base_prompt = args.prompt
    else:
        base_prompt = PRESET_TO_PROMPT[args.preset]

    # CSV writer
    csv_f = open(csv_path, "w", newline="", encoding="utf-8")
    csv_w = csv.writer(csv_f)
    csv_w.writerow(["filename", "preset", "caption"])

    # Batch over images
    with open(jsonl_path, "w", encoding="utf-8") as jout:
        for idx, img_path in enumerate(images, 1):
            img_path = img_path.resolve()
            try:
                # Validate image can open (helps catch corrupt files)
                Image.open(img_path).verify()
            except Exception as e:
                print(f"[{idx}/{len(images)}] Skipping unreadable image: {img_path.name} ({e})")
                continue

            messages = make_messages(str(img_path), base_prompt)

            # Build chat template + vision inputs (per Qwen usage). :contentReference[oaicite:8]{index=8}
            text = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
            image_inputs, video_inputs = process_vision_info(messages)
            inputs = processor(
                text=[text],
                images=image_inputs,
                videos=video_inputs,
                padding=True,
                return_tensors="pt",
            )

            if args.device == "cuda" and torch.cuda.is_available():
                inputs = {k: v.to("cuda") if hasattr(v, "to") else v for k, v in inputs.items()}

            # Deterministic, high-precision decoding by default (beam search).
            gen_kwargs = {
                "max_new_tokens": args.max_new_tokens,
                "num_beams": args.num_beams,
                "temperature": args.temperature,
                "top_p": args.top_p,
            }
            with torch.inference_mode():
                generated_ids = model.generate(**inputs, **gen_kwargs)

            # Strip the input prompt ids to get only the generation.
            generated_ids_trimmed = [
                out_ids[len(in_ids):] for in_ids, out_ids in zip(inputs["input_ids"], generated_ids)
            ]
            outputs = processor.batch_decode(
                generated_ids_trimmed, skip_special_tokens=True, clean_up_tokenization_spaces=False
            )
            caption = outputs[0].strip()

            rec = {"filename": img_path.name, "preset": args.preset if not args.prompt else "custom", "caption": caption}
            jout.write(json.dumps(rec, ensure_ascii=False) + "\n")
            csv_w.writerow([img_path.name, rec["preset"], caption])

            print(f"[{idx}/{len(images)}] {img_path.name} -> {caption[:100]}{'…' if len(caption)>100 else ''}")

    csv_f.close()
    print(f"\nWrote: {jsonl_path}")
    print(f"Wrote: {csv_path}")
    print("Done.")

if **name** == "**main**":
main()

Notes on quality & speed

Detail vs. cost: Increase --max-new-tokens and --num-beams for richer descriptions. For massive batches, you can reduce --max-new-tokens or use --min/max-pixels to cap visual tokens (Qwen exposes this explicitly).
Hugging Face

FlashAttention 2: Add --attn flash_attention_2 for memory/speed benefits; it’s recommended by the model card.
Hugging Face

4-bit mode: Add --load-in-4bit if you ever need to squeeze VRAM; accuracy usually remains strong for captioning.
Medium
Hugging Face

Style control: You can tweak the prompt to bias for camera terms (“three-quarter view, shallow DOF, rim lighting”), anatomy terms (for hands/feet focus), or painting/sculpture vocabulary for ancient art.

3. Model choices (which Qwen2.5-VL to pull)

Default (recommended): Qwen/Qwen2.5-VL-7B-Instruct — strong accuracy, fits comfortably on a 4090, widely used. The model card includes a complete “chat+vision” quickstart and pixel-budget tips.
Hugging Face
