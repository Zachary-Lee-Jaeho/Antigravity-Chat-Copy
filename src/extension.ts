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

let panel: vscode.WebviewPanel | null = null;
let ls: LsConnectionInfo | null = null;
let encryptionKey: Buffer | null = null;

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

function getAllowInsecure(): boolean {
  return vscode.workspace.getConfiguration('antigravityChatCopy').get<boolean>('allowInsecureTls', false);
}

// ── Handlers ──

async function handleInit(ctx: vscode.ExtensionContext) {
  try { if (!ls) ls = await connectToLs(getAllowInsecure()); }
  catch (e: any) { return send({ type: 'error', message: e.message }); }

  const convDir = path.join(os.homedir(), '.gemini', 'antigravity', 'conversations');
  if (!fs.existsSync(convDir)) return send({ type: 'conversations', conversations: [] });

  // Extract encryption key (one-time, ~12s first run)
  if (!encryptionKey && ls) {
    const extPath = findExtensionPath();
    if (extPath) {
      const binPath = path.join(extPath, 'bin', 'language_server_linux_x64');
      encryptionKey = await extractKey(binPath, ls.pid);
      if (!encryptionKey) {
        vscode.window.showWarningMessage(
          'Could not extract .pb decryption key. Disk-based loading disabled. ' +
          'Please report this via GitHub issue.',
          'Open GitHub Issue'
        ).then(choice => {
          if (choice === 'Open GitHub Issue') {
            vscode.env.openExternal(vscode.Uri.parse(
              'https://github.com/Zachary-Lee-Jaeho/antigravity-chat-copy/issues/new?title=Key+extraction+failed&body=LS+version:+' +
              encodeURIComponent(path.basename(path.dirname(path.dirname(extPath!))))
            ));
          }
        });
      }
    }
  }

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

  // Background: resolve uncached titles — disk (instant) → API (fallback)
  if (uncached.length) {
    const queue = [...uncached];
    const work = async () => {
      while (true) {
        const f = queue.shift();  // atomic pop from shared queue (single-threaded JS)
        if (!f) break;
        try {
          if (encryptionKey) {
            const diskData = loadConversationFromDisk(f.id, encryptionKey);
            if (diskData?.steps?.length) {
              const title = extractTitle(diskData.steps);
              const ws = diskData.metadata?.workspaces?.[0]?.workspaceFolderAbsoluteUri || '';
              cache[f.id] = { title, workspaceUri: ws };
              if (ws === workspace || !workspace) convs.push({ id: f.id, title, mtime: f.mtime });
              continue;
            }
          }
          if (ls) {
            const r = await callLsApi(ls, 'GetCascadeTrajectory', { cascadeId: f.id }, getAllowInsecure());
            if (!r.trajectory) continue;
            const title = extractTitle(r.trajectory.steps || []);
            const ws = r.trajectory.metadata?.workspaces?.[0]?.workspaceFolderAbsoluteUri || '';
            cache[f.id] = { title, workspaceUri: ws };
            if (ws === workspace || !workspace) convs.push({ id: f.id, title, mtime: f.mtime });
          }
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
  if (!ls && !encryptionKey) return send({ type: 'error', message: 'Not connected and no decryption key' });
  try {
    send({ type: 'conversationLoading' });

    // Load from disk and API in parallel, pick the one with more steps
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

    if (!steps.length) return send({ type: 'error', message: 'No trajectory data' });

    const messages = extractMessages(steps);
    const title = extractTitle(steps);
    let suffix = '';
    if (source === 'disk') {
      suffix = apiSteps.length > 0 && apiSteps.length < diskSteps.length
        ? ` (${steps.length} steps from disk, API had ${apiSteps.length})`
        : ` (${steps.length} steps from disk)`;
    } else if (totalSteps && totalSteps > steps.length) {
      suffix = ` (${steps.length}/${totalSteps} steps from API)`;
    }
    send({ type: 'conversation', id, title, messages, statusHint: suffix });
  } catch (e: any) { send({ type: 'error', message: e.message }); }
}
