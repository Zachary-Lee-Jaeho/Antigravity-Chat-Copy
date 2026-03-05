import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { connectToLs, callLsApi, LsConnectionInfo } from './lsClient';
import { extractMessages, extractTitle } from './markdownExtractor';
import { getWebviewHtml } from './webview';

let panel: vscode.WebviewPanel | null = null;
let ls: LsConnectionInfo | null = null;

export function activate(ctx: vscode.ExtensionContext) {
  if (process.platform !== 'linux') {
    vscode.window.showWarningMessage('Antigravity Chat Copy V1: Linux only.');
  }
  ctx.subscriptions.push(
    vscode.commands.registerCommand('antigravityChatCopy.open', () => open(ctx)),
    vscode.commands.registerCommand('antigravityChatCopy.refresh', () => send({ type: 'refresh' })),
  );
}

export function deactivate() { ls = null; }

// ── Panel lifecycle ──

function open(ctx: vscode.ExtensionContext) {
  if (panel) { panel.reveal(); return; }
  panel = vscode.window.createWebviewPanel('chatCopy', 'Chat Copy', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
  panel.webview.html = getWebviewHtml();
  panel.onDidDispose(() => { panel = null; });
  panel.webview.onDidReceiveMessage(async msg => {
    switch (msg.type) {
      case 'init': return handleInit(ctx);
      case 'loadConversation': return handleLoad(msg.id);
      case 'copy':
        await vscode.env.clipboard.writeText(msg.text);
        send({ type: 'copied' });
    }
  });
}

function send(data: any) { panel?.webview.postMessage(data); }
function insecure() { return vscode.workspace.getConfiguration('antigravityChatCopy').get<boolean>('allowInsecureTls', false); }

// ── Handlers ──

async function handleInit(ctx: vscode.ExtensionContext) {
  try { if (!ls) ls = await connectToLs(insecure()); }
  catch (e: any) { return send({ type: 'error', message: e.message }); }

  const convDir = path.join(os.homedir(), '.gemini', 'antigravity', 'conversations');
  if (!fs.existsSync(convDir)) return send({ type: 'conversations', conversations: [] });

  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.toString() || '';
  const files = fs.readdirSync(convDir).filter(f => f.endsWith('.pb')).map(f => {
    const id = f.replace('.pb', '');
    return { id, mtime: fs.statSync(path.join(convDir, f)).mtime.getTime() };
  }).sort((a, b) => b.mtime - a.mtime).slice(0, 30);

  const cache = ctx.globalState.get<Record<string, any>>('convCache', {});
  const convs: any[] = [];
  const uncached: typeof files = [];

  for (const f of files) {
    const c = cache[f.id];
    if (c?.workspaceUri) {
      if (c.workspaceUri === workspace || !workspace) convs.push({ id: f.id, title: c.title, mtime: f.mtime });
    } else uncached.push(f);
  }

  send({ type: 'conversations', conversations: convs, loading: uncached.length > 0 });

  // Background fetch (3 workers, max 20)
  if (uncached.length && ls) {
    let i = 0;
    const work = async () => {
      while (i < Math.min(uncached.length, 20)) {
        const f = uncached[i++];
        try {
          const r = await callLsApi(ls!, 'GetCascadeTrajectory', { cascadeId: f.id }, insecure());
          if (!r.trajectory) continue;
          const title = extractTitle(r.trajectory.steps || []);
          const ws = r.trajectory.metadata?.workspaces?.[0]?.workspaceFolderAbsoluteUri || '';
          cache[f.id] = { title, workspaceUri: ws };
          if (ws === workspace || !workspace) convs.push({ id: f.id, title, mtime: f.mtime });
        } catch { /* skip */ }
      }
    };
    await Promise.all([work(), work(), work()]);
    convs.sort((a, b) => b.mtime - a.mtime);
    await ctx.globalState.update('convCache', cache);
    send({ type: 'conversations', conversations: convs, loading: false });
  }
}

async function handleLoad(id: string) {
  if (!ls) return send({ type: 'error', message: 'Not connected' });
  try {
    send({ type: 'conversationLoading' });
    // Prefer GetCascadeTrajectorySteps (returns real-time data) with fallback
    let steps: any[] = [];
    try {
      const r = await callLsApi(ls, 'GetCascadeTrajectorySteps', { cascadeId: id }, insecure());
      steps = r.steps || [];
    } catch {
      const r = await callLsApi(ls, 'GetCascadeTrajectory', { cascadeId: id }, insecure());
      steps = r.trajectory?.steps || [];
    }
    if (!steps.length) return send({ type: 'error', message: 'No trajectory data' });
    send({ type: 'conversation', id, title: extractTitle(steps), messages: extractMessages(steps) });
  } catch (e: any) { send({ type: 'error', message: e.message }); }
}
