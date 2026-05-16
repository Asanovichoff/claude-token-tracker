# claude-token-tracker

Automatically tracks Claude Code input/output token usage across all sessions and projects. Zero dependencies. One-command install.

## How it works

Claude Code fires a `Stop` hook at the end of every turn. This tool registers a lightweight Node.js script as that hook. The script reads the session transcript (a JSONL file Claude Code maintains locally), extracts token counts from each API response, and stores them in a local SQLite database at `~/.claude/token-tracker/usage.db`.

No API keys. No network requests. No background server. Works completely offline.

## Requirements

- Node.js 22.5+
- Claude Code (any recent version)

## Install

```bash
git clone https://github.com/Asanovichoff/claude-token-tracker.git
cd claude-token-tracker
./install.sh
```

That's it. Token tracking is immediately active for all future Claude Code sessions.

## Usage

### Views

```bash
claude-tokens              # today's usage by project (default)
claude-tokens today        # same as above
claude-tokens week         # last 7 days
claude-tokens all          # all-time totals + top projects
claude-tokens project ~/path/to/project   # per-session breakdown for one project
```

### Flags

Flags work with any view and can be combined freely.

```bash
claude-tokens --cost                      # add estimated cost columns (USD)
claude-tokens --json                      # output raw JSON instead of a table
claude-tokens --by-model                  # group all-time usage by model

claude-tokens today --cost                # today's spend by project
claude-tokens week --cost --json          # last 7 days as JSON with cost fields
claude-tokens --by-model --cost           # per-model spend totals
```

### Session replay

After a session ends, you can see a per-turn token breakdown to debug why a session was expensive:

```bash
# List sessions for a project — the REPLAY column shows which ones support replay
claude-tokens project ~/path/to/project

# Get full session IDs as JSON (includes transcript_path so you can verify replay availability)
claude-tokens project ~/path/to/project --json

# Then replay any session
claude-tokens replay <session-id>
```

> **Note:** Replay requires a `transcript_path` recorded at session end. Sessions captured before installing this tool won't have it; all new sessions do. The `REPLAY` column in the project table shows `yes`/`no` at a glance.

---

### Example output

**Default view (`claude-tokens today`)**

```
Claude Code Token Usage  2026-05-16
────────────────────────────────────────────────────────────────────────
PROJECT                                  SESS      INPUT    OUTPUT  CACHE RD
────────────────────────────────────────────────────────────────────────
~/Desktop/my-api                            3     26.50M   219.0K    24.80M
~/Desktop/devTool                           1    122.00K    14.0K   118.0K
────────────────────────────────────────────────────────────────────────
TOTAL                                       4     26.62M   233.0K    24.92M
```

**With cost estimation (`claude-tokens today --cost`)**

```
Claude Code Token Usage  2026-05-16
───────────────────────────────────────────────────────────────────────────────────
PROJECT                                  SESS      INPUT    OUTPUT  CACHE RD       COST
───────────────────────────────────────────────────────────────────────────────────
~/Desktop/my-api                            3     26.50M   219.0K    24.80M     $87.08
~/Desktop/devTool                           1    122.00K    14.0K   118.0K      $2.25
───────────────────────────────────────────────────────────────────────────────────
TOTAL                                       4     26.62M   233.0K    24.92M     $89.33
```

**By model (`claude-tokens --by-model --cost`)**

```
By Model  (all time)
───────────────────────────────────────────────────────────────────────────────────
MODEL                            SESS      INPUT    OUTPUT  CACHE RD       COST
───────────────────────────────────────────────────────────────────────────────────
claude-opus-4-7                     5     14.20M    98.0K    12.10M    $215.40
claude-sonnet-4-6                  12      3.80M   312.0K     3.20M     $16.22
───────────────────────────────────────────────────────────────────────────────────
TOTAL                                                                   $231.62
```

**Project view (`claude-tokens project ~/Desktop/devTool`)**

```
Project: ~/Desktop/devTool
────────────────────────────────────────────────────────────────────────────────────
DATE         SESSION          INPUT    OUTPUT  CACHE RD  MODEL                REPLAY
────────────────────────────────────────────────────────────────────────────────────
2026-05-16   efc4c0a5…      122.0K    14.0K   118.0K   claude-sonnet-4-6    yes
2026-05-15   3ab7f12e…       88.5K     9.2K    84.1K   claude-sonnet-4-6    yes
────────────────────────────────────────────────────────────────────────────────────
TOTAL                        210.5K    23.2K
```

**Session replay (`claude-tokens replay <id>`)**

```
Session efc4c0a5…  ~/Desktop/devTool
────────────────────────────────────────────────────────────────────────
TURN      INPUT    OUTPUT  CACHE RD   CUMUL IN  CUMUL OUT
────────────────────────────────────────────────────────────────────────
   1      4.2K       312     3.8K        4.2K       312
   2      1.1K       890   118.0K        5.3K     1.2K
   3       890     2.1K   121.0K        6.2K     3.3K
   4       780     4.4K   123.0K        7.0K     7.7K
────────────────────────────────────────────────────────────────────────
  4 API calls
```

**Token columns:**
| Column | Description |
|---|---|
| `INPUT` | Base input tokens (typically small due to caching) |
| `OUTPUT` | Tokens generated by the model |
| `CACHE RD` | Tokens read from prompt cache (billed at ~10% of input rate) |
| `COST` | Estimated USD spend (see [Cost estimation](#cost-estimation)) |

---

## Cost estimation

Costs are approximated using published per-million-token rates:

| Model family | Input | Output | Cache write | Cache read |
|---|---|---|---|---|
| claude-opus-4 | $15 | $75 | $18.75 | $1.50 |
| claude-sonnet-4 | $3 | $15 | $3.75 | $0.30 |
| claude-haiku-4 | $0.80 | $4 | $1.00 | $0.08 |
| claude-opus-3 | $15 | $75 | $18.75 | $1.50 |
| claude-sonnet-3 | $3 | $15 | $3.75 | $0.30 |
| claude-haiku-3 | $0.25 | $1.25 | $0.31 | $0.03 |

Views grouped by project or date (e.g. `today`, `week`) use Sonnet 4 pricing as a fallback since model info is aggregated. For accurate per-model costs, use `--by-model --cost`.

---

## Building dashboards / scripting

All views support `--json` output for piping into other tools:

```bash
# Today's usage as JSON
claude-tokens today --json

# Pipe to jq
claude-tokens --by-model --cost --json | jq '.[] | {model: .model, total: .cost.total}'

# Save a daily snapshot
claude-tokens today --cost --json >> ~/token-log.jsonl
```

The JSON shape mirrors the table columns. When `--cost` is added, each row gains a `cost` object:

```json
{
  "model": "claude-sonnet-4-6",
  "input": 98,
  "output": 52142,
  "cache_create": 91898,
  "cache_read": 3758316,
  "sessions": 2,
  "cost": {
    "input": 0.000294,
    "output": 0.782130,
    "cacheCreate": 0.344618,
    "cacheRead": 1.127495,
    "total": 2.254537
  }
}
```

---

## Uninstall

```bash
./uninstall.sh
```

Your usage data remains at `~/.claude/token-tracker/usage.db`. Delete that file to remove all recorded data.

---

## Data stored

All data is local. The SQLite database stores per-session rows with:

| Field | Description |
|---|---|
| `session_id` | UUID from Claude Code |
| `project_path` | Working directory |
| `date` | ISO date (YYYY-MM-DD) |
| `model` | Model used (e.g. `claude-sonnet-4-6`) |
| `input_tokens` | Base input tokens |
| `output_tokens` | Output tokens |
| `cache_create_tokens` | Tokens written to prompt cache |
| `cache_read_tokens` | Tokens read from prompt cache |
| `transcript_path` | Path to session JSONL (used by `replay`) |

---

## Project structure

```
claude-token-tracker/
├── install.sh            # one-command installer
├── uninstall.sh          # cleanup
├── bin/tokens.js         # claude-tokens CLI
└── src/
    ├── hook.js           # Stop hook handler (reads transcript → writes DB)
    ├── db.js             # SQLite schema + query helpers
    ├── stats.js          # formatted output + JSON serialization
    ├── pricing.js        # per-model cost rates
    ├── paths.js          # DB path constants
    └── install-hook.js   # safe settings.json merger
```

## License

MIT
