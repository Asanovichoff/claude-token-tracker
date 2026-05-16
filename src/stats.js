import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import {
  openDB, queryByDate, queryRange, queryAllTime, queryTopProjects,
  queryByProject, queryAllByModel, querySession,
} from './db.js';
import { calcCost } from './pricing.js';

function fmt(n) {
  if (n === null || n === undefined) return '—';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)         return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtCost(n) {
  if (n === null || n === undefined) return '—';
  if (n >= 1)    return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return '<$0.01';
}

function shortPath(p) {
  const home = homedir();
  return p.startsWith(home) ? '~' + p.slice(home.length) : p;
}

const HR   = '─'.repeat(72);
const HR_W = '─'.repeat(83);
const BOLD = (s) => `\x1b[1m${s}\x1b[0m`;
const DIM  = (s) => `\x1b[2m${s}\x1b[0m`;
const CYAN = (s) => `\x1b[36m${s}\x1b[0m`;
const GRN  = (s) => `\x1b[32m${s}\x1b[0m`;

function col(s, w, right = false) {
  const str = String(s ?? '—');
  return right ? str.padStart(w) : str.padEnd(w);
}

function addCostToRows(rows, modelFn) {
  return rows.map(r => ({ ...r, cost: calcCost(modelFn(r), r.input, r.output, r.cache_create, r.cache_read) }));
}

export function showToday(opts = {}) {
  const db = openDB();
  const today = new Date().toISOString().slice(0, 10);
  const rows = queryByDate(db, today);
  db.close();

  if (opts.json) {
    const out = opts.cost ? addCostToRows(rows, () => null) : rows;
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  const hr = opts.cost ? HR_W : HR;
  console.log(BOLD(`\nClaude Code Token Usage  ${DIM(today)}`));
  console.log(hr);

  if (!rows.length) {
    console.log(DIM('  No sessions recorded today.'));
    console.log();
    return;
  }

  const costHdr = opts.cost ? ` ${'COST'.padStart(10)}` : '';
  console.log(BOLD(`${'PROJECT'.padEnd(40)} ${'SESS'.padStart(4)} ${'INPUT'.padStart(10)} ${'OUTPUT'.padStart(9)} ${'CACHE RD'.padStart(9)}${costHdr}`));
  console.log(hr);

  let tIn = 0, tOut = 0, tCacheRd = 0, tSess = 0, tCost = 0;
  for (const r of rows) {
    let costStr = '';
    if (opts.cost) {
      const c = calcCost(null, r.input, r.output, r.cache_create, r.cache_read);
      tCost += c.total;
      costStr = ` ${col(fmtCost(c.total), 10, true)}`;
    }
    console.log(
      `${col(shortPath(r.project_path), 40)} ` +
      `${col(r.sessions, 4, true)} ` +
      `${col(fmt(r.input), 10, true)} ` +
      `${col(fmt(r.output), 9, true)} ` +
      `${col(fmt(r.cache_read), 9, true)}${costStr}`,
    );
    tIn      += r.input      ?? 0;
    tOut     += r.output     ?? 0;
    tCacheRd += r.cache_read ?? 0;
    tSess    += r.sessions   ?? 0;
  }

  console.log(hr);
  const totalCostStr = opts.cost ? ` ${col(fmtCost(tCost), 10, true)}` : '';
  console.log(
    BOLD(`${'TOTAL'.padEnd(40)} `) +
    BOLD(`${col(tSess, 4, true)} `) +
    CYAN(col(fmt(tIn), 10, true)) + ' ' +
    GRN(col(fmt(tOut), 9, true)) + ' ' +
    col(fmt(tCacheRd), 9, true) + totalCostStr,
  );
  console.log();
}

export function showWeek(opts = {}) {
  const db = openDB();
  const today = new Date();
  const from = new Date(today);
  from.setDate(today.getDate() - 6);
  const rows = queryRange(db, from.toISOString().slice(0, 10), today.toISOString().slice(0, 10));
  db.close();

  if (opts.json) {
    const out = opts.cost ? addCostToRows(rows, () => null) : rows;
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  const hr = opts.cost ? HR_W : HR;
  console.log(BOLD('\nLast 7 Days'));
  console.log(hr);

  if (!rows.length) {
    console.log(DIM('  No sessions in the last 7 days.'));
    console.log();
    return;
  }

  const costHdr = opts.cost ? ` ${'COST'.padStart(10)}` : '';
  console.log(BOLD(`${'DATE'.padEnd(12)} ${'SESS'.padStart(4)} ${'PROJ'.padStart(4)} ${'INPUT'.padStart(10)} ${'OUTPUT'.padStart(9)} ${'CACHE RD'.padStart(9)}${costHdr}`));
  console.log(hr);

  let tIn = 0, tOut = 0, tSess = 0, tCost = 0;
  for (const r of rows) {
    let costStr = '';
    if (opts.cost) {
      const c = calcCost(null, r.input, r.output, r.cache_create, r.cache_read);
      tCost += c.total;
      costStr = ` ${col(fmtCost(c.total), 10, true)}`;
    }
    console.log(
      `${col(r.date, 12)} ` +
      `${col(r.sessions, 4, true)} ` +
      `${col(r.projects, 4, true)} ` +
      `${col(fmt(r.input), 10, true)} ` +
      `${col(fmt(r.output), 9, true)} ` +
      `${col(fmt(r.cache_read), 9, true)}${costStr}`,
    );
    tIn   += r.input    ?? 0;
    tOut  += r.output   ?? 0;
    tSess += r.sessions ?? 0;
  }

  console.log(hr);
  const totalCostStr = opts.cost ? ` ${col(fmtCost(tCost), 10, true)}` : '';
  console.log(
    BOLD(`${'TOTAL'.padEnd(21)} `) +
    BOLD(col(tSess, 4, true)) + '      ' +
    CYAN(col(fmt(tIn), 10, true)) + ' ' +
    GRN(col(fmt(tOut), 9, true)) + totalCostStr,
  );
  console.log();
}

export function showAllTime(opts = {}) {
  const db = openDB();
  const totals = queryAllTime(db);
  const projects = queryTopProjects(db, 10);
  db.close();

  if (opts.json) {
    const out = { totals, projects };
    if (opts.cost) {
      out.totals = { ...totals, cost: calcCost(null, totals?.input, totals?.output, totals?.cache_create, totals?.cache_read) };
      out.projects = addCostToRows(projects, () => null);
    }
    console.log(JSON.stringify(out, null, 2));
    return;
  }

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
  if (opts.cost) {
    const c = calcCost(null, totals.input, totals.output, totals.cache_create, totals.cache_read);
    console.log(`  Est. cost:    ${BOLD(fmtCost(c.total))}  (input ${fmtCost(c.input)} + output ${fmtCost(c.output)} + cache ${fmtCost(c.cacheCreate + c.cacheRead)})`);
  }

  if (projects.length) {
    console.log();
    const hr = opts.cost ? HR_W : HR;
    console.log(BOLD('By Project'));
    console.log(hr);
    const costHdr = opts.cost ? ` ${'COST'.padStart(10)}` : '';
    console.log(BOLD(`${'PROJECT'.padEnd(44)} ${'INPUT'.padStart(10)} ${'OUTPUT'.padStart(9)} ${'SESSIONS'.padStart(9)}${costHdr}`));
    console.log(hr);
    for (const p of projects) {
      let costStr = '';
      if (opts.cost) {
        const c = calcCost(null, p.input, p.output, p.cache_create, p.cache_read);
        costStr = ` ${col(fmtCost(c.total), 10, true)}`;
      }
      console.log(
        `${col(shortPath(p.project_path), 44)} ` +
        `${CYAN(col(fmt(p.input), 10, true))} ` +
        `${GRN(col(fmt(p.output), 9, true))} ` +
        `${col(p.sessions, 9, true)}${costStr}`,
      );
    }
  }
  console.log();
}

export function showProject(projectPath, opts = {}) {
  const resolved = projectPath.replace(/^~/, homedir());
  const db = openDB();
  const rows = queryByProject(db, resolved);
  db.close();

  if (opts.json) {
    const out = opts.cost ? addCostToRows(rows, r => r.model) : rows;
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  const hr = opts.cost ? HR_W : HR;
  console.log(BOLD(`\nProject: ${shortPath(resolved)}`));
  console.log(hr);

  if (!rows.length) {
    console.log(DIM('  No sessions recorded for this project.'));
    console.log();
    return;
  }

  const costHdr = opts.cost ? ` ${'COST'.padStart(10)}` : '';
  console.log(BOLD(`${'DATE'.padEnd(12)} ${'SESSION'.padEnd(12)} ${'INPUT'.padStart(10)} ${'OUTPUT'.padStart(9)} ${'CACHE RD'.padStart(9)} ${'MODEL'.padEnd(20)}${costHdr}`));
  console.log(hr);

  let tIn = 0, tOut = 0, tCost = 0;
  for (const r of rows) {
    let costStr = '';
    if (opts.cost) {
      const c = calcCost(r.model, r.input, r.output, r.cache_create, r.cache_read);
      tCost += c.total;
      costStr = ` ${col(fmtCost(c.total), 10, true)}`;
    }
    console.log(
      `${col(r.date, 12)} ` +
      `${col(r.session_id.slice(0, 8) + '…', 12)} ` +
      `${CYAN(col(fmt(r.input), 10, true))} ` +
      `${GRN(col(fmt(r.output), 9, true))} ` +
      `${col(fmt(r.cache_read), 9, true)} ` +
      `${col(r.model ?? '—', 20)}${costStr}`,
    );
    tIn  += r.input  ?? 0;
    tOut += r.output ?? 0;
  }

  console.log(hr);
  const totalCostStr = opts.cost ? ` ${col(fmtCost(tCost), 10, true)}` : '';
  console.log(
    BOLD(`${'TOTAL'.padEnd(25)} `) +
    CYAN(BOLD(col(fmt(tIn), 10, true))) + ' ' +
    GRN(BOLD(col(fmt(tOut), 9, true))) + totalCostStr,
  );
  console.log();
}

export function showByModel(opts = {}) {
  const db = openDB();
  const rows = queryAllByModel(db);
  db.close();

  if (opts.json) {
    const out = opts.cost ? addCostToRows(rows, r => r.model) : rows;
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  const hr = opts.cost ? HR_W : HR;
  console.log(BOLD('\nBy Model  (all time)'));
  console.log(hr);

  if (!rows.length) {
    console.log(DIM('  No sessions recorded yet.'));
    console.log();
    return;
  }

  const costHdr = opts.cost ? ` ${'COST'.padStart(10)}` : '';
  console.log(BOLD(`${'MODEL'.padEnd(32)} ${'SESS'.padStart(4)} ${'INPUT'.padStart(10)} ${'OUTPUT'.padStart(9)} ${'CACHE RD'.padStart(9)}${costHdr}`));
  console.log(hr);

  let tCost = 0;
  for (const r of rows) {
    let costStr = '';
    if (opts.cost) {
      const c = calcCost(r.model, r.input, r.output, r.cache_create, r.cache_read);
      tCost += c.total;
      costStr = ` ${col(fmtCost(c.total), 10, true)}`;
    }
    console.log(
      `${col(r.model ?? '—', 32)} ` +
      `${col(r.sessions, 4, true)} ` +
      `${CYAN(col(fmt(r.input), 10, true))} ` +
      `${GRN(col(fmt(r.output), 9, true))} ` +
      `${col(fmt(r.cache_read), 9, true)}${costStr}`,
    );
  }

  if (opts.cost) {
    console.log(hr);
    console.log(BOLD(`${'TOTAL'.padEnd(57)} ${col(fmtCost(tCost), 10, true)}`));
  }
  console.log();
}

export function showReplay(sessionId) {
  const db = openDB();
  const session = querySession(db, sessionId);
  db.close();

  if (!session) {
    console.error(`Session not found: ${sessionId}`);
    process.exit(1);
  }
  if (!session.transcript_path) {
    console.error('Transcript path not recorded for this session (was it recorded before tracking was enabled?)');
    process.exit(1);
  }

  let content;
  try {
    content = readFileSync(session.transcript_path, 'utf8');
  } catch {
    console.error(`Could not read transcript: ${session.transcript_path}`);
    process.exit(1);
  }

  const seenIds = new Set();
  const turns = [];

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    if (obj.isSidechain === true) continue;
    if (obj.type !== 'assistant') continue;
    const msg = obj.message;
    if (!msg?.usage || !msg.stop_reason) continue;
    if (msg.model === '<synthetic>') continue;
    const msgId = msg.id;
    if (msgId && seenIds.has(msgId)) continue;
    if (msgId) seenIds.add(msgId);
    turns.push({
      input:       msg.usage.input_tokens                    ?? 0,
      output:      msg.usage.output_tokens                   ?? 0,
      cacheCreate: msg.usage.cache_creation_input_tokens     ?? 0,
      cacheRead:   msg.usage.cache_read_input_tokens         ?? 0,
    });
  }

  console.log(BOLD(`\nSession ${sessionId.slice(0, 8)}…  ${shortPath(session.project_path)}`));
  console.log(HR);

  if (!turns.length) {
    console.log(DIM('  No API calls found in transcript.'));
    console.log();
    return;
  }

  console.log(BOLD(`${'TURN'.padStart(4)} ${'INPUT'.padStart(10)} ${'OUTPUT'.padStart(9)} ${'CACHE RD'.padStart(9)} ${'CUMUL IN'.padStart(10)} ${'CUMUL OUT'.padStart(10)}`));
  console.log(HR);

  let cumulIn = 0, cumulOut = 0;
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    cumulIn  += t.input;
    cumulOut += t.output;
    console.log(
      `${col(i + 1, 4, true)} ` +
      `${CYAN(col(fmt(t.input), 10, true))} ` +
      `${GRN(col(fmt(t.output), 9, true))} ` +
      `${col(fmt(t.cacheRead), 9, true)} ` +
      `${col(fmt(cumulIn), 10, true)} ` +
      `${col(fmt(cumulOut), 10, true)}`,
    );
  }

  console.log(HR);
  console.log(DIM(`  ${turns.length} API call${turns.length === 1 ? '' : 's'}`));
  console.log();
}
