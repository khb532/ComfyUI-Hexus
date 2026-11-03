from .Hexus import HexTest, HexLatent, HexLoraStack, HexPrompt, HexHighres
from . import HexLoraStackPreview


NODE_CLASS_MAPPINGS = {
    "HexTest": HexTest,
    "HexLatent": HexLatent,
    "HexLoraStack": HexLoraStack,
    "HexPrompt": HexPrompt,
    "HexHighres": HexHighres,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "HexTest": "Hex Test",
    "HexLatent": "Hex Latent",
    "HexLoraStack": "Hex LoraStack",
    "HexPrompt": "Hex Prompt",
    "HexHighres": "Hex Highres",
}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]

WEB_DIRECTORY = "./web"

