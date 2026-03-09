<p align="center">
  <img src="media/screenshot-list.png" width="360" alt="Conversation List">
  <img src="media/screenshot-detail.png" width="360" alt="Message Detail">
</p>

<h1 align="center">Antigravity Chat Copy</h1>

<p align="center">
  <b>Copy original markdown from Antigravity AI chat conversations.</b><br>
  Browse, search, inspect every step, and copy — all from a single tab.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-linux-blue?style=flat-square" alt="Linux">
  <img src="https://img.shields.io/badge/vscode-%5E1.68-blue?style=flat-square&logo=visual-studio-code" alt="VS Code">
  <img src="https://img.shields.io/badge/typescript-5.x-blue?style=flat-square&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License">
</p>

---

## Why?

Antigravity renders chat responses in a closed webview — you can't select or copy the original markdown. This extension connects directly to the local Language Server via ConnectRPC and gives you the raw content with one click.

## Features

| Feature | Description |
|---------|-------------|
| 📋 **Copy** | Copy any message's original markdown to clipboard |
| 📋 **Copy All** | Copy the entire conversation in one click |
| 🔍 **Step Details** | Inspect every internal step (thinking, commands, code actions, searches) between a user input and the assistant reply |
| 🔎 **Search & Sort** | Filter conversations by title, sort by newest/oldest |
| 🏢 **Workspace Filter** | Only shows conversations from the current workspace |
| ⟳ **Reload** | Refresh the conversation list or re-fetch the current conversation |
| ⌨️ **Keyboard Nav** | `Esc` to go back, `Enter` to select, full focus-visible support |
| ⚡ **Real-time Data** | Uses `GetCascadeTrajectorySteps` API for up-to-date trajectory data, including the active conversation |

<p align="center">
  <img src="media/screenshot-steps.png" width="480" alt="Step Details View">
</p>

## Installation

### From Release (recommended)

1. Download the latest `.vsix` file from the [Releases](https://github.com/Zachary-Lee-Jaeho/Antigravity-Chat-Copy/releases) page
2. Install in Antigravity:
   `Ctrl+Shift+P` → **"Extensions: Install from VSIX…"** → select the file

### From Source

```bash
git clone https://github.com/Zachary-Lee-Jaeho/Antigravity-Chat-Copy.git
cd antigravity-chat-copy
npm install
npm run compile
ln -s $(pwd) ~/.vscode/extensions/antigravity-chat-copy
```

## Usage

1. Open any project in Antigravity
2. Press `Ctrl+Shift+M` — or run **"Open Chat Copy"** from the command palette
3. Browse conversations → click to view → copy what you need
4. Hit ⟳ to reload the conversation list or re-fetch current chat messages

## How It Works

```
┌───────────────────────────────────────────────────┐
│  Antigravity (Electron)                           │
│  ┌──────────────┐                                 │
│  │ Language      │ ◄── HTTPS + CSRF + ConnectRPC ─┤── Our Extension
│  │ Server (LS)  │     GetCascadeTrajectorySteps   │
│  └──────────────┘                                 │
│        ▲                                          │
│   /proc discovery:                                │
│   1. /proc/*/cmdline → find LS PID + CSRF token   │
│   2. /proc/PID/fd   → socket inodes               │
│   3. /proc/net/tcp  → listening ports              │
│   4. Heartbeat RPC  → verify correct port          │
│   5. cert.pem       → TLS certificate pinning      │
└───────────────────────────────────────────────────┘
```

### Message Extraction

The extension handles two types of assistant responses:
- **`NOTIFY_USER` steps** — primary assistant replies (via `notify_user` tool)
- **`PLANNER_RESPONSE` steps** — direct assistant replies (via `modifiedResponse` field), used when the assistant responds without calling `notify_user`

This two-pass extraction ensures **no messages are missed**, even for active conversations.

## Architecture

```
src/
├── extension.ts          # Entry point, panel lifecycle, data handlers (183 lines)
├── webview.ts            # Single-page app UI: HTML/CSS/JS (218 lines)
├── lsClient.ts           # LS discovery via /proc & ConnectRPC calls (153 lines)
├── markdownExtractor.ts  # Two-pass message extraction & step parsing (216 lines)
├── proto.ts              # Protobuf decoding for .pb trajectory files (433 lines)
├── crypto.ts             # AES-GCM decryption of encrypted .pb files (248 lines)
└── types.ts              # Shared TypeScript interfaces & constants (158 lines)
```

**1,609 lines total.** No frameworks. No runtime dependencies beyond the VS Code API.

## API Details

| API | Purpose | Response |
|-----|---------|----------|
| `GetCascadeTrajectory` | Conversation list metadata (workspace URI, title prefetch) | `{ trajectory: { steps, metadata } }` |
| `GetCascadeTrajectorySteps` | **Real-time** full trajectory for viewing | `{ steps: [...] }` |
| `Heartbeat` | Port verification during discovery | `{}` |

## Step Types

When you click **🔍 Details** on an assistant message, you see every internal step:

| Icon | Step Type | Default |
|:----:|-----------|:-------:|
| 👤 | User Input | Open |
| 💬 | Assistant Reply | Open |
| ✏️ | Code Action | Open |
| ❌ | Error | Open |
| 🧠 | AI Thinking | Closed |
| ⚡ | Run Command | Closed |
| 📊 | Command Status | Closed |
| 📁 | List Directory | Closed |
| 📄 | View File | Closed |
| 📋 | File Outline | Closed |
| 🔍 | Grep Search | Closed |
| 🔎 | Find Files | Closed |
| 🌐 | Web Search | Closed |
| 📌 | Task Update | Closed |
| ⚙️ | System Message | Closed |
| 📜 | History | Closed |
| 📚 | Knowledge | Closed |
| 🔖 | Checkpoint | Closed |

## Configuration

| Setting | Default | Description |
|---------|:-------:|-------------|
| `antigravityChatCopy.allowInsecureTls` | `false` | Allow insecure TLS when `cert.pem` pinning fails |

## Security

- **No hardcoded secrets.** CSRF tokens are discovered at runtime from the local process.
- **Loopback only.** All connections go to `127.0.0.1`.
- **TLS pinned.** Uses Antigravity's own `cert.pem` for certificate verification.
- **No network calls.** Zero external requests — everything stays local.

## Limitations

- **Linux only** (V1). macOS/Windows support requires platform-specific `/proc` alternatives.
- **Conversation titles** are derived from the first user message. AI-generated titles require the streaming API (`StreamCascadeSummariesReactiveUpdates`).

## ⚠️ Disclaimer

This project is **unofficial** and **not affiliated with, endorsed by, or supported by Google, Antigravity, Codeium, or Exafunction.**

- This extension accesses the **local Antigravity Language Server** via **non-public internal APIs** (`GetCascadeTrajectorySteps`, `Heartbeat`). These APIs are undocumented and may change or break at any time.
- CSRF tokens are read from local process information (`/proc`), which may be considered an **access control bypass** under certain Terms of Service.
- Using this extension **may violate** the [Antigravity Terms of Service](https://antigravity.google/docs/faq) (Section 6: third-party tool access) or the [Windsurf/Codeium Terms of Service](https://windsurf.com/terms-of-service-individual) (Section 13.4: non-official software access).
- **Use at your own risk.** The authors are not responsible for any account restrictions, suspensions, or other consequences resulting from the use of this software.
- All data access is **read-only** and **strictly local** (`127.0.0.1`). No external network requests are made.

## License

MIT

---

<p align="center">
  Built with ❤️ for Antigravity users who just want to copy their chat.
</p>
