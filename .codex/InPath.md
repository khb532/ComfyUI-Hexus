# Hexus 내부 경로 색인

경로는 이 패키지 루트 기준. 노드별 기능과 코드 연결은 `Nodes.md` 참조.

```text
ComfyUI-Hexus/
├── AGENTS.md             작업 지침
├── README.md             프로젝트 소개·의존성·라이선스
├── __init__.py           노드 등록·표시 이름, 웹 확장 등록
├── Hexus.py              노드 클래스와 실행 코드
├── HexLoraStackPreview.py  LoRA 목록·프리뷰·Civitai HTTP 경로
├── HexPreviewSave.py  HexPreviewSave 임시 미리보기·수동 저장 경로
├── assets/
│   └── images/         README 노드 이미지
├── web/
│   ├── HexLatent.js      HexLatent 해상도 프리셋 UI
│   ├── HexHighres.js     HexHighres IMAGE/LATENT 입력핀 연결 제어
│   ├── HexParam.js       HexParam 시드 버튼·대기열 시드 처리
│   ├── HexSampler.js     HexSampler 모드·업로드·시드·확대보기·마스크 UI
│   ├── HexPreviewSave.js HexPreviewSave 저장·샘플러 전송 UI
│   ├── HexNodeColors.js   Hexus 노드별 기본 팔레트 색
│   ├── HexLoraStack.js   HexLoraStack 행·선택·정보 UI
│   └── HexPrompt.js      HexPrompt 블록·자동완성·Last Seed Fix UI
└── .codex/
    ├── InPath.md         이 파일
    ├── OutPath.md        외부 커스텀 노드 패키지 경로
    └── Nodes.md          Hexus 노드·코드 색인
```

`.git/`, `__pycache__/` 등 생성·관리 디렉터리는 생략.
