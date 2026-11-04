# 노드 코드 색인

등록/표시 이름: `__init__.py`. 노드 실행 코드: `Hexus.py`.

| 내부 ID (표시 이름) | 기능 | 추가 코드 위치 |
| --- | --- | --- |
| `HexPrompt` (Hex Prompt) | 프롬프트 블록 ON/OFF, Impact 와일드카드(미설치·오류 시 원문), CLIP 인코딩, 텍스트 출력 | `web/HexPrompt.js`: 블록 UI·자동완성·Last Seed Fix 토글 |
| `HexLoraStack` (Hex LoraStack) | LoRA 다중 적용, MODEL/CLIP 강도 | `web/HexLoraStack.js`: 행·선택 그리드·정보 UI; `HexLoraStackPreview.py`: LoRA 목록·프리뷰·Civitai API |
| `HexLatent` (Hex Latent) | 빈 LATENT 생성 | `web/HexLatent.js`: 해상도 프리셋 |
| `HexHighres` (Hex Highres) | IMAGE 또는 LATENT 입력 → LATENT 확대·재샘플링 → IMAGE/LATENT 출력 | `Hexus.py`: 기본 VAE/업스케일/KSampler 호출; `web/HexHighres.js`: 입력핀 상호 배타 연결 |
| `HexParam` (Hex Param) | 샘플러·스케줄러·스텝·CFG·디노이즈·시드 위젯 → context 묶음·개별 출력, 시드 버튼 | `Hexus.py`: 파라미터·시드 실행; `web/HexParam.js`: 버튼·대기열 시드·기존 연결 처리 |
| `HexSampler` (Hex Sampler) | t2i/i2i/Inpaint 통합 샘플러·파라미터·해상도 설정 → IMAGE/LATENT 출력, Hex Image 토글에 따른 프리뷰 연산 | `Hexus.py`: 모드별 샘플링·임시 프리뷰 설정; `web/HexSampler.js`: 업로드 이미지 유지, 프리뷰 상태 전달, 시드·해상도 UI |
| `HexImage` (Hex Image) | IMAGE 미리보기·생성 단계 프리뷰 토글·수동 PNG 저장·IMAGE 출력, i2i/Inpaint 샘플러 전송·마스크 편집 | `HexImage.py`: 임시 미리보기·저장 경로; `web/HexImage.js`: Save·전송·단계별 미리보기 UI |

각 노드의 기본 팔레트 색은 `web/HexNodeColors.js`에서 지정한다.
