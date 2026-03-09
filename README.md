[🇺🇸 English](#english) | [🇰🇷 한국어](#한국어)

---

<a id="english"></a>

<h1 align="center">Antigravity Chat Copy</h1>

<p align="center">
  <b>Copy original markdown from Antigravity AI chat conversations.</b><br>
  Browse conversations in the sidebar, open in editor tabs, inspect every step, and copy.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-linux-blue?style=flat-square" alt="Linux">
  <img src="https://img.shields.io/badge/vscode-%5E1.68-blue?style=flat-square&logo=visual-studio-code" alt="VS Code">
  <img src="https://img.shields.io/badge/typescript-5.x-blue?style=flat-square&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License">
</p>

---

## Why?

Antigravity renders chat responses in a closed webview — you can't select or copy the original markdown. This extension connects directly to the local Language Server via ConnectRPC **and** decrypts the on-disk `.pb` trajectory files, giving you the raw content with one click.

## Features

| Feature | Description |
|---------|-------------|
| 🗂️ **Activity Bar** | Dedicated icon in the Activity Bar opens the conversation sidebar |
| 📋 **Sidebar List** | AI-generated conversation titles with relative timestamps |
| 📑 **Editor Tabs** | Click a conversation to open it in an editor tab (multiple tabs supported) |
| 📋 **Copy / Copy All** | Copy any message's original markdown, or the entire conversation |
| 🔍 **Step Details** | Inspect every internal step (thinking, tool calls, code actions, commands, searches) |
| 🏢 **Workspace Filter** | Only shows conversations from the current workspace |
| ⟳ **Refresh** | Refresh button in sidebar title bar; auto-reconnects if LS restarted |
| 💾 **Disk + API** | Loads from encrypted `.pb` files (instant) and API in parallel, picks the source with more steps |
| 🔐 **Auto Key Extraction** | Extracts AES-256-GCM key from LS binary (ELF `.rodata` scan + process memory fallback) |

## Installation

### From Release (recommended)

1. Download the latest `.vsix` from [Releases](https://github.com/Zachary-Lee-Jaeho/Antigravity-Chat-Copy/releases)
2. Install: `Ctrl+Shift+P` → **"Extensions: Install from VSIX…"** → select the file

### From Source

```bash
git clone https://github.com/Zachary-Lee-Jaeho/Antigravity-Chat-Copy.git
cd Antigravity-Chat-Copy
npm install
npm run compile
npx @vscode/vsce package --no-dependencies
# Install the generated .vsix
```

## Usage

1. Open any project in Antigravity
2. Click the **Chat Copy** icon in the Activity Bar (left sidebar), or press `Ctrl+Shift+M`
3. Browse conversations in the sidebar → click one to open in an editor tab
4. Copy messages, inspect step details, open multiple conversations side-by-side

## How It Works

```
┌──────────────────────────────────────────────────────────────┐
│  Antigravity (Electron)                                      │
│  ┌──────────────┐                                            │
│  │ Language      │ ◄── HTTPS + CSRF + ConnectRPC  ◄── Extension
│  │ Server (LS)  │     GetAllCascadeTrajectories    │         │
│  └──────┬───────┘     GetCascadeTrajectorySteps    │         │
│         │ writes encrypted .pb                               │
│         ▼                                                    │
│  ~/.gemini/antigravity/conversations/*.pb                    │
│         │                                                    │
│  ┌──────┴───────────────┐                                    │
│  │ Extension reads .pb  │                                    │
│  │ 1. AES key from LS   │ ◄─ ELF .rodata (Tier 1)          │
│  │ 2. AES-256-GCM       │ ◄─ /proc/PID/mem (Tier 2)        │
│  │ 3. Schema-free proto │                                    │
│  │    wire decode        │                                    │
│  └──────────────────────┘                                    │
│                                                              │
│  /proc discovery:                                            │
│   /proc/*/cmdline → PID + CSRF                               │
│   /proc/PID/fd    → socket inodes                            │
│   /proc/net/tcp   → listening ports                          │
│   Heartbeat RPC   → verify port                              │
│   cert.pem        → TLS pinning                              │
└──────────────────────────────────────────────────────────────┘
```

### Dual-Source Loading

When loading a conversation, the extension fetches from **both** sources in parallel:
- **Disk**: Decrypt `.pb` → protobuf wire decode → typed `Step[]` (instant, no step limit)
- **API**: `GetCascadeTrajectorySteps` + `GetCascadeTrajectory` (capped at ~976 steps)

The source with **more steps** wins.

### Title Resolution

Conversation titles use the `GetAllCascadeTrajectories` API, which returns AI-generated summaries. Falls back to disk-based first-message extraction if the API is unavailable.

### Key Extraction (Two-Tier)

1. **Tier 1 — ELF Binary Scan**: Parse LS binary `.rodata` for 32-byte alpha candidates, validate by trial-decryption.
2. **Tier 2 — Process Memory**: Scan `/proc/PID/mem` for key candidates with the same validation.

## Architecture

```
src/
├── extension.ts          # TreeDataProvider sidebar + editor tab lifecycle
├── webview.ts            # Editor tab webview (detail + step views)
├── lsClient.ts           # LS discovery via /proc & ConnectRPC calls
├── markdownExtractor.ts  # Two-pass message extraction & step parsing
├── proto.ts              # Protobuf wire-format decoder & trajectory parser
├── crypto.ts             # AES-256-GCM key extraction & decryption
└── types.ts              # Shared TypeScript interfaces & constants
```

**No frameworks. No runtime dependencies beyond the VS Code API.**

## Configuration

| Setting | Default | Description |
|---------|:-------:|-------------|
| `antigravityChatCopy.allowInsecureTls` | `false` | Allow insecure TLS when `cert.pem` pinning fails |

## Security

- **No hardcoded secrets.** AES keys and CSRF tokens discovered at runtime.
- **Loopback only.** All connections to `127.0.0.1`.
- **TLS pinned.** Uses Antigravity's own `cert.pem`.
- **No network calls.** Zero external requests — everything local.
- **Read-only.** No data modified — only conversation content is read.

## ⚠️ Disclaimer

This project is **unofficial** and **not affiliated with, endorsed by, or supported by Google, Antigravity, Codeium, or Exafunction.**

- Accesses the **local Language Server** via **non-public internal APIs** that may change at any time.
- CSRF tokens read from `/proc` may be an **access control bypass** under certain ToS.
- AES keys extracted from the **LS binary and process memory** constitute **reverse engineering**.
- **May violate** the [Antigravity ToS](https://antigravity.google/docs/faq) or [Windsurf/Codeium ToS](https://windsurf.com/terms-of-service-individual).
- **Use at your own risk.** Authors not responsible for any consequences.
- All access is **read-only** and **strictly local** (`127.0.0.1`).

## License

MIT

---

<a id="한국어"></a>

[🇺🇸 English](#english) | [🇰🇷 한국어](#한국어)

---

<h1 align="center">Antigravity Chat Copy</h1>

<p align="center">
  <b>Antigravity AI 채팅 대화의 원본 마크다운을 복사합니다.</b><br>
  사이드바에서 대화 목록 탐색, 에디터 탭에서 열기, 모든 단계 검사, 복사.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-linux-blue?style=flat-square" alt="Linux">
  <img src="https://img.shields.io/badge/vscode-%5E1.68-blue?style=flat-square&logo=visual-studio-code" alt="VS Code">
  <img src="https://img.shields.io/badge/typescript-5.x-blue?style=flat-square&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License">
</p>

---

## 왜 만들었나?

Antigravity는 채팅 응답을 닫힌 웹뷰에서 렌더링하여 원본 마크다운을 선택하거나 복사할 수 없습니다. 이 확장은 ConnectRPC를 통해 로컬 Language Server에 직접 연결하고, 디스크의 암호화된 `.pb` 파일을 복호화하여 원본 콘텐츠를 한 번의 클릭으로 제공합니다.

## 기능

| 기능 | 설명 |
|------|------|
| 🗂️ **Activity Bar** | Activity Bar에 전용 아이콘 → 대화 사이드바 열기 |
| 📋 **사이드바 목록** | AI 생성 대화 제목 + 상대 시간 표시 |
| 📑 **에디터 탭** | 대화 클릭 시 에디터 탭에서 열림 (여러 탭 동시 지원) |
| 📋 **복사 / 전체 복사** | 개별 메시지 또는 전체 대화의 원본 마크다운 복사 |
| 🔍 **단계 상세** | 모든 내부 단계 검사 (사고, 도구 호출, 코드 액션, 명령, 검색) |
| 🏢 **워크스페이스 필터** | 현재 워크스페이스의 대화만 표시 |
| ⟳ **새로고침** | 사이드바 타이틀바의 새로고침 버튼; LS 재시작 시 자동 재연결 |
| 💾 **디스크 + API** | 암호화된 `.pb` (즉시) + API를 병렬 로드, 더 많은 단계를 가진 소스 선택 |
| 🔐 **자동 키 추출** | LS 바이너리에서 AES-256-GCM 키 추출 (ELF `.rodata` 스캔 + 프로세스 메모리 폴백) |

## 설치

### 릴리스에서 설치 (권장)

1. [Releases](https://github.com/Zachary-Lee-Jaeho/Antigravity-Chat-Copy/releases)에서 최신 `.vsix` 다운로드
2. 설치: `Ctrl+Shift+P` → **"Extensions: Install from VSIX…"** → 파일 선택

### 소스에서 빌드

```bash
git clone https://github.com/Zachary-Lee-Jaeho/Antigravity-Chat-Copy.git
cd Antigravity-Chat-Copy
npm install
npm run compile
npx @vscode/vsce package --no-dependencies
# 생성된 .vsix 파일 설치
```

## 사용법

1. Antigravity에서 프로젝트 열기
2. Activity Bar의 **Chat Copy** 아이콘 클릭 (왼쪽 사이드바) 또는 `Ctrl+Shift+M`
3. 사이드바에서 대화 선택 → 에디터 탭에서 열림
4. 메시지 복사, 단계 상세 검사, 여러 대화 나란히 열기

## 작동 원리

### 이중 소스 로딩

대화 로드 시 **두 소스**에서 병렬 가져오기:
- **디스크**: `.pb` 복호화 → protobuf 와이어 디코드 → `Step[]` (즉시, 단계 제한 없음)
- **API**: `GetCascadeTrajectorySteps` + `GetCascadeTrajectory` (~976단계 제한)

**더 많은 단계**를 가진 소스 사용.

### 제목 해석

`GetAllCascadeTrajectories` API로 AI 생성 요약 제목 가져옴. API 불가 시 디스크 기반 첫 메시지 추출로 폴백.

### 키 추출 (2단계)

1. **Tier 1 — ELF 바이너리 스캔**: LS 바이너리의 `.rodata`에서 32바이트 알파 후보 파싱, 시험 복호화로 검증.
2. **Tier 2 — 프로세스 메모리**: `/proc/PID/mem` 스캔으로 같은 방식 검증.

## 보안

- **하드코딩된 비밀 없음.** AES 키와 CSRF 토큰은 런타임에 발견.
- **로컬 전용.** 모든 연결은 `127.0.0.1`.
- **TLS 고정.** Antigravity 자체 `cert.pem` 사용.
- **외부 네트워크 요청 없음.** 모든 것이 로컬.
- **읽기 전용.** 데이터 수정 없음 — 대화 내용 읽기만.

## ⚠️ 면책 조항

이 프로젝트는 **비공식**이며 **Google, Antigravity, Codeium, Exafunction과 무관**합니다.

- **비공개 내부 API**를 통해 로컬 Language Server에 접근합니다. 이 API는 언제든 변경될 수 있습니다.
- `/proc`에서 CSRF 토큰을 읽는 것은 특정 서비스 약관에서 **접근 제어 우회**로 간주될 수 있습니다.
- LS 바이너리 및 프로세스 메모리에서 AES 키를 추출하는 것은 **리버스 엔지니어링**에 해당합니다.
- [Antigravity 서비스 약관](https://antigravity.google/docs/faq) 또는 [Windsurf/Codeium 서비스 약관](https://windsurf.com/terms-of-service-individual)을 **위반할 수 있습니다.**
- **사용에 따른 모든 책임은 사용자에게 있습니다.**
- 모든 접근은 **읽기 전용**이며 **로컬** (`127.0.0.1`) 전용입니다.

## 라이선스

MIT

---

<p align="center">
  채팅을 복사하고 싶은 Antigravity 사용자를 위해 ❤️로 제작
</p>
