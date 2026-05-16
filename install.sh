#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SETTINGS="$HOME/.claude/settings.json"
HOOK_CMD="node --no-warnings $INSTALL_DIR/src/hook.js"

echo "claude-token-tracker: installing..."

# Require Node 22.5+
NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))" 2>/dev/null || echo "0")
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "ERROR: Node.js 22.5+ is required (found: $(node --version 2>/dev/null || echo 'not found'))"
  echo "Install from https://nodejs.org or via nvm/homebrew."
  exit 1
fi

NODE_MINOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[1]))" 2>/dev/null || echo "0")
if [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 5 ]; then
  echo "ERROR: Node.js 22.5+ required for node:sqlite (found: $(node --version))"
  exit 1
fi

# Make bin executable
chmod +x "$INSTALL_DIR/bin/tokens.js"
chmod +x "$INSTALL_DIR/src/hook.js"

# Create the DB directory
mkdir -p "$HOME/.claude/token-tracker"

# Register the Stop hook in settings.json
node "$INSTALL_DIR/src/install-hook.js" "$SETTINGS" "$HOOK_CMD"

# Link the CLI globally so `claude-tokens` works from anywhere
if npm link --prefix "$HOME/.local" 2>/dev/null || npm link 2>/dev/null; then
  echo "claude-token-tracker: CLI linked — run: claude-tokens"
else
  echo "claude-token-tracker: could not npm link (no global write access)"
  echo "You can still run directly: node $INSTALL_DIR/bin/tokens.js"
fi

echo "claude-token-tracker: done. Token tracking is now active."
