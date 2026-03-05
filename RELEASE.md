# v0.2.0 — Initial Release

> **Copy original markdown from Antigravity AI chat conversations.**

## ✨ Features

- **📋 Copy / Copy All** — One-click copy of any message or the entire conversation as original markdown
- **🔍 Step Details** — Inspect every internal step between user input and assistant reply (AI thinking, code actions, commands, searches, and 18 step types total)
- **🔎 Search & Sort** — Filter conversations by title, sort by newest/oldest
- **🏢 Workspace Filter** — Only shows conversations from the current workspace
- **⟳ Reload** — Refresh the conversation list or re-fetch the current chat
- **⌨️ Keyboard Navigation** — `Esc` to go back, `Enter` to select, full focus-visible support

## 🏗️ Architecture

- **643 lines of TypeScript.** No frameworks. No runtime dependencies.
- Single-page app UI rendered in a VS Code Webview tab
- Direct ConnectRPC connection to the local Antigravity Language Server
- Real-time trajectory data via `GetCascadeTrajectorySteps` API
- Two-pass message extraction: `NOTIFY_USER` (primary) + `PLANNER_RESPONSE` fallback — ensures **no messages are missed**

## 📦 Install

Download `antigravity-chat-copy-0.2.0.vsix` below, then:

`Ctrl+Shift+P` → **"Extensions: Install from VSIX…"** → select the file

## ⚠️ Requirements

- **Linux only** (V1) — uses `/proc` for Language Server discovery
- **Antigravity** must be running with an active workspace

## ⚠️ Disclaimer

This is an **unofficial** project. Using this extension may violate [Antigravity](https://antigravity.google/docs/faq) or [Windsurf](https://windsurf.com/terms-of-service-individual) Terms of Service. Use at your own risk. See [README](https://github.com/Zachary-Lee-Jaeho/Antigravity-Chat-Copy#%EF%B8%8F-disclaimer) for details.
