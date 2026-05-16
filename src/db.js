import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DB_PATH } from './paths.js';

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

export function openDB(path = DB_PATH) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  // Migrate existing DBs that pre-date transcript_path and idx_model
  try { db.exec('ALTER TABLE sessions ADD COLUMN transcript_path TEXT'); } catch {}
  return db;
}

export function upsertSession(db, {
  sessionId, projectPath, date, model,
  inputTokens, outputTokens, cacheCreateTokens, cacheReadTokens,
  newLineCount, transcriptPath,
}) {
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
    inputTokens, outputTokens, cacheCreateTokens, cacheReadTokens,
    newLineCount, transcriptPath ?? null, now, now,
  );
}

export function getSession(db, sessionId) {
  return db.prepare('SELECT * FROM sessions WHERE session_id = ?').get(sessionId);
}

export function queryByDate(db, date) {
  return db.prepare(`
    SELECT project_path,
           SUM(input_tokens) AS input, SUM(output_tokens) AS output,
           SUM(cache_create_tokens) AS cache_create, SUM(cache_read_tokens) AS cache_read,
           COUNT(*) AS sessions
    FROM sessions WHERE date = ?
    GROUP BY project_path ORDER BY input DESC
  `).all(date);
}

export function queryRange(db, fromDate, toDate) {
  return db.prepare(`
    SELECT date,
           SUM(input_tokens) AS input, SUM(output_tokens) AS output,
           SUM(cache_create_tokens) AS cache_create, SUM(cache_read_tokens) AS cache_read,
           COUNT(*) AS sessions, COUNT(DISTINCT project_path) AS projects
    FROM sessions WHERE date BETWEEN ? AND ?
    GROUP BY date ORDER BY date DESC
  `).all(fromDate, toDate);
}

export function queryAllTime(db) {
  return db.prepare(`
    SELECT
      SUM(input_tokens) AS input, SUM(output_tokens) AS output,
      SUM(cache_create_tokens) AS cache_create, SUM(cache_read_tokens) AS cache_read,
      COUNT(*) AS sessions, COUNT(DISTINCT project_path) AS projects
    FROM sessions
  `).get();
}

export function queryByProject(db, projectPath) {
  return db.prepare(`
    SELECT session_id, date,
           input_tokens AS input, output_tokens AS output,
           cache_create_tokens AS cache_create, cache_read_tokens AS cache_read,
           model, last_updated_at
    FROM sessions WHERE project_path = ?
    ORDER BY last_updated_at DESC LIMIT 50
  `).all(projectPath);
}

export function queryTopProjects(db, limit = 10) {
  return db.prepare(`
    SELECT project_path,
           SUM(input_tokens) AS input, SUM(output_tokens) AS output,
           SUM(cache_create_tokens) AS cache_create, SUM(cache_read_tokens) AS cache_read,
           COUNT(*) AS sessions
    FROM sessions
    GROUP BY project_path ORDER BY input DESC LIMIT ?
  `).all(limit);
}

export function queryAllByModel(db) {
  return db.prepare(`
    SELECT model,
           SUM(input_tokens) AS input, SUM(output_tokens) AS output,
           SUM(cache_create_tokens) AS cache_create, SUM(cache_read_tokens) AS cache_read,
           COUNT(*) AS sessions
    FROM sessions
    GROUP BY model ORDER BY input DESC
  `).all();
}

export function querySession(db, sessionId) {
  return db.prepare('SELECT * FROM sessions WHERE session_id = ?').get(sessionId);
}
