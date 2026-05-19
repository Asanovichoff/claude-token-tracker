import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import { LiveTokenCounts } from './transcriptWatcher';
import { ProjectRow, DayRow, AllTimeRow, ModelRow } from './db';

export interface DashboardData {
  today: ProjectRow[];
  week: DayRow[];
  allTime: AllTimeRow | undefined;
  topProjects: ProjectRow[];
  byModel: ModelRow[];
  todayDate: string;
}

function nonce(): string {
  return randomBytes(16).toString('hex');
}

export class TokenPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'claudeTokenTracker.sidebar';
  private view?: vscode.WebviewView;

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    webviewView.webview.html = this.buildHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((msg: { type: string }) => {
      if (msg.type === 'refresh') {
        vscode.commands.executeCommand('claudeTokenTracker.refresh');
      }
    });
  }

  async pushDashboard(data: DashboardData): Promise<void> {
    await this.view?.webview.postMessage({ type: 'dashboard', data });
  }

  async pushLiveUpdate(counts: LiveTokenCounts): Promise<void> {
    await this.view?.webview.postMessage({ type: 'live', counts });
  }

  private buildHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'main.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'webview', 'style.css'),
    );
    const n = nonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 style-src ${webview.cspSource} 'unsafe-inline';
                 script-src 'nonce-${n}';">
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div id="app">
    <div class="tabs" role="tablist">
      <button class="tab active" data-tab="today" role="tab">Today</button>
      <button class="tab" data-tab="week" role="tab">Week</button>
      <button class="tab" data-tab="alltime" role="tab">All Time</button>
      <button class="tab" data-tab="model" role="tab">By Model</button>
    </div>
    <div id="content" class="content">
      <div class="empty">Loading…</div>
    </div>
    <div id="live-bar" class="live-bar hidden"></div>
    <div class="toolbar">
      <button id="refresh-btn" class="icon-btn" title="Refresh">↻ Refresh</button>
    </div>
  </div>
  <script nonce="${n}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
