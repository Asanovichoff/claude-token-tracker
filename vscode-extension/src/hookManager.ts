import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import * as vscode from 'vscode';
import { CLAUDE_SETTINGS_PATH } from './paths';

interface HookEntry {
  type: string;
  command: string;
  async?: boolean;
  timeout?: number;
}

interface HookGroup {
  hooks: HookEntry[];
}

interface ClaudeSettings {
  hooks?: {
    Stop?: HookGroup[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export class HookManager {
  private readonly hookCommand: string;

  constructor(extensionContext: vscode.ExtensionContext) {
    const hookPath = vscode.Uri.joinPath(extensionContext.extensionUri, 'dist', 'hook.js').fsPath;
    this.hookCommand = `node --no-warnings "${hookPath}"`;
  }

  ensureHookRegistered(): void {
    let settings: ClaudeSettings = {};
    try {
      settings = JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, 'utf8')) as ClaudeSettings;
    } catch {}

    settings.hooks ??= {};
    settings.hooks.Stop ??= [];

    const alreadyInstalled = settings.hooks.Stop.some(group =>
      group?.hooks?.some(h => h?.command === this.hookCommand),
    );

    if (alreadyInstalled) return;

    settings.hooks.Stop.push({
      hooks: [{ type: 'command', command: this.hookCommand, async: true, timeout: 30 }],
    });

    mkdirSync(dirname(CLAUDE_SETTINGS_PATH), { recursive: true });
    writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  }

  removeHook(): void {
    let settings: ClaudeSettings = {};
    try {
      settings = JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, 'utf8')) as ClaudeSettings;
    } catch { return; }

    if (!settings.hooks?.Stop) return;

    const before = settings.hooks.Stop.length;
    settings.hooks.Stop = settings.hooks.Stop.filter(group =>
      !group?.hooks?.some(h => h?.command === this.hookCommand),
    );

    if (settings.hooks.Stop.length !== before) {
      writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n', 'utf8');
    }
  }
}
