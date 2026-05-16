import { openDB, queryByDate, queryRange, queryAllTime, queryTopProjects, queryByProject } from './db.js';
import { homedir } from 'node:os';

function fmt(n) {
  if (n === null || n === undefined) return '—';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)         return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function shortPath(p) {
  const home = homedir();
  return p.startsWith(home) ? '~' + p.slice(home.length) : p;
}

const HR = '─'.repeat(72);
const BOLD = (s) => `\x1b[1m${s}\x1b[0m`;
const DIM  = (s) => `\x1b[2m${s}\x1b[0m`;
const CYAN = (s) => `\x1b[36m${s}\x1b[0m`;
const GRN  = (s) => `\x1b[32m${s}\x1b[0m`;

function col(s, w, right = false) {
  const str = String(s ?? '—');
  return right ? str.padStart(w) : str.padEnd(w);
}

export function showToday() {
  const db = openDB();
  const today = new Date().toISOString().slice(0, 10);
  const rows = queryByDate(db, today);
  db.close();

  console.log(BOLD(`\nClaude Code Token Usage  ${DIM(today)}`));
  console.log(HR);

  if (!rows.length) {
    console.log(DIM('  No sessions recorded today.'));
    console.log();
    return;
  }

  console.log(BOLD(`${'PROJECT'.padEnd(40)} ${'SESS'.padStart(4)} ${'INPUT'.padStart(10)} ${'OUTPUT'.padStart(9)} ${'CACHE RD'.padStart(9)}`));
  console.log(HR);

  let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalSessions = 0;
  for (const r of rows) {
    console.log(
      `${col(shortPath(r.project_path), 40)} ` +
      `${col(r.sessions, 4, true)} ` +
      `${col(fmt(r.input), 10, true)} ` +
      `${col(fmt(r.output), 9, true)} ` +
      `${col(fmt(r.cache_read), 9, true)}`,
    );
    totalInput    += r.input    ?? 0;
    totalOutput   += r.output   ?? 0;
    totalCacheRead += r.cache_read ?? 0;
    totalSessions += r.sessions ?? 0;
  }

  console.log(HR);
  console.log(
    BOLD(`${'TOTAL'.padEnd(40)} `) +
    BOLD(`${col(totalSessions, 4, true)} `) +
    CYAN(col(fmt(totalInput), 10, true)) + ' ' +
    GRN(col(fmt(totalOutput), 9, true)) + ' ' +
    col(fmt(totalCacheRead), 9, true),
  );
  console.log();
}

export function showWeek() {
  const db = openDB();
  const today = new Date();
  const from = new Date(today);
  from.setDate(today.getDate() - 6);
  const rows = queryRange(db, from.toISOString().slice(0, 10), today.toISOString().slice(0, 10));
  db.close();

  console.log(BOLD('\nLast 7 Days'));
  console.log(HR);

  if (!rows.length) {
    console.log(DIM('  No sessions in the last 7 days.'));
    console.log();
    return;
  }

  console.log(BOLD(`${'DATE'.padEnd(12)} ${'SESS'.padStart(4)} ${'PROJ'.padStart(4)} ${'INPUT'.padStart(10)} ${'OUTPUT'.padStart(9)} ${'CACHE RD'.padStart(9)}`));
  console.log(HR);

  let tInput = 0, tOutput = 0, tSess = 0;
  for (const r of rows) {
    console.log(
      `${col(r.date, 12)} ` +
      `${col(r.sessions, 4, true)} ` +
      `${col(r.projects, 4, true)} ` +
      `${col(fmt(r.input), 10, true)} ` +
      `${col(fmt(r.output), 9, true)} ` +
      `${col(fmt(r.cache_read), 9, true)}`,
    );
    tInput  += r.input  ?? 0;
    tOutput += r.output ?? 0;
    tSess   += r.sessions ?? 0;
  }

  console.log(HR);
  console.log(
    BOLD(`${'TOTAL'.padEnd(21)} `) +
    BOLD(col(tSess, 4, true)) + '      ' +
    CYAN(col(fmt(tInput), 10, true)) + ' ' +
    GRN(col(fmt(tOutput), 9, true)),
  );
  console.log();
}

export function showAllTime() {
  const db = openDB();
  const totals = queryAllTime(db);
  const projects = queryTopProjects(db, 10);
  db.close();

  console.log(BOLD('\nAll-Time Totals'));
  console.log(HR);

  if (!totals || !totals.sessions) {
    console.log(DIM('  No sessions recorded yet.'));
    console.log();
    return;
  }

  console.log(`  Sessions:     ${BOLD(totals.sessions)}`);
  console.log(`  Projects:     ${BOLD(totals.projects)}`);
  console.log(`  Input tokens: ${CYAN(BOLD(fmt(totals.input)))}`);
  console.log(`  Output tokens:${GRN(BOLD(fmt(totals.output)))}`);
  console.log(`  Cache reads:  ${BOLD(fmt(totals.cache_read))}`);
  console.log(`  Cache creates:${BOLD(fmt(totals.cache_create))}`);

  if (projects.length) {
    console.log();
    console.log(BOLD('By Project'));
    console.log(HR);
    console.log(BOLD(`${'PROJECT'.padEnd(44)} ${'INPUT'.padStart(10)} ${'OUTPUT'.padStart(9)} ${'SESSIONS'.padStart(9)}`));
    console.log(HR);
    for (const p of projects) {
      console.log(
        `${col(shortPath(p.project_path), 44)} ` +
        `${CYAN(col(fmt(p.input), 10, true))} ` +
        `${GRN(col(fmt(p.output), 9, true))} ` +
        `${col(p.sessions, 9, true)}`,
      );
    }
  }
  console.log();
}

export function showProject(projectPath) {
  const resolved = projectPath.replace(/^~/, homedir());
  const db = openDB();
  const rows = queryByProject(db, resolved);
  db.close();

  console.log(BOLD(`\nProject: ${shortPath(resolved)}`));
  console.log(HR);

  if (!rows.length) {
    console.log(DIM('  No sessions recorded for this project.'));
    console.log();
    return;
  }

  console.log(BOLD(`${'DATE'.padEnd(12)} ${'SESSION'.padEnd(12)} ${'INPUT'.padStart(10)} ${'OUTPUT'.padStart(9)} ${'CACHE RD'.padStart(9)} ${'MODEL'.padEnd(20)}`));
  console.log(HR);

  let tInput = 0, tOutput = 0;
  for (const r of rows) {
    console.log(
      `${col(r.date, 12)} ` +
      `${col(r.session_id.slice(0, 8) + '…', 12)} ` +
      `${CYAN(col(fmt(r.input), 10, true))} ` +
      `${GRN(col(fmt(r.output), 9, true))} ` +
      `${col(fmt(r.cache_read), 9, true)} ` +
      `${col(r.model ?? '—', 20)}`,
    );
    tInput  += r.input  ?? 0;
    tOutput += r.output ?? 0;
  }

  console.log(HR);
  console.log(
    BOLD(`${'TOTAL'.padEnd(25)} `) +
    CYAN(BOLD(col(fmt(tInput), 10, true))) + ' ' +
    GRN(BOLD(col(fmt(tOutput), 9, true))),
  );
  console.log();
}
