import json
import math

import folder_paths
import torch
import comfy.model_management
from nodes import CLIPTextEncode, ConditioningConcat, LoraLoader, MAX_RESOLUTION


class HexTest:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "clip": ("CLIP",),
                "text": ("STRING", {"multiline": True, "default": ""}),
            }
        }

    RETURN_TYPES = ("CLIP",)
    FUNCTION = "pass_through"
    CATEGORY = "Hexus"

    def pass_through(self, clip, text):
        return (clip,)


class HexPrompt:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "clip": ("CLIP",),
                "text": ("STRING", {"multiline": True, "default": "", "dynamicPrompts": False}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, "control_after_generate": True}),
            },
            "optional": {
                "blocks": ("STRING", {"multiline": True, "default": "[]", "dynamicPrompts": False}),
                "block_enabled": ("STRING", {"default": "[]", "dynamicPrompts": False}),
                "Select to add Wildcard": (["Select the Wildcard to add to the text"],),
            },
        }

    RETURN_TYPES = ("CONDITIONING", "STRING")
    RETURN_NAMES = ("conditioning", "text")
    FUNCTION = "encode"
    CATEGORY = "Hexus"

    def encode(self, clip, text, seed, blocks="[]", block_enabled="[]", **kwargs):
        from impact import wildcards

        extra_blocks = json.loads(blocks)
        if not isinstance(extra_blocks, list) or not all(isinstance(block, str) for block in extra_blocks):
            raise ValueError("Hex Prompt: blocks must be a list of text values")
        enabled = json.loads(block_enabled)
        if not isinstance(enabled, list) or not all(isinstance(value, bool) for value in enabled):
            raise ValueError("Hex Prompt: block_enabled must be a list of booleans")
        source = ",\n".join(
            block for index, block in enumerate([text, *extra_blocks])
            if (index >= len(enabled) or enabled[index]) and block.strip()
        )
        processed_text = wildcards.process(source, seed)
        clip_text = wildcards.remove_lora_tags(processed_text)
        parts = [part.strip() for part in clip_text.split("BREAK") if part.strip()] or [""]
        conditioning = CLIPTextEncode().encode(clip, parts[0])[0]
        for part in parts[1:]:
            next_conditioning = CLIPTextEncode().encode(clip, part)[0]
            conditioning = ConditioningConcat().concat(conditioning, next_conditioning)[0]
        return {
            "ui": {"hexus_seed": [str(seed)]},
            "result": (conditioning, processed_text),
        }


class HexLatent:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "width": ("INT", {"default": 512, "min": 16, "max": MAX_RESOLUTION, "step": 8, "tooltip": "The width of the latent images in pixels."}),
                "height": ("INT", {"default": 512, "min": 16, "max": MAX_RESOLUTION, "step": 8, "tooltip": "The height of the latent images in pixels."}),
                "batch_size": ("INT", {"default": 1, "min": 1, "max": 4096, "tooltip": "The number of latent images in the batch."}),
            }
        }

    RETURN_TYPES = ("LATENT",)
    OUTPUT_TOOLTIPS = ("The empty latent image batch.",)
    FUNCTION = "generate"
    CATEGORY = "Hexus"
    DESCRIPTION = "Create a new batch of empty latent images to be denoised via sampling."

    def generate(self, width, height, batch_size=1):
        latent = torch.zeros([batch_size, 4, height // 8, width // 8], device=comfy.model_management.intermediate_device(), dtype=comfy.model_management.intermediate_dtype())
        return ({"samples": latent, "downscale_ratio_spacial": 8},)


class HexLoraStack:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
                "clip": ("CLIP",),
                "loras": ("STRING", {"default": "[]", "multiline": True}),
                "lora_name": (["None"] + folder_paths.get_filename_list("loras"),),
            },
        }

    RETURN_TYPES = ("MODEL", "CLIP")
    RETURN_NAMES = ("MODEL", "CLIP")
    FUNCTION = "apply"
    CATEGORY = "Hexus"

    def apply(self, model, clip, loras, lora_name="None"):
        try:
            rows = json.loads(loras)
        except (TypeError, ValueError) as error:
            raise ValueError("Hex LoraStack: invalid LoRA row data") from error
        if not isinstance(rows, list):
            raise ValueError("Hex LoraStack: LoRA rows must be a list")

        stack = []
        for index, row in enumerate(rows, 1):
            if not isinstance(row, dict):
                raise ValueError(f"Hex LoraStack: row {index} is invalid")
            if row.get("enabled", True) is False:
                continue
            name = row.get("name")
            if not isinstance(name, str) or not name or name == "None":
                continue
            try:
                model_strength = float(row.get("model_strength", 1.0))
                clip_strength = float(row.get("clip_strength", 1.0))
            except (TypeError, ValueError) as error:
                raise ValueError(f"Hex LoraStack: row {index} has an invalid strength") from error
            if not math.isfinite(model_strength) or not math.isfinite(clip_strength):
                raise ValueError(f"Hex LoraStack: row {index} has an invalid strength")
            if model_strength == 0 and clip_strength == 0:
                continue
            folder_paths.get_full_path_or_raise("loras", name)
            stack.append((name, model_strength, clip_strength))

        loader = LoraLoader()
        for name, model_strength, clip_strength in stack:
            model, clip = loader.load_lora(model, clip, name, model_strength, clip_strength)
        return (model, clip)
