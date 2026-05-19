# Claude Code Token Tracker

> Real-time Claude Code token usage — live in your status bar and sidebar panel.

Track every token you spend with Claude Code without leaving VSCode. The extension automatically discovers your active session, watches the transcript file as Claude responds, and updates your status bar in real time. At session end, all usage is persisted to a local SQLite database so you have a full history across all projects.

**No API keys. No network requests. Everything stays on your machine.**

---

## Install

Search **"Claude Code Token Tracker"** in the VSCode Extensions sidebar (`Cmd+Shift+X` / `Ctrl+Shift+X`) and click **Install**.

Or install from the terminal:
```bash
code --install-extension claude-token-tracker.claude-code-token-tracker
```

That's it — no manual setup required. The extension automatically registers a Stop hook in `~/.claude/settings.json` when it first activates.

---

## What you get

### Status bar — live token count
The bottom-right corner of your VSCode window shows the current session's token usage, updating as Claude responds:

```
⬡ 1.4M · $0.87
```

Click it to open the sidebar panel.

### Sidebar panel — full history
Click the icon in the activity bar to open the **Token Usage** sidebar with four tabs:

| Tab | Shows |
|-----|-------|
| **Today** | Today's usage grouped by project |
| **Week** | Last 7 days grouped by date |
| **All Time** | Lifetime totals + top 10 projects |
| **By Model** | Breakdown by Claude model used |

Each view shows input tokens, output tokens, cache reads, and estimated USD cost.

### Live session bar
At the bottom of the sidebar a live bar pulses green during an active Claude Code session, showing running totals that update turn-by-turn — before the session even ends.

---

## Requirements

- VSCode 1.94 or later
- [Claude Code](https://claude.ai/code) installed and used at least once in the current workspace
- Node.js 22.5+ (only needed for the Stop hook subprocess — not for the extension itself)

---

## How it works

1. When VSCode opens, the extension finds the most recently active Claude Code session for your current workspace by scanning `~/.claude/projects/`
2. It watches that session's JSONL transcript file with `fs.watch` for instant updates as Claude writes new responses
3. Token counts are parsed from assistant messages using the same deduplication logic Claude Code uses internally
4. When a session ends, Claude Code fires the Stop hook — a small bundled Node.js script that persists the final totals to `~/.claude/token-tracker/usage.db`
5. The sidebar panel reads from the database and refreshes every 30 seconds, or immediately when you click **Refresh**

The extension and the [CLI tool](https://github.com/Asanovichoff/claude-token-tracker) share the same database — if you use both, your history is always in sync.

---

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `claudeTokenTracker.statusBarFormat` | `both` | What to show in the status bar: `tokens`, `cost`, or `both` |
| `claudeTokenTracker.showCosts` | `true` | Show estimated USD costs in the sidebar panel |
| `claudeTokenTracker.pollIntervalMs` | `2000` | How often to poll the transcript file for new tokens (ms) |

---

## Cost estimation

Costs are approximated using published per-million-token rates:

| Model family | Input | Output | Cache write | Cache read |
|---|---|---|---|---|
| claude-opus-4 | $15 | $75 | $18.75 | $1.50 |
| claude-sonnet-4 | $3 | $15 | $3.75 | $0.30 |
| claude-haiku-4 | $0.80 | $4 | $1.00 | $0.08 |

Actual costs may vary — check [anthropic.com/pricing](https://anthropic.com/pricing) for the latest rates.

---

## Data & privacy

All data is stored locally at `~/.claude/token-tracker/usage.db` (SQLite). The extension makes no network requests. Nothing is ever sent to any server.

To delete all recorded data:
```bash
rm -rf ~/.claude/token-tracker
```

---

## CLI companion

This extension pairs with the `claude-token-tracker` CLI for terminal-based views and JSON output:

```bash
git clone https://github.com/Asanovichoff/claude-token-tracker.git
cd claude-token-tracker
./install.sh

claude-tokens today --cost
claude-tokens week --json
claude-tokens --by-model --cost
```

---

## License

MIT — [Akan Abdireshov](https://github.com/Asanovichoff)
