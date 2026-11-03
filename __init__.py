from .Hexus import HexusTest, LatentRatio, LoraModule, PromptEncode
from . import preview


NODE_CLASS_MAPPINGS = {
    "HexusTest": HexusTest,
    "LatentRatio": LatentRatio,
    "LoraModule": LoraModule,
    "PromptEncode": PromptEncode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "HexusTest": "HexusTest",
    "LatentRatio": "Latent Ratio",
    "LoraModule": "Lora Module",
    "PromptEncode": "Prompt Encode",
}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]

WEB_DIRECTORY = "./web"

