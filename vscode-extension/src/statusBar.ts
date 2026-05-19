import * as vscode from 'vscode';
import { calcCost } from './pricing';
import { LiveTokenCounts } from './transcriptWatcher';

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}

function fmtCost(usd: number): string {
  if (usd < 0.01) return '<$0.01';
  return `$${usd.toFixed(2)}`;
}

export class TokenStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'claudeTokenTracker.openPanel';
    this.item.tooltip = 'Claude Token Usage — click to open panel';
    this.item.text = '$(chip) Claude: loading…';
    this.item.show();
  }

  update(counts: LiveTokenCounts | null, format: string): void {
    if (!counts || (counts.inputTokens === 0 && counts.outputTokens === 0 && counts.cacheReadTokens === 0)) {
      this.item.text = '$(chip) Claude: no session';
      this.item.tooltip = 'Claude Token Tracker — no active session detected. Open a project and start Claude Code.';
      return;
    }

    const cost = calcCost(
      counts.model,
      counts.inputTokens,
      counts.outputTokens,
      counts.cacheCreateTokens,
      counts.cacheReadTokens,
    );

    const totalIn = counts.inputTokens + counts.cacheReadTokens;
    const tokStr = fmtTokens(totalIn);
    const costStr = fmtCost(cost.total);

    switch (format) {
      case 'tokens': this.item.text = `$(chip) ${tokStr}`; break;
      case 'cost':   this.item.text = `$(chip) ${costStr}`; break;
      default:       this.item.text = `$(chip) ${tokStr} · ${costStr}`; break;
    }

    this.item.tooltip = [
      `Claude Token Tracker — current session`,
      `Input:      ${fmtTokens(counts.inputTokens)}`,
      `Output:     ${fmtTokens(counts.outputTokens)}`,
      `Cache read: ${fmtTokens(counts.cacheReadTokens)}`,
      `Cost:       ${fmtCost(cost.total)}`,
      counts.model ? `Model: ${counts.model}` : '',
    ].filter(Boolean).join('\n');
  }

  dispose(): void {
    this.item.dispose();
  }
}
