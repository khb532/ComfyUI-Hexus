from .Hexus import HexLatent, HexLoraStack, HexPrompt, HexHighres, HexParam
from . import HexLoraStackPreview


NODE_CLASS_MAPPINGS = {
    "HexLatent": HexLatent,
    "HexLoraStack": HexLoraStack,
    "HexPrompt": HexPrompt,
    "HexHighres": HexHighres,
    "HexParam": HexParam,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "HexLatent": "Hex Latent",
    "HexLoraStack": "Hex LoraStack",
    "HexPrompt": "Hex Prompt",
    "HexHighres": "Hex Highres",
    "HexParam": "Hex Param",
}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]

WEB_DIRECTORY = "./web"

