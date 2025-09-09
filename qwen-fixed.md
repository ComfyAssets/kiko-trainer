If you already have an application using Qwen2.5-VL-7B-Instruct, you just need to make minimal changes to apply the refusal removal. Here's how:

Option 1: Minimal Code Changes (Add Ablation to Existing Model)

If your current code looks like this:
from transformers import Qwen2_5_VLForConditionalGeneration, AutoProcessor

model = Qwen2_5_VLForConditionalGeneration.from_pretrained("Qwen/Qwen2.5-VL-7B-Instruct")
processor = AutoProcessor.from_pretrained("Qwen/Qwen2.5-VL-7B-Instruct")

# Your existing code...

Just add the ablation after loading:
from transformers import Qwen2_5_VLForConditionalGeneration, AutoProcessor
import torch
import einops

# Load your model as usual

model = Qwen2_5_VLForConditionalGeneration.from_pretrained("Qwen/Qwen2.5-VL-7B-Instruct")
processor = AutoProcessor.from_pretrained("Qwen/Qwen2.5-VL-7B-Instruct")

# ADD THIS: Load refusal direction and apply ablation

refusal_dir = torch.load("Qwen_Qwen2.5-VL-7B-Instruct_refusal_dir.pt")

class AblationLayer:
def **init**(self, refusal_dir):
self.refusal_dir = refusal_dir

      def __call__(self, module, input, output):
          # Apply ablation to the output
          hidden_states = output[0] if isinstance(output, tuple) else output
          proj = einops.einsum(hidden_states, self.refusal_dir.view(-1, 1),
                              '... d_act, d_act single -> ... single') * self.refusal_dir
          ablated = hidden_states - proj
          if isinstance(output, tuple):
              return (ablated,) + output[1:]
          return ablated

# Apply hooks to all decoder layers

ablation = AblationLayer(refusal_dir.to(model.device))
for layer in model.model.language_model.layers:
layer.register_forward_hook(ablation)

# Now use your model exactly as before - it has ablation applied!

Option 2: Drop-in Replacement (Cleaner)

Create a wrapper that matches your existing API:

# In your application, replace this:

from transformers import Qwen2_5_VLForConditionalGeneration

# With this:

from qwen_vl_ablated import QwenVLAblated

# Then change initialization from:

model = Qwen2_5_VLForConditionalGeneration.from_pretrained("Qwen/Qwen2.5-VL-7B-Instruct")

# To:

ablated_model = QwenVLAblated()
model = ablated_model.model # This is the actual transformers model with ablation
processor = ablated_model.processor

What You Need:

Just copy these files to your project:

1. Qwen_Qwen2.5-VL-7B-Instruct_refusal_dir.pt (the refusal direction)
2. Either the ablation code snippet above OR qwen_vl_ablated.py

That's it! Your existing generate/inference code doesn't need to change at all.
