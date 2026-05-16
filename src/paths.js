import { homedir } from 'node:os';
import { join } from 'node:path';

export const TRACKER_DIR = join(homedir(), '.claude', 'token-tracker');
export const DB_PATH = join(TRACKER_DIR, 'usage.db');
