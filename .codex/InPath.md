# Hexus 내부 경로 색인

경로는 이 패키지 루트 기준. 노드별 기능과 코드 연결은 `Nodes.md` 참조.

```text
ComfyUI-Hexus/
├── AGENTS.md             작업 지침
├── __init__.py           노드 등록·표시 이름, 웹 확장 등록
├── Hexus.py              노드 클래스와 실행 코드
├── HexLoraStackPreview.py  LoRA 목록·프리뷰·Civitai HTTP 경로
├── web/
│   ├── HexLatent.js      HexLatent 해상도 프리셋 UI
│   ├── HexHighres.js     HexHighres IMAGE/LATENT 입력핀 연결 제어
│   ├── HexLoraStack.js   HexLoraStack 행·선택·정보 UI
│   └── HexPrompt.js      HexPrompt 블록·자동완성·시드 UI
└── .codex/
    ├── InPath.md         이 파일
    ├── OutPath.md        외부 커스텀 노드 패키지 경로
    └── Nodes.md          Hexus 노드·코드 색인
```

`.git/`, `__pycache__/` 등 생성·관리 디렉터리는 생략.
