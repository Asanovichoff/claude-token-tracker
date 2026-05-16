#!/usr/bin/env node --no-warnings
import { showToday, showWeek, showAllTime, showProject, showByModel, showReplay } from '../src/stats.js';

const rawArgs = process.argv.slice(2);
const flags   = new Set(rawArgs.filter(a => a.startsWith('--')));
const args    = rawArgs.filter(a => !a.startsWith('--'));
const opts    = { json: flags.has('--json'), cost: flags.has('--cost') };

const cmd = args[0] ?? 'today';

if (flags.has('--by-model')) {
  showByModel(opts);
} else if (cmd === 'replay') {
  const sessionId = args[1];
  if (!sessionId) {
    console.error('Usage: claude-tokens replay <session-id>');
    process.exit(1);
  }
  showReplay(sessionId);
} else {
  switch (cmd) {
    case 'today':
      showToday(opts);
      break;
    case 'week':
      showWeek(opts);
      break;
    case 'all':
      showAllTime(opts);
      break;
    case 'project': {
      const path = args[1];
      if (!path) {
        console.error('Usage: claude-tokens project <path>');
        process.exit(1);
      }
      showProject(path, opts);
      break;
    }
    default:
      console.log(`Usage: claude-tokens [today|week|all|project <path>|replay <id>] [--json] [--cost] [--by-model]

  today              Show today's usage by project  (default)
  week               Show the last 7 days
  all                Show all-time totals and top projects
  project <path>     Show sessions for a specific project
  replay <id>        Show per-turn token breakdown for a session

  --json             Output raw JSON instead of a formatted table
  --cost             Add estimated cost columns (USD)
  --by-model         Group all-time usage by model
`);
  }
}
