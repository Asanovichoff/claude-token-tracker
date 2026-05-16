#!/usr/bin/env node --no-warnings
// Called by Claude Code's Stop hook via stdin JSON.
// Reads new entries from the session transcript, extracts token usage,
// and persists cumulative totals to the SQLite database.

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { openDB, upsertSession, getSession } from './db.js';

async function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on('data', (d) => chunks.push(d));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString()));
    // If stdin closes immediately (e.g. testing without pipe), resolve empty
    setTimeout(() => resolve('{}'), 3000);
  });
}

async function readJSONLFrom(filePath, startLine) {
  return new Promise((resolve, reject) => {
    const entries = [];
    const stream = createReadStream(filePath, { encoding: 'utf8' });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    let lineNum = 0;

    rl.on('line', (line) => {
      lineNum++;
      if (lineNum <= startLine || !line.trim()) return;
      try {
        entries.push({ obj: JSON.parse(line), lineNum });
      } catch {
        // skip malformed lines
      }
    });

    rl.on('close', () => resolve({ entries, totalLines: lineNum }));
    rl.on('error', reject);
    stream.on('error', reject);
  });
}

async function main() {
  const raw = await readStdin();

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const { session_id: sessionId, transcript_path: transcriptPath, cwd } = input;

  if (!sessionId || !transcriptPath) process.exit(0);

  const db = openDB();

  const existing = getSession(db, sessionId);
  const startLine = existing?.last_line_count ?? 0;

  let { entries, totalLines } = await readJSONLFrom(transcriptPath, startLine).catch(() => ({
    entries: [],
    totalLines: startLine,
  }));

  // Guard: if file was compacted and line count shrank, reprocess from start
  if (totalLines < startLine) {
    const reread = await readJSONLFrom(transcriptPath, 0).catch(() => ({
      entries: [],
      totalLines: 0,
    }));
    entries = reread.entries;
    totalLines = reread.totalLines;
    // Reset existing counters by zeroing before upsert
    if (existing) {
      db.prepare(`UPDATE sessions SET
        input_tokens=0, output_tokens=0,
        cache_create_tokens=0, cache_read_tokens=0,
        last_line_count=0 WHERE session_id=?`).run(sessionId);
    }
  }

  // Collect project path from the earliest user entry with cwd
  let projectPath = cwd ?? 'unknown';
  for (const { obj } of entries) {
    if (obj.type === 'user' && obj.cwd) {
      projectPath = obj.cwd;
      break;
    }
  }
  // Fall back to cwd from existing record
  if (projectPath === 'unknown' && existing?.project_path) {
    projectPath = existing.project_path;
  }

  // Count tokens — deduplicate by message ID using stop_reason as the signal
  // that this is the final (complete) streaming entry for this API call
  let inputT = 0, outputT = 0, cacheCreate = 0, cacheRead = 0;
  let model = null;
  const seenIds = new Set();

  for (const { obj } of entries) {
    if (obj.isSidechain === true) continue;
    if (obj.type !== 'assistant') continue;

    const msg = obj.message;
    if (!msg?.usage || !msg.stop_reason) continue;
    if (msg.model === '<synthetic>') continue;

    const msgId = msg.id;
    if (msgId && seenIds.has(msgId)) continue;
    if (msgId) seenIds.add(msgId);

    model ??= msg.model;
    inputT      += msg.usage.input_tokens ?? 0;
    outputT     += msg.usage.output_tokens ?? 0;
    cacheCreate += msg.usage.cache_creation_input_tokens ?? 0;
    cacheRead   += msg.usage.cache_read_input_tokens ?? 0;
  }

  if (inputT === 0 && outputT === 0 && totalLines === startLine) {
    db.close();
    process.exit(0);
  }

  const date = new Date().toISOString().slice(0, 10);

  upsertSession(db, {
    sessionId,
    projectPath,
    date,
    model,
    inputTokens: inputT,
    outputTokens: outputT,
    cacheCreateTokens: cacheCreate,
    cacheReadTokens: cacheRead,
    newLineCount: totalLines,
    transcriptPath,
  });

  db.close();
  process.exit(0);
}

main().catch(() => process.exit(0));
