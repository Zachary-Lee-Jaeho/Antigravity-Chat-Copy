# v0.3.0 — UI Improvements & Formatting Fixes

> **Copy original markdown from Antigravity AI chat conversations.**

## ✨ What's New in v0.3.0

- 🛠️ **Fixed Step Details UI/UX**:
  - The "Copy" button in step details is now **"📋 Copy"** to match the rest of the UI.
  - 🐛 **Fixed a bug** where clicking to copy inside Step Details would accidentally toggle the step open/closed.
  - 🚀 **Performance/Reliability Fix**: Copying massive chunks of text (like 100k character script outputs) no longer breaks the UI or fails to copy.
- 📐 **Expandable Long Text**:
  - Long step contents (over 2000 characters) are no longer permanently truncated with `...(truncated)`!
  - We now preserve the **full original output** and display a clean **[Show More]** / **[Show Less]** toggle button.
  - Perfect for inspecting massive crash logs, huge `cat` file outputs, or deep directory listings without losing any data.
- 🔄 **Reload Refresh**:
  - Added a convenient **⟳ Reload** button directly inside the conversation detail view. Refreshing the chat manually without leaving it is now a single click.

## 📦 Install

Download `antigravity-chat-copy-0.3.0.vsix` below.
In VS Code: `Ctrl+Shift+P` → **"Extensions: Install from VSIX…"** → select the file.

## ⚠️ Requirements

- **Linux only** (V1)
- **Antigravity** must be running with an active workspace

## ⚠️ Disclaimer

This is an **unofficial** project. Using this extension may violate [Antigravity](https://antigravity.google/docs/faq) or [Windsurf](https://windsurf.com/terms-of-service-individual) Terms of Service. Use at your own risk. See [README](https://github.com/Zachary-Lee-Jaeho/Antigravity-Chat-Copy#%EF%B8%8F-disclaimer) for details.
