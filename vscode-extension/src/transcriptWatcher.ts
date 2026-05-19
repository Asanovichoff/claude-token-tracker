import * as fs from 'fs';
import * as vscode from 'vscode';

export interface LiveTokenCounts {
  sessionId: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreateTokens: number;
  cacheReadTokens: number;
  model: string | null;
  turnCount: number;
}

function emptyLive(sessionId: string): LiveTokenCounts {
  return { sessionId, inputTokens: 0, outputTokens: 0, cacheCreateTokens: 0, cacheReadTokens: 0, model: null, turnCount: 0 };
}

export class TranscriptWatcher implements vscode.Disposable {
  private fsWatcher: fs.FSWatcher | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private byteOffset = 0;
  private seenMessageIds = new Set<string>();
  private live: LiveTokenCounts = emptyLive('');
  private transcriptPath = '';
  private pending = false;

  constructor(
    private readonly pollIntervalMs: number,
    private readonly onUpdate: (counts: LiveTokenCounts) => void,
  ) {}

  start(transcriptPath: string, startLineCount: number, sessionId: string): void {
    this.stop();

    this.transcriptPath = transcriptPath;
    this.live = emptyLive(sessionId);
    this.seenMessageIds = new Set();
    // Start reading from the beginning — we accumulate in-memory for the live view.
    // The DB already holds the historical part up to startLineCount; we reparse from 0
    // so the live bar shows the full current-session total (same as what the hook will persist).
    this.byteOffset = 0;

    // Initial parse of entire file
    this.readNewBytes();

    // fs.watch fires on every write — instant update on macOS (kqueue)
    try {
      this.fsWatcher = fs.watch(transcriptPath, { persistent: false }, (event) => {
        if (event === 'change' && !this.pending) {
          this.pending = true;
          // Small debounce: Claude Code streams many small writes per turn
          setTimeout(() => { this.pending = false; this.readNewBytes(); }, 150);
        }
      });
    } catch {}

    // Polling fallback (handles edge cases where fs.watch is unreliable)
    this.pollTimer = setInterval(() => this.readNewBytes(), this.pollIntervalMs);
  }

  stop(): void {
    if (this.fsWatcher) { try { this.fsWatcher.close(); } catch {} this.fsWatcher = null; }
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    this.transcriptPath = '';
  }

  dispose(): void {
    this.stop();
  }

  private readNewBytes(): void {
    if (!this.transcriptPath) return;

    let fd: number | undefined;
    try {
      fd = fs.openSync(this.transcriptPath, 'r');
      const stat = fs.fstatSync(fd);
      const fileSize = stat.size;
      if (fileSize <= this.byteOffset) return;

      const chunkSize = fileSize - this.byteOffset;
      const buf = Buffer.alloc(chunkSize);
      const read = fs.readSync(fd, buf, 0, chunkSize, this.byteOffset);
      this.byteOffset += read;

      const text = buf.subarray(0, read).toString('utf8');
      const lines = text.split('\n');

      let changed = false;
      for (const line of lines) {
        if (!line.trim()) continue;
        let obj: Record<string, unknown>;
        try { obj = JSON.parse(line); } catch { continue; }

        if (obj['isSidechain'] === true) continue;
        if (obj['type'] !== 'assistant') continue;
        const msg = obj['message'] as Record<string, unknown> | undefined;
        if (!msg?.['usage'] || !msg['stop_reason']) continue;
        if (msg['model'] === '<synthetic>') continue;

        const msgId = msg['id'] as string | undefined;
        if (msgId && this.seenMessageIds.has(msgId)) continue;
        if (msgId) this.seenMessageIds.add(msgId);

        this.live.model ??= msg['model'] as string ?? null;
        const usage = msg['usage'] as Record<string, number>;
        this.live.inputTokens       += usage['input_tokens']                ?? 0;
        this.live.outputTokens      += usage['output_tokens']               ?? 0;
        this.live.cacheCreateTokens += usage['cache_creation_input_tokens'] ?? 0;
        this.live.cacheReadTokens   += usage['cache_read_input_tokens']     ?? 0;
        this.live.turnCount++;
        changed = true;
      }

      if (changed) this.onUpdate({ ...this.live });
    } catch {
      // File may not exist yet or be locked — silently ignore
    } finally {
      if (fd !== undefined) { try { fs.closeSync(fd); } catch {} }
    }
  }
}
