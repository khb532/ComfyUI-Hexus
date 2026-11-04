from .Hexus import HexLatent, HexLoraStack, HexPrompt, HexHighres, HexParam, HexSampler
from . import HexLoraStackPreview
from .HexImage import HexImage


NODE_CLASS_MAPPINGS = {
    "HexLatent": HexLatent,
    "HexLoraStack": HexLoraStack,
    "HexPrompt": HexPrompt,
    "HexHighres": HexHighres,
    "HexParam": HexParam,
    "HexSampler": HexSampler,
    "HexImage": HexImage,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "HexLatent": "Hex Latent",
    "HexLoraStack": "Hex LoraStack",
    "HexPrompt": "Hex Prompt",
    "HexHighres": "Hex Highres",
    "HexParam": "Hex Param",
    "HexSampler": "Hex Sampler",
    "HexImage": "Hex Image",
}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]

WEB_DIRECTORY = "./web"

