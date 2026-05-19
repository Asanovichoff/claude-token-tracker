import { homedir } from 'os';
import { join } from 'path';

export const TRACKER_DIR = join(homedir(), '.claude', 'token-tracker');
export const DB_PATH = join(TRACKER_DIR, 'usage.db');
export const CLAUDE_DIR = join(homedir(), '.claude');
export const CLAUDE_PROJECTS_DIR = join(homedir(), '.claude', 'projects');
export const CLAUDE_SETTINGS_PATH = join(homedir(), '.claude', 'settings.json');
