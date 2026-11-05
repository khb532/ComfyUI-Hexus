import json
import math
import os
import secrets

import folder_paths
import latent_preview
import torch
import comfy.model_management
from comfy.cli_args import args
from nodes import CLIPTextEncode, ConditioningConcat, InpaintModelConditioning, KSampler, LatentUpscaleBy, LoadImage, LoraLoader, MAX_RESOLUTION, VAEDecode, VAEEncode


class HexPrompt:
    def __init__(self):
        self.last_wildcard_seed = None

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "clip": ("CLIP",),
                "text": ("STRING", {"multiline": True, "default": "", "dynamicPrompts": False}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
                "last_seed_fix": ("BOOLEAN", {"default": False, "label_on": "On", "label_off": "Off"}),
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

    @classmethod
    def IS_CHANGED(cls, last_seed_fix, seed=0, **kwargs):
        return seed if last_seed_fix else secrets.randbelow(1125899906842624)

    def encode(self, clip, text, seed, last_seed_fix=False, blocks="[]", block_enabled="[]", **kwargs):
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
        if last_seed_fix:
            wildcard_seed = seed or self.last_wildcard_seed or secrets.randbelow(1125899906842624)
        else:
            wildcard_seed = secrets.randbelow(1125899906842624)
        self.last_wildcard_seed = wildcard_seed
        try:
            from impact import wildcards
            processed_text = wildcards.process(source, wildcard_seed)
            clip_text = wildcards.remove_lora_tags(processed_text)
            parts = [part.strip() for part in clip_text.split("BREAK") if part.strip()] or [""]
        except Exception:
            processed_text = source
            parts = [source]

        conditioning = CLIPTextEncode().encode(clip, parts[0])[0]
        for part in parts[1:]:
            next_conditioning = CLIPTextEncode().encode(clip, part)[0]
            conditioning = ConditioningConcat().concat(conditioning, next_conditioning)[0]
        return {"ui": {"hexus_seed": [str(wildcard_seed)]},
                "result": (conditioning, processed_text)}


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


class HexParam:
    @classmethod
    def INPUT_TYPES(cls):
        sampler = KSampler.INPUT_TYPES()["required"]
        seed_options = {key: value for key, value in sampler["seed"][1].items()
                        if key not in ("tooltip", "control_after_generate")}
        seed_options.update({"default": -1, "min": -1})
        cfg_options = {key: value for key, value in sampler["cfg"][1].items() if key != "tooltip"}
        cfg_options["step"] = 0.5
        denoise_options = {key: value for key, value in sampler["denoise"][1].items() if key != "tooltip"}
        denoise_options.update({"default": 1, "step": 0.05, "round": 0.01})
        return {"required": {
            "sampler": (sampler["sampler_name"][0],),
            "scheduler": (sampler["scheduler"][0],),
            "steps": ("INT", {key: value for key, value in sampler["steps"][1].items() if key != "tooltip"}),
            "cfg": ("FLOAT", cfg_options),
            "denoise": ("FLOAT", denoise_options),
            "seed": ("INT", seed_options),
        }}

    RETURN_TYPES = ("HEX_PARAM_CONTEXT", "INT", "INT", "FLOAT", "FLOAT",
                    KSampler.INPUT_TYPES()["required"]["sampler_name"][0],
                    KSampler.INPUT_TYPES()["required"]["scheduler"][0])
    RETURN_NAMES = ("context", "STEPS", "SEED", "CFG", "DENOISE", "SAMPLER", "SCHEDULER")
    FUNCTION = "get_params"
    CATEGORY = "Hexus"

    @classmethod
    def IS_CHANGED(cls, seed, **kwargs):
        return secrets.randbelow(1125899906842624) if seed == -1 else seed

    def get_params(self, steps, seed, cfg, sampler, scheduler, denoise=1.0):
        if seed == -1:
            seed = secrets.randbelow(1125899906842624)
        context = {"steps": steps, "seed": seed, "cfg": cfg, "sampler": sampler,
                   "scheduler": scheduler, "denoise": denoise}
        return (context, steps, seed, cfg, denoise, sampler, scheduler)


class HexSampler:
    @classmethod
    def INPUT_TYPES(cls):
        sampler = KSampler.INPUT_TYPES()["required"]
        latent = HexLatent.INPUT_TYPES()["required"]
        input_dir = folder_paths.get_input_directory()
        images = sorted(folder_paths.filter_files_content_types(
            [name for name in os.listdir(input_dir) if os.path.isfile(os.path.join(input_dir, name))],
            ["image"]))
        seed_options = {key: value for key, value in sampler["seed"][1].items()
                        if key not in ("tooltip", "control_after_generate")}
        seed_options.update({"default": -1, "min": -1})
        cfg_options = {key: value for key, value in sampler["cfg"][1].items() if key != "tooltip"}
        cfg_options["step"] = 0.5
        denoise_options = {key: value for key, value in sampler["denoise"][1].items() if key != "tooltip"}
        denoise_options.update({"default": 1, "step": 0.05, "round": 0.01})
        width_options = {key: value for key, value in latent["width"][1].items() if key != "tooltip"}
        height_options = {key: value for key, value in latent["height"][1].items() if key != "tooltip"}
        width_options["default"] = height_options["default"] = 1024
        return {
            "required": {
                "model": ("MODEL",),
                "positive": ("CONDITIONING",),
                "negative": ("CONDITIONING",),
                "vae": ("VAE",),
                "mode": (["t2i", "i2i", "Inpaint"],),
                "sampler": (sampler["sampler_name"][0],),
                "scheduler": (sampler["scheduler"][0],),
                "steps": ("INT", {key: value for key, value in sampler["steps"][1].items() if key != "tooltip"}),
                "cfg": ("FLOAT", cfg_options),
                "denoise": ("FLOAT", denoise_options),
                "seed": ("INT", seed_options),
                "width": ("INT", width_options),
                "height": ("INT", height_options),
                "batch_size": ("INT", {key: value for key, value in latent["batch_size"][1].items() if key != "tooltip"}),
                "image": (["", *images], {"image_upload": True}),
            },
            "optional": {"step_preview": ("BOOLEAN", {"default": False})},
        }

    RETURN_TYPES = ("IMAGE", "LATENT")
    RETURN_NAMES = ("IMAGE", "LATENT")
    FUNCTION = "sample"
    CATEGORY = "Hexus"

    @classmethod
    def IS_CHANGED(cls, mode, seed, image="", **kwargs):
        current_seed = secrets.randbelow(1125899906842624) if seed == -1 else seed
        image_hash = LoadImage.IS_CHANGED(image) if mode in ("i2i", "Inpaint") and image else ""
        return f"{current_seed}:{image_hash}"

    @classmethod
    def VALIDATE_INPUTS(cls, mode, image=""):
        if mode not in ("t2i", "i2i", "Inpaint"):
            return "Hex Sampler: choose t2i, i2i, or Inpaint"
        if mode in ("i2i", "Inpaint"):
            if not image:
                return "Hex Sampler: select an image for i2i or Inpaint"
            return LoadImage.VALIDATE_INPUTS(image)
        return True

    def sample(self, model, positive, negative, vae, mode, sampler, scheduler, steps,
               cfg, denoise, seed, width, height, batch_size, image="", step_preview=False):
        if seed == -1:
            seed = secrets.randbelow(1125899906842624)
        if mode == "t2i":
            source = HexLatent().generate(width, height, batch_size)[0]
        else:
            if not image:
                raise ValueError("Hex Sampler: select an image for i2i or Inpaint")
            pixels, image_mask = LoadImage().load_image(image)
            if mode == "i2i":
                source = VAEEncode().encode(vae, pixels)[0]
            elif mode == "Inpaint":
                if not torch.any(image_mask > 0):
                    raise ValueError("Hex Sampler: paint a mask on the selected image for Inpaint")
                positive, negative, source = InpaintModelConditioning().encode(
                    positive, negative, pixels, vae, image_mask)
            else:
                raise ValueError(f"Hex Sampler: unknown mode {mode}")

        previous_preview_method = args.preview_method
        latent_preview.set_preview_method("auto" if step_preview else "none")
        try:
            sampled = KSampler().sample(model, seed, steps, cfg, sampler, scheduler,
                                        positive, negative, source, denoise)[0]
        finally:
            args.preview_method = previous_preview_method
        return (VAEDecode().decode(vae, sampled)[0], sampled)


class HexHighres:
    @classmethod
    def INPUT_TYPES(cls):
        sampler = KSampler.INPUT_TYPES()["required"]
        upscale = LatentUpscaleBy.INPUT_TYPES()["required"]
        scale_by = (upscale["scale_by"][0], {**upscale["scale_by"][1], "step": 0.5})
        cfg = (sampler["cfg"][0], {**sampler["cfg"][1], "step": 0.5})
        denoise = (sampler["denoise"][0], {**sampler["denoise"][1], "step": 0.05})
        return {
            "required": {
                "model": sampler["model"],
                "positive": sampler["positive"],
                "negative": sampler["negative"],
                "vae": ("VAE",),
                "upscale_method": upscale["upscale_method"],
                "scale_by": scale_by,
                "seed": sampler["seed"],
                "steps": sampler["steps"],
                "cfg": cfg,
                "sampler_name": sampler["sampler_name"],
                "scheduler": sampler["scheduler"],
                "denoise": denoise,
            },
            "optional": {
                "image": ("IMAGE",),
                "latent": ("LATENT",),
            },
        }

    RETURN_TYPES = ("IMAGE", "LATENT")
    RETURN_NAMES = ("image", "latent")
    FUNCTION = "generate"
    CATEGORY = "Hexus"

    def generate(self, model, positive, negative, vae, upscale_method, scale_by,
                 seed, steps, cfg, sampler_name, scheduler, denoise, image=None, latent=None):
        if (image is None) == (latent is None):
            raise ValueError("Hex Highres: connect exactly one of image or latent")
        source = VAEEncode().encode(vae, image)[0] if image is not None else latent
        enlarged = LatentUpscaleBy().upscale(source, upscale_method, scale_by)[0]
        sampled = KSampler().sample(model, seed, steps, cfg, sampler_name, scheduler,
                                    positive, negative, enlarged, denoise)[0]
        result = VAEDecode().decode(vae, sampled)[0]
        return (result, sampled)


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
