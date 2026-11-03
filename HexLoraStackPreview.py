import asyncio
import hashlib
from io import BytesIO
from pathlib import Path
from urllib.parse import urljoin, urlparse

import aiohttp
from aiohttp import web
import folder_paths
from PIL import Image
from server import PromptServer


@PromptServer.instance.routes.get("/hexus/loras/list")
async def lora_list(request):
    return web.json_response(folder_paths.get_filename_list("loras"), headers={"Cache-Control": "no-store"})


@PromptServer.instance.routes.get("/hexus/loras/preview")
async def lora_preview(request):
    name = request.query.get("name", "")
    path = lora_path(name)
    previews = [path.with_suffix(suffix) for suffix in (".preview.png", ".preview.jpg", ".preview.jpeg", ".preview.webp")]
    for image_path in sorted((image for image in previews if image.is_file()), key=lambda image: image.stat().st_mtime_ns, reverse=True):
        return web.FileResponse(image_path)
    for suffix in (".png", ".jpg", ".jpeg", ".webp"):
        image_path = path.with_suffix(suffix)
        if image_path.is_file():
            return web.FileResponse(image_path)
    raise web.HTTPNotFound()


def lora_path(name):
    if name not in folder_paths.get_filename_list("loras"):
        raise web.HTTPNotFound(text="LoRA not found")
    return Path(folder_paths.get_full_path_or_raise("loras", name))


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def civitai_image_url(url):
    parsed = urlparse(url)
    host = parsed.hostname or ""
    if parsed.scheme != "https" or not (host == "civitai.com" or host.endswith(".civitai.com")):
        raise web.HTTPBadRequest(text="Invalid Civitai image URL")
    return url


def preview_suffix(data):
    try:
        with Image.open(BytesIO(data)) as image:
            suffix = {"PNG": ".preview.png", "JPEG": ".preview.jpeg", "WEBP": ".preview.webp"}.get(image.format)
            if not suffix:
                raise web.HTTPBadGateway(text="Unsupported preview image format")
            image.verify()
        with Image.open(BytesIO(data)) as image:
            image.load()
        return suffix
    except (OSError, ValueError) as error:
        raise web.HTTPBadGateway(text="Downloaded preview image is incomplete or invalid") from error


@PromptServer.instance.routes.post("/hexus/loras/info")
async def lora_info(request):
    name = (await request.json()).get("name", "")
    path = lora_path(name)
    digest = await asyncio.to_thread(sha256_file, path)
    url = f"https://civitai.com/api/v1/model-versions/by-hash/{digest}"
    timeout = aiohttp.ClientTimeout(total=30)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.get(url) as response:
            if response.status == 404:
                raise web.HTTPNotFound(text="LoRA not found on Civitai")
            if response.status != 200:
                raise web.HTTPBadGateway(text=f"Civitai returned {response.status}")
            data = await response.json()
    return web.json_response({
        "name": (data.get("model") or {}).get("name") or path.stem,
        "version": data.get("name", ""),
        "base_model": data.get("baseModel", ""),
        "trained_words": data.get("trainedWords", []),
        "images": [image["url"] for image in data.get("images", []) if image.get("type") != "video" and image.get("url")],
    })


@PromptServer.instance.routes.post("/hexus/loras/save-preview")
async def save_lora_preview(request):
    payload = await request.json()
    path = lora_path(payload.get("name", ""))
    url = civitai_image_url(payload.get("url", ""))
    timeout = aiohttp.ClientTimeout(total=30)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        for _ in range(5):
            async with session.get(url, allow_redirects=False) as response:
                if response.status in (301, 302, 303, 307, 308):
                    location = response.headers.get("Location")
                    if not location:
                        raise web.HTTPBadGateway(text="Image redirect has no location")
                    url = civitai_image_url(urljoin(url, location))
                    continue
                if response.status != 200:
                    raise web.HTTPBadGateway(text=f"Image download returned {response.status}")
                chunks = []
                size = 0
                async for chunk in response.content.iter_chunked(64 * 1024):
                    size += len(chunk)
                    if size > 10 * 1024 * 1024:
                        raise web.HTTPBadGateway(text="Preview image is too large")
                    chunks.append(chunk)
                data = b"".join(chunks)
                suffix = await asyncio.to_thread(preview_suffix, data)
                break
        else:
            raise web.HTTPBadGateway(text="Too many image redirects")
    target = path.with_suffix(suffix)
    await asyncio.to_thread(target.write_bytes, data)
    return web.json_response({"saved": target.name})
