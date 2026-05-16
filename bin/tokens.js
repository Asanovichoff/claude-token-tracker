#!/usr/bin/env node --no-warnings
import { showToday, showWeek, showAllTime, showProject } from '../src/stats.js';

const args = process.argv.slice(2);
const cmd = args[0] ?? 'today';

switch (cmd) {
  case 'today':
    showToday();
    break;
  case 'week':
    showWeek();
    break;
  case 'all':
    showAllTime();
    break;
  case 'project': {
    const path = args[1];
    if (!path) {
      console.error('Usage: claude-tokens project <path>');
      process.exit(1);
    }
    showProject(path);
    break;
  }
  default:
    console.log(`Usage: claude-tokens [today|week|all|project <path>]

  today          Show today's token usage by project  (default)
  week           Show the last 7 days
  all            Show all-time totals and top projects
  project <path> Show sessions for a specific project
`);
}
