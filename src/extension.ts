import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { connectToLs, callLsApi, LsConnectionInfo, findExtensionPath } from './lsClient';
import { extractMessages, extractTitle } from './markdownExtractor';
import { getWebviewHtml } from './webview';
import { extractKey, clearKeyCache } from './crypto';
import { loadConversationFromDisk } from './proto';
import { Step } from './types';

let ls: LsConnectionInfo | null = null;
let encryptionKey: Buffer | null = null;

// ── Activation ──

export function activate(ctx: vscode.ExtensionContext) {
  if (process.platform !== 'linux') {
    vscode.window.showWarningMessage('Antigravity Chat Copy: Linux only.');
  }

  const provider = new ConversationTreeProvider(ctx);
  ctx.subscriptions.push(
    vscode.window.registerTreeDataProvider('chatCopy.conversations', provider),
    vscode.commands.registerCommand('antigravityChatCopy.refresh', () => provider.refresh()),
    vscode.commands.registerCommand('antigravityChatCopy.openConversation', (id: string, title: string) => openConversation(id, title)),
  );

  // Initial load
  provider.refresh();
}

export function deactivate() { ls = null; }

function getAllowInsecure(): boolean {
  return vscode.workspace.getConfiguration('antigravityChatCopy').get<boolean>('allowInsecureTls', false);
}

// ── Sidebar: Conversation Tree ──

interface ConvItem { id: string; title: string; mtime: number; }

class ConversationTreeProvider implements vscode.TreeDataProvider<ConvItem> {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;
  private items: ConvItem[] = [];
  private ctx: vscode.ExtensionContext;

  constructor(ctx: vscode.ExtensionContext) { this.ctx = ctx; }

  async refresh() {
    await ensureConnection();
    this.items = await loadConversationList(this.ctx);
    this._onDidChange.fire();
  }

  getTreeItem(item: ConvItem): vscode.TreeItem {
    const ti = new vscode.TreeItem(item.title || item.id.substring(0, 8));
    ti.description = formatRelativeTime(item.mtime);
    ti.tooltip = `${item.title}\n${item.id}\n${new Date(item.mtime).toLocaleString()}`;
    ti.command = { command: 'antigravityChatCopy.openConversation', title: 'Open', arguments: [item.id, item.title] };
    ti.iconPath = new vscode.ThemeIcon('comment-discussion');
    ti.contextValue = 'conversation';
    return ti;
  }

  getChildren(): ConvItem[] { return this.items; }
}

function formatRelativeTime(mtime: number): string {
  const diff = Date.now() - mtime;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

// ── Editor Tab: Webview Panel ──

const openPanels = new Map<string, vscode.WebviewPanel>();

function openConversation(id: string, title: string) {
  const existing = openPanels.get(id);
  if (existing) { existing.reveal(); return; }

  const panel = vscode.window.createWebviewPanel(
    'chatCopyDetail', title || id.substring(0, 8),
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );
  panel.webview.html = getWebviewHtml();

  openPanels.set(id, panel);
  panel.onDidDispose(() => openPanels.delete(id));

  panel.webview.onDidReceiveMessage(async msg => {
    switch (msg.type) {
      case 'ready': return handleLoad(id, title, panel);
      case 'copy':
        await vscode.env.clipboard.writeText(msg.text);
        panel.webview.postMessage({ type: 'copied' });
    }
  });
}

// ── LS Connection ──

async function ensureConnection() {
  const oldPid = ls?.pid;
  try {
    if (ls) {
      try { await callLsApi(ls, 'Heartbeat', { metadata: {} }, getAllowInsecure()); }
      catch { ls = null; }
    }
    if (!ls) {
      ls = await connectToLs(getAllowInsecure());
      if (ls.pid !== oldPid) { encryptionKey = null; clearKeyCache(); }
    }
  } catch { /* proceed without API */ }

  if (!encryptionKey && ls) {
    const extPath = findExtensionPath();
    if (extPath) {
      const binPath = path.join(extPath, 'bin', 'language_server_linux_x64');
      encryptionKey = await extractKey(binPath, ls.pid);
    }
  }
}

// ── Load Conversation List ──

async function loadConversationList(ctx: vscode.ExtensionContext): Promise<ConvItem[]> {
  const convDir = path.join(os.homedir(), '.gemini', 'antigravity', 'conversations');
  if (!fs.existsSync(convDir)) return [];

  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.toString() || '';

  // Build a map of all .pb file mtimes for any ID we might need
  const allFiles = new Map<string, number>();
  for (const f of fs.readdirSync(convDir).filter(f => f.endsWith('.pb'))) {
    const id = f.replace('.pb', '');
    try { allFiles.set(id, fs.statSync(path.join(convDir, f)).mtime.getTime()); } catch { /* skip */ }
  }

  const cache = ctx.globalState.get<Record<string, any>>('convCache', {});
  const convs: ConvItem[] = [];

  // Fast path: GetAllCascadeTrajectories returns AI-generated titles + workspace
  if (ls) {
    try {
      const r = await callLsApi(ls, 'GetAllCascadeTrajectories', {}, getAllowInsecure());
      const summaries = r.trajectorySummaries;
      if (summaries) {
        // Iterate ALL summaries from the API, not just top N disk files
        for (const [id, s] of Object.entries<any>(summaries)) {
          const title = s.summary || id.substring(0, 8);
          const ws = s.workspaces?.[0]?.workspaceFolderAbsoluteUri || '';
          cache[id] = { title, workspaceUri: ws };
          if (ws === workspace || !workspace) {
            const mtime = allFiles.get(id) || 0;
            convs.push({ id, title, mtime });
          }
        }
        await ctx.globalState.update('convCache', cache);
        return convs.sort((a, b) => b.mtime - a.mtime).slice(0, 50);
      }
    } catch { /* fall back */ }
  }

  // Fallback: disk-based resolution (use all files, cap after filtering)
  const diskFiles = [...allFiles.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 100); // scan more files to avoid missing workspace matches

  for (const [id, mtime] of diskFiles) {
    const c = cache[id];
    if (c?.workspaceUri) {
      if (c.workspaceUri === workspace || !workspace) convs.push({ id, title: c.title, mtime });
      continue;
    }
    if (encryptionKey) {
      try {
        const diskData = loadConversationFromDisk(id, encryptionKey);
        if (diskData?.steps?.length) {
          const title = extractTitle(diskData.steps);
          const ws = diskData.metadata?.workspaces?.[0]?.workspaceFolderAbsoluteUri || '';
          cache[id] = { title, workspaceUri: ws };
          if (ws === workspace || !workspace) convs.push({ id, title, mtime });
        }
      } catch { /* skip */ }
    }
    if (convs.length >= 50) break;
  }
  await ctx.globalState.update('convCache', cache);
  return convs;
}

// ── Load Single Conversation ──

async function handleLoad(id: string, aiTitle: string, panel: vscode.WebviewPanel) {
  if (!ls && !encryptionKey) {
    panel.webview.postMessage({ type: 'error', message: 'Not connected and no decryption key' });
    return;
  }
  try {
    panel.webview.postMessage({ type: 'conversationLoading' });

    const diskPromise = encryptionKey
      ? Promise.resolve(loadConversationFromDisk(id, encryptionKey))
      : Promise.resolve(null);

    const apiPromise = ls ? Promise.allSettled([
      callLsApi(ls, 'GetCascadeTrajectorySteps', { cascadeId: id }, getAllowInsecure()),
      callLsApi(ls, 'GetCascadeTrajectory', { cascadeId: id }, getAllowInsecure()),
    ]) : Promise.resolve([]);

    const [diskData, apiResults] = await Promise.all([diskPromise, apiPromise]);

    let apiSteps: Step[] = [];
    let totalSteps: number | undefined;
    if (Array.isArray(apiResults) && apiResults.length === 2) {
      const s1 = apiResults[0].status === 'fulfilled' ? (apiResults[0].value.steps || []) : [];
      const s2 = apiResults[1].status === 'fulfilled' ? (apiResults[1].value.trajectory?.steps || []) : [];
      if (apiResults[1].status === 'fulfilled') totalSteps = apiResults[1].value.numTotalSteps;
      apiSteps = s1.length >= s2.length ? s1 : s2;
    }

    const diskSteps = diskData?.steps || [];
    const steps = diskSteps.length >= apiSteps.length ? diskSteps : apiSteps;
    const source = diskSteps.length >= apiSteps.length ? 'disk' : 'api';

    if (!steps.length) {
      panel.webview.postMessage({ type: 'error', message: 'No trajectory data' });
      return;
    }

    const messages = extractMessages(steps);
    const title = aiTitle || extractTitle(steps);
    let suffix = '';
    if (source === 'disk') {
      suffix = apiSteps.length > 0 && apiSteps.length < diskSteps.length
        ? ` (${steps.length} steps from disk, API had ${apiSteps.length})`
        : ` (${steps.length} steps from disk)`;
    } else if (totalSteps && totalSteps > steps.length) {
      suffix = ` (${steps.length}/${totalSteps} steps from API)`;
    }
    panel.webview.postMessage({ type: 'conversation', id, title, messages, statusHint: suffix });
  } catch (e: any) {
    panel.webview.postMessage({ type: 'error', message: e.message });
  }
}
