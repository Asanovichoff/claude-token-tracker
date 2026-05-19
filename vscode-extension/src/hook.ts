// Stop hook — runs as a plain Node.js subprocess (NOT inside Electron/VSCode).
// Claude Code pipes JSON to stdin at session end.
// Uses node:sqlite (Node 22.5+ built-in, works in plain Node).

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
// @ts-ignore — node:sqlite is a Node 22.5+ built-in, no @types package
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DB_PATH = join(homedir(), '.claude', 'token-tracker', 'usage.db');

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS sessions (
    session_id          TEXT PRIMARY KEY,
    project_path        TEXT NOT NULL,
    date                TEXT NOT NULL,
    model               TEXT,
    input_tokens        INTEGER DEFAULT 0,
    output_tokens       INTEGER DEFAULT 0,
    cache_create_tokens INTEGER DEFAULT 0,
    cache_read_tokens   INTEGER DEFAULT 0,
    last_line_count     INTEGER DEFAULT 0,
    transcript_path     TEXT,
    first_seen_at       TEXT NOT NULL,
    last_updated_at     TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_date    ON sessions(date);
  CREATE INDEX IF NOT EXISTS idx_project ON sessions(project_path);
  CREATE INDEX IF NOT EXISTS idx_model   ON sessions(model);
`;

function openDB() {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec(SCHEMA);
  try { db.exec('ALTER TABLE sessions ADD COLUMN transcript_path TEXT'); } catch {}
  return db;
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (d: Buffer) => chunks.push(d));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString()));
    setTimeout(() => resolve('{}'), 3000);
  });
}

interface JSONLEntry { obj: Record<string, unknown>; lineNum: number; }

function readJSONLFrom(filePath: string, startLine: number): Promise<{ entries: JSONLEntry[]; totalLines: number }> {
  return new Promise((resolve, reject) => {
    const entries: JSONLEntry[] = [];
    const stream = createReadStream(filePath, { encoding: 'utf8' });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    let lineNum = 0;

    rl.on('line', (line: string) => {
      lineNum++;
      if (lineNum <= startLine || !line.trim()) return;
      try { entries.push({ obj: JSON.parse(line), lineNum }); } catch {}
    });

    rl.on('close', () => resolve({ entries, totalLines: lineNum }));
    rl.on('error', reject);
    stream.on('error', reject);
  });
}

async function main() {
  const raw = await readStdin();

  let input: Record<string, string>;
  try { input = JSON.parse(raw); }
  catch { process.exit(0); }

  const { session_id: sessionId, transcript_path: transcriptPath, cwd } = input;
  if (!sessionId || !transcriptPath) process.exit(0);

  const db = openDB();
  const existing = db.prepare('SELECT * FROM sessions WHERE session_id = ?').get(sessionId) as Record<string, unknown> | undefined;
  const startLine = (existing?.last_line_count as number) ?? 0;

  let { entries, totalLines } = await readJSONLFrom(transcriptPath, startLine).catch(() => ({
    entries: [] as JSONLEntry[],
    totalLines: startLine,
  }));

  // Guard: file compacted (line count shrank) — reprocess from start
  if (totalLines < startLine) {
    const reread = await readJSONLFrom(transcriptPath, 0).catch(() => ({ entries: [] as JSONLEntry[], totalLines: 0 }));
    entries = reread.entries;
    totalLines = reread.totalLines;
    if (existing) {
      db.prepare(`UPDATE sessions SET
        input_tokens=0, output_tokens=0,
        cache_create_tokens=0, cache_read_tokens=0,
        last_line_count=0 WHERE session_id=?`).run(sessionId);
    }
  }

  let projectPath = cwd ?? 'unknown';
  for (const { obj } of entries) {
    if (obj['type'] === 'user' && obj['cwd']) { projectPath = obj['cwd'] as string; break; }
  }
  if (projectPath === 'unknown' && existing?.['project_path']) {
    projectPath = existing['project_path'] as string;
  }

  let inputT = 0, outputT = 0, cacheCreate = 0, cacheRead = 0;
  let model: string | null = null;
  const seenIds = new Set<string>();

  for (const { obj } of entries) {
    if (obj['isSidechain'] === true) continue;
    if (obj['type'] !== 'assistant') continue;
    const msg = obj['message'] as Record<string, unknown> | undefined;
    if (!msg?.['usage'] || !msg['stop_reason']) continue;
    if (msg['model'] === '<synthetic>') continue;
    const msgId = msg['id'] as string | undefined;
    if (msgId && seenIds.has(msgId)) continue;
    if (msgId) seenIds.add(msgId);
    model ??= msg['model'] as string;
    const usage = msg['usage'] as Record<string, number>;
    inputT      += usage['input_tokens']               ?? 0;
    outputT     += usage['output_tokens']              ?? 0;
    cacheCreate += usage['cache_creation_input_tokens'] ?? 0;
    cacheRead   += usage['cache_read_input_tokens']    ?? 0;
  }

  if (inputT === 0 && outputT === 0 && totalLines === startLine) {
    db.close();
    process.exit(0);
  }

  const date = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO sessions
      (session_id, project_path, date, model,
       input_tokens, output_tokens, cache_create_tokens, cache_read_tokens,
       last_line_count, transcript_path, first_seen_at, last_updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      model               = COALESCE(excluded.model, model),
      input_tokens        = input_tokens + excluded.input_tokens,
      output_tokens       = output_tokens + excluded.output_tokens,
      cache_create_tokens = cache_create_tokens + excluded.cache_create_tokens,
      cache_read_tokens   = cache_read_tokens + excluded.cache_read_tokens,
      last_line_count     = excluded.last_line_count,
      transcript_path     = COALESCE(excluded.transcript_path, transcript_path),
      last_updated_at     = excluded.last_updated_at
  `).run(
    sessionId, projectPath, date, model ?? null,
    inputT, outputT, cacheCreate, cacheRead,
    totalLines, transcriptPath ?? null, now, now,
  );

  db.close();
  process.exit(0);
}

main().catch(() => process.exit(0));
