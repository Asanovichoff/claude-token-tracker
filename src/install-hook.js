#!/usr/bin/env node
// Safely merges the Stop hook entry into ~/.claude/settings.json.
// Idempotent: running install twice does not duplicate the hook.
// Usage: node src/install-hook.js <settings-path> <hook-command>

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const [, , settingsPath, hookCmd] = process.argv;

if (!settingsPath || !hookCmd) {
  console.error('Usage: node install-hook.js <settings-path> <hook-command>');
  process.exit(1);
}

let settings = {};
try {
  settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
} catch {
  // File doesn't exist yet or is empty — start fresh
}

settings.hooks ??= {};
settings.hooks.Stop ??= [];

// Check if this exact command is already registered (idempotency)
const alreadyInstalled = settings.hooks.Stop.some((entry) =>
  entry?.hooks?.some((h) => h?.command === hookCmd),
);

if (alreadyInstalled) {
  console.log('claude-token-tracker: hook already installed, skipping.');
  process.exit(0);
}

settings.hooks.Stop.push({
  hooks: [{ type: 'command', command: hookCmd, async: true, timeout: 30 }],
});

mkdirSync(dirname(settingsPath), { recursive: true });
writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
console.log(`claude-token-tracker: Stop hook registered in ${settingsPath}`);
