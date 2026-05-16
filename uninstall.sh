#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SETTINGS="$HOME/.claude/settings.json"
HOOK_CMD="node --no-warnings $INSTALL_DIR/src/hook.js"

echo "claude-token-tracker: uninstalling..."

# Remove the Stop hook entry from settings.json
if [ -f "$SETTINGS" ]; then
  node -e "
    const fs = require('fs');
    const path = '$SETTINGS';
    const hookCmd = '$HOOK_CMD';
    let s = {};
    try { s = JSON.parse(fs.readFileSync(path, 'utf8')); } catch {}
    if (s.hooks?.Stop) {
      s.hooks.Stop = s.hooks.Stop.filter(e =>
        !e?.hooks?.some(h => h?.command === hookCmd)
      );
      if (!s.hooks.Stop.length) delete s.hooks.Stop;
      if (!Object.keys(s.hooks).length) delete s.hooks;
    }
    fs.writeFileSync(path, JSON.stringify(s, null, 2) + '\n', 'utf8');
    console.log('Hook removed from ' + path);
  " 2>/dev/null || echo "Could not update settings.json — remove the hook manually."
fi

# Unlink CLI
cd "$INSTALL_DIR" && npm unlink 2>/dev/null || true

echo "claude-token-tracker: uninstalled."
echo "Your usage data remains at ~/.claude/token-tracker/usage.db"
echo "Delete that directory to remove all recorded data."
