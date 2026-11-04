import asyncio
import os
import shutil

import folder_paths
from aiohttp import web
from PIL import Image
from nodes import PreviewImage
from server import PromptServer


class HexImage:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
                "filename_prefix": ("STRING", {"default": "%date:yyyy-MM-dd%/%date:MM-dd%"}),
            },
            "hidden": {"prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO"},
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "preview"
    OUTPUT_NODE = True
    CATEGORY = "Hexus"

    def preview(self, images, filename_prefix, prompt=None, extra_pnginfo=None):
        # The temporary PNG is the preview and the source for an explicit Save click.
        return PreviewImage().save_images(images, prompt=prompt, extra_pnginfo=extra_pnginfo)


def preview_path(item):
    if not isinstance(item, dict) or item.get("type") != "temp":
        raise ValueError("Only temporary preview images can be saved")
    filename = item.get("filename", "")
    subfolder = item.get("subfolder", "")
    if not isinstance(filename, str) or os.path.basename(filename) != filename or not filename.lower().endswith(".png"):
        raise ValueError("Invalid preview filename")
    if not isinstance(subfolder, str):
        raise ValueError("Invalid preview subfolder")
    relative = os.path.join(subfolder, filename) if subfolder else filename
    path = folder_paths.get_annotated_filepath(f"{relative} [temp]")
    if not os.path.isfile(path):
        raise FileNotFoundError("Preview image is no longer available")
    return path


def save_previews(items, filename_prefix):
    if not isinstance(items, list) or not items or not isinstance(filename_prefix, str):
        raise ValueError("Preview images and filename prefix are required")
    sources = [preview_path(item) for item in items]
    with Image.open(sources[0]) as image:
        width, height = image.size
    folder, filename, counter, subfolder, _ = folder_paths.get_save_image_path(
        filename_prefix, folder_paths.get_output_directory(), width, height)
    saved = []
    for batch_number, source in enumerate(sources):
        batch_name = filename.replace("%batch_num%", str(batch_number))
        while True:
            name = f"{batch_name}_{counter:05}_.png"
            try:
                with open(os.path.join(folder, name), "xb") as destination, open(source, "rb") as preview:
                    shutil.copyfileobj(preview, destination)
                break
            except FileExistsError:
                counter += 1
        saved.append({"filename": name, "subfolder": subfolder, "type": "output"})
        counter += 1
    return saved


@PromptServer.instance.routes.post("/hexus/preview-save")
async def save_preview_route(request):
    try:
        payload = await request.json()
        saved = await asyncio.to_thread(save_previews, payload.get("images"), payload.get("filename_prefix"))
    except (FileNotFoundError, OSError, ValueError, TypeError) as error:
        raise web.HTTPBadRequest(text=str(error)) from error
    return web.json_response({"images": saved})
