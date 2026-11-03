# 외부 커스텀 노드 패키지 경로 색인

이 프로젝트의 상위 폴더 `../`는 ComfyUI의 `custom_nodes` 디렉터리다. 사용자가 패키지 이름을 말하면 아래 이름을 단서로 해당 폴더를 찾고, 실제 파일과 구현은 그때 확인한다. 설치 목록은 바뀔 수 있으므로 이 문서는 현재 위치를 찾기 위한 색인이다.

| 패키지 폴더 | 상대 경로 |
| --- | --- |
| anima-artist-mixer | `../anima-artist-mixer/` |
| comfyui_birefnet_ll | `../comfyui_birefnet_ll/` |
| comfyui_controlnet_aux | `../comfyui_controlnet_aux/` |
| comfyui_ultimatesdupscale | `../comfyui_ultimatesdupscale/` |
| comfyui-custom-scripts | `../comfyui-custom-scripts/` |
| comfyui-easyuse-anima | `../comfyui-easyuse-anima/` |
| ComfyUI-Image-Saver | `../ComfyUI-Image-Saver/` |
| ComfyUI-ImageGallery-ED | `../ComfyUI-ImageGallery-ED/` |
| comfyui-impact-pack | `../comfyui-impact-pack/` |
| comfyui-impact-subpack | `../comfyui-impact-subpack/` |
| comfyui-kjnodes | `../comfyui-kjnodes/` |
| comfyui-lora-manager | `../comfyui-lora-manager/` |
| comfyui-manager | `../comfyui-manager/` |
| comfyui-spectrum-ksampler | `../comfyui-spectrum-ksampler/` |
| efficiency-nodes-comfyui | `../efficiency-nodes-comfyui/` |
| efficiency-nodes-ED | `../efficiency-nodes-ED/` |
| rgthree-comfy | `../rgthree-comfy/` |

패키지 이름의 대소문자나 하이픈 표기가 다르면 상위 폴더에서 다시 검색한다. `__pycache__`와 현재 프로젝트 `ComfyUI-Hexus`는 외부 패키지 목록에서 제외했다.
