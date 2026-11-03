# 노드 코드 색인

등록/표시 이름: `__init__.py`. 노드 실행 코드: `Hexus.py`.

| 내부 ID (표시 이름) | 기능 | 추가 코드 위치 |
| --- | --- | --- |
| `HexPrompt` (Hex Prompt) | 프롬프트 블록 ON/OFF, Impact 와일드카드, CLIP 인코딩, 텍스트 출력 | `web/HexPrompt.js`: 블록 UI·자동완성·시드 UI |
| `HexLoraStack` (Hex LoraStack) | LoRA 다중 적용, MODEL/CLIP 강도 | `web/HexLoraStack.js`: 행·선택 그리드·정보 UI; `HexLoraStackPreview.py`: LoRA 목록·프리뷰·Civitai API |
| `HexLatent` (Hex Latent) | 빈 LATENT 생성 | `web/HexLatent.js`: 해상도 프리셋 |
| `HexTest` (Hex Test) | 개발용 CLIP 통과 | 없음 |
