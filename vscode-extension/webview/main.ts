// Webview script — runs in the browser context inside VSCode's sandbox.
// Communicates with the extension host via acquireVsCodeApi().postMessage().

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

interface ProjectRow { project_path: string; input: number; output: number; cache_create: number; cache_read: number; sessions: number; }
interface DayRow { date: string; input: number; output: number; cache_create: number; cache_read: number; sessions: number; projects: number; }
interface AllTimeRow { input: number; output: number; cache_create: number; cache_read: number; sessions: number; projects: number; }
interface ModelRow { model: string | null; input: number; output: number; cache_create: number; cache_read: number; sessions: number; }
interface LiveCounts { sessionId: string; inputTokens: number; outputTokens: number; cacheCreateTokens: number; cacheReadTokens: number; model: string | null; turnCount: number; }
interface DashboardData { today: ProjectRow[]; week: DayRow[]; allTime: AllTimeRow | undefined; topProjects: ProjectRow[]; byModel: ModelRow[]; todayDate: string; }

const vscodeApi = acquireVsCodeApi();

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtT(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return `${n}`;
}

function fmtC(usd: number): string {
  if (usd < 0.01) return '<$0.01';
  return `$${usd.toFixed(2)}`;
}

// Simple cost calculation mirroring pricing.ts (avoid importing Node modules)
interface Tier { match: string; input: number; output: number; cacheWrite: number; cacheRead: number; }
const TIERS: Tier[] = [
  { match: 'opus-4',   input: 15,   output: 75,   cacheWrite: 18.75, cacheRead: 1.50  },
  { match: 'sonnet-4', input: 3,    output: 15,   cacheWrite: 3.75,  cacheRead: 0.30  },
  { match: 'haiku-4',  input: 0.80, output: 4,    cacheWrite: 1.00,  cacheRead: 0.08  },
  { match: 'opus-3',   input: 15,   output: 75,   cacheWrite: 18.75, cacheRead: 1.50  },
  { match: 'sonnet-3', input: 3,    output: 15,   cacheWrite: 3.75,  cacheRead: 0.30  },
  { match: 'haiku-3',  input: 0.25, output: 1.25, cacheWrite: 0.31,  cacheRead: 0.03  },
];
const FB: Tier = { match: '', input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.30 };

function rowCost(model: string | null | undefined, row: { input: number; output: number; cache_create: number; cache_read: number }): number {
  const t = model ? (TIERS.find(x => model.toLowerCase().includes(x.match)) ?? FB) : FB;
  const M = 1_000_000;
  return (row.input / M * t.input) + (row.output / M * t.output) +
         (row.cache_create / M * t.cacheWrite) + (row.cache_read / M * t.cacheRead);
}

function shortPath(p: string): string {
  const home = p.match(/^\/[^/]+\/[^/]+/)?.[0] ?? '';
  return p.startsWith(home) ? '~' + p.slice(home.length) : p;
}

function e(tag: string, attrs: Record<string, string> = {}, children: (Node | string)[] = []): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of children) el.append(c);
  return el;
}

// ── State ─────────────────────────────────────────────────────────────────────

let dashboard: DashboardData | null = null;
let live: LiveCounts | null = null;
let activeTab = 'today';

// ── Render ────────────────────────────────────────────────────────────────────

function render(): void {
  renderContent();
  renderLiveBar();
}

function renderContent(): void {
  const content = document.getElementById('content')!;
  content.innerHTML = '';

  if (!dashboard) {
    content.append(e('div', { class: 'empty' }, ['Loading…']));
    return;
  }

  switch (activeTab) {
    case 'today':   content.append(renderToday(dashboard)); break;
    case 'week':    content.append(renderWeek(dashboard)); break;
    case 'alltime': content.append(renderAllTime(dashboard)); break;
    case 'model':   content.append(renderByModel(dashboard)); break;
  }
}

function projectTable(rows: ProjectRow[], model?: string | null): HTMLElement {
  const wrap = document.createDocumentFragment();

  const thead = e('thead', {}, [
    e('tr', {}, [
      e('th', {}, ['Project']),
      e('th', {}, ['Sess']),
      e('th', {}, ['Input']),
      e('th', {}, ['Output']),
      e('th', {}, ['Cache']),
      e('th', { class: 'cost' }, ['Cost']),
    ]),
  ]);

  const tbody = document.createElement('tbody');
  let totalIn = 0, totalOut = 0, totalC = 0, totalCr = 0, totalSess = 0, totalCost = 0;

  for (const row of rows) {
    const cost = rowCost(model, row);
    totalIn += row.input; totalOut += row.output; totalC += row.cache_create; totalCr += row.cache_read;
    totalSess += row.sessions; totalCost += cost;
    tbody.append(e('tr', {}, [
      e('td', { title: row.project_path }, [shortPath(row.project_path)]),
      e('td', {}, [`${row.sessions}`]),
      e('td', {}, [fmtT(row.input)]),
      e('td', {}, [fmtT(row.output)]),
      e('td', {}, [fmtT(row.cache_read)]),
      e('td', { class: 'cost' }, [fmtC(cost)]),
    ]));
  }

  tbody.append(e('tr', { class: 'total-row' }, [
    e('td', {}, ['TOTAL']),
    e('td', {}, [`${totalSess}`]),
    e('td', {}, [fmtT(totalIn)]),
    e('td', {}, [fmtT(totalOut)]),
    e('td', {}, [fmtT(totalCr)]),
    e('td', { class: 'cost' }, [fmtC(totalCost)]),
  ]));

  const table = e('table', {});
  table.append(thead, tbody);
  const container = document.createElement('div');
  container.append(table);
  return container;
}

function renderToday(d: DashboardData): HTMLElement {
  const wrap = document.createElement('div');
  const title = e('div', { class: 'section-title' }, [`Today · ${d.todayDate}`]);
  wrap.append(title);
  if (d.today.length === 0) {
    wrap.append(e('div', { class: 'empty' }, ['No sessions today yet.']));
  } else {
    wrap.append(projectTable(d.today));
  }
  return wrap;
}

function renderWeek(d: DashboardData): HTMLElement {
  const wrap = document.createElement('div');
  wrap.append(e('div', { class: 'section-title' }, ['Last 7 days']));

  if (d.week.length === 0) {
    wrap.append(e('div', { class: 'empty' }, ['No sessions in the last 7 days.']));
    return wrap;
  }

  const thead = e('thead', {}, [
    e('tr', {}, [
      e('th', {}, ['Date']),
      e('th', {}, ['Sess']),
      e('th', {}, ['Projects']),
      e('th', {}, ['Input']),
      e('th', {}, ['Output']),
      e('th', { class: 'cost' }, ['Cost']),
    ]),
  ]);

  const tbody = document.createElement('tbody');
  for (const row of d.week) {
    const cost = rowCost(null, row);
    tbody.append(e('tr', {}, [
      e('td', {}, [row.date]),
      e('td', {}, [`${row.sessions}`]),
      e('td', {}, [`${row.projects}`]),
      e('td', {}, [fmtT(row.input)]),
      e('td', {}, [fmtT(row.output)]),
      e('td', { class: 'cost' }, [fmtC(cost)]),
    ]));
  }

  const table = e('table', {});
  table.append(thead, tbody);
  wrap.append(table);
  return wrap;
}

function renderAllTime(d: DashboardData): HTMLElement {
  const wrap = document.createElement('div');
  wrap.append(e('div', { class: 'section-title' }, ['All time']));

  if (d.allTime) {
    const at = d.allTime;
    const cost = rowCost(null, at);
    const grid = e('div', { class: 'stat-grid' }, [
      e('div', { class: 'stat-card' }, [e('div', { class: 'label' }, ['Sessions']), e('div', { class: 'value' }, [`${at.sessions}`])]),
      e('div', { class: 'stat-card' }, [e('div', { class: 'label' }, ['Projects']), e('div', { class: 'value' }, [`${at.projects}`])]),
      e('div', { class: 'stat-card' }, [e('div', { class: 'label' }, ['Total input']), e('div', { class: 'value' }, [fmtT(at.input + at.cache_read)])]),
      e('div', { class: 'stat-card' }, [e('div', { class: 'label' }, ['Est. cost']), e('div', { class: 'value cost' }, [fmtC(cost)])]),
    ]);
    wrap.append(grid);
  }

  wrap.append(e('div', { class: 'section-title' }, ['Top projects']));
  if (d.topProjects.length > 0) {
    wrap.append(projectTable(d.topProjects));
  } else {
    wrap.append(e('div', { class: 'empty' }, ['No data yet.']));
  }

  return wrap;
}

function renderByModel(d: DashboardData): HTMLElement {
  const wrap = document.createElement('div');
  wrap.append(e('div', { class: 'section-title' }, ['By model']));

  if (d.byModel.length === 0) {
    wrap.append(e('div', { class: 'empty' }, ['No data yet.']));
    return wrap;
  }

  const thead = e('thead', {}, [
    e('tr', {}, [
      e('th', {}, ['Model']),
      e('th', {}, ['Sess']),
      e('th', {}, ['Input']),
      e('th', {}, ['Output']),
      e('th', { class: 'cost' }, ['Cost']),
    ]),
  ]);

  const tbody = document.createElement('tbody');
  for (const row of d.byModel) {
    const cost = rowCost(row.model, row);
    tbody.append(e('tr', {}, [
      e('td', { title: row.model ?? 'unknown' }, [row.model ?? 'unknown']),
      e('td', {}, [`${row.sessions}`]),
      e('td', {}, [fmtT(row.input)]),
      e('td', {}, [fmtT(row.output)]),
      e('td', { class: 'cost' }, [fmtC(cost)]),
    ]));
  }

  const table = e('table', {});
  table.append(thead, tbody);
  wrap.append(table);
  return wrap;
}

function renderLiveBar(): void {
  const bar = document.getElementById('live-bar')!;
  if (!live || (live.inputTokens === 0 && live.outputTokens === 0 && live.cacheReadTokens === 0)) {
    bar.classList.add('hidden');
    return;
  }
  bar.classList.remove('hidden');
  const totalIn = live.inputTokens + live.cacheReadTokens;
  const cost = live.inputTokens / 1e6 * 3 + live.outputTokens / 1e6 * 15 +
               live.cacheCreateTokens / 1e6 * 3.75 + live.cacheReadTokens / 1e6 * 0.30;
  bar.innerHTML = `<span><span class="live-dot"></span>Live session</span>
    <span>${fmtT(totalIn)} in · ${fmtT(live.outputTokens)} out · ${fmtC(cost)}</span>`;
}

// ── Event handling ────────────────────────────────────────────────────────────

document.querySelectorAll<HTMLButtonElement>('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    activeTab = btn.dataset['tab'] ?? 'today';
    renderContent();
  });
});

document.getElementById('refresh-btn')?.addEventListener('click', () => {
  vscodeApi.postMessage({ type: 'refresh' });
});

window.addEventListener('message', (event: MessageEvent<{ type: string; data?: DashboardData; counts?: LiveCounts }>) => {
  const msg = event.data;
  if (msg.type === 'dashboard' && msg.data) {
    dashboard = msg.data;
    render();
  } else if (msg.type === 'live' && msg.counts) {
    live = msg.counts;
    renderLiveBar();
  }
});
