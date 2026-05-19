import * as vscode from 'vscode';
import { DatabaseSync } from 'node:sqlite';
import { openDB, queryByDate, queryRange, queryAllTime, queryTopProjects, queryAllByModel } from './db';
import { discoverActiveSession } from './sessionDiscovery';
import { TranscriptWatcher, LiveTokenCounts } from './transcriptWatcher';
import { HookManager } from './hookManager';
import { TokenStatusBar } from './statusBar';
import { TokenPanelProvider, DashboardData } from './panelProvider';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function weekAgoStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.toISOString().slice(0, 10);
}

function queryDashboard(db: DatabaseSync): DashboardData {
  const today = todayStr();
  return {
    today: queryByDate(db, today),
    week: queryRange(db, weekAgoStr(), today),
    allTime: queryAllTime(db),
    topProjects: queryTopProjects(db, 10),
    byModel: queryAllByModel(db),
    todayDate: today,
  };
}

export function activate(context: vscode.ExtensionContext): void {
  let db: DatabaseSync;
  try {
    db = openDB();
  } catch (err) {
    vscode.window.showErrorMessage(`Claude Token Tracker: failed to open database — ${err}`);
    return;
  }

  // Register Stop hook so the DB gets updated at session end
  try {
    const hookManager = new HookManager(context);
    hookManager.ensureHookRegistered();
    context.subscriptions.push({ dispose: () => hookManager.removeHook() });
  } catch {}

  const config = vscode.workspace.getConfiguration('claudeTokenTracker');
  const statusBar = new TokenStatusBar();
  context.subscriptions.push(statusBar);

  const panelProvider = new TokenPanelProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(TokenPanelProvider.viewType, panelProvider),
  );

  let lastLive: LiveTokenCounts | null = null;

  const watcher = new TranscriptWatcher(
    config.get<number>('pollIntervalMs', 2000),
    (counts) => {
      lastLive = counts;
      statusBar.update(counts, config.get<string>('statusBarFormat', 'both'));
      panelProvider.pushLiveUpdate(counts);
    },
  );
  context.subscriptions.push(watcher);

  async function refreshSession(): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) { watcher.stop(); return; }

    const session = discoverActiveSession(folder.uri.fsPath);
    if (!session) { watcher.stop(); return; }

    watcher.start(session.transcriptPath, 0, session.sessionId);
  }

  function refreshPanel(): void {
    const data = queryDashboard(db);
    panelProvider.pushDashboard(data);
    // Carry live counts forward if we have them
    if (lastLive) {
      statusBar.update(lastLive, config.get<string>('statusBarFormat', 'both'));
    }
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void refreshSession();
      refreshPanel();
    }),
    vscode.commands.registerCommand('claudeTokenTracker.refresh', () => refreshPanel()),
    vscode.commands.registerCommand('claudeTokenTracker.openPanel', () => {
      vscode.commands.executeCommand('claudeTokenTracker.sidebar.focus');
    }),
    { dispose: () => { try { db.close(); } catch {} } },
  );

  // Initial load
  void refreshSession();
  refreshPanel();

  // Poll DB every 30s — the Stop hook writes to it after each session
  const dbPollTimer = setInterval(() => refreshPanel(), 30_000);
  context.subscriptions.push({ dispose: () => clearInterval(dbPollTimer) });
}

export function deactivate(): void {}
