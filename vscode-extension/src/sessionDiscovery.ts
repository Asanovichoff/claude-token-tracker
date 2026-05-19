import { existsSync, readdirSync, statSync, openSync, readSync, closeSync } from 'fs';
import { join } from 'path';
import { CLAUDE_PROJECTS_DIR } from './paths';

export interface ActiveSession {
  sessionId: string;
  transcriptPath: string;
  projectPath: string;
}

// Encode a filesystem path the same way Claude Code does:
// replace every "/" with "-"
function encodePath(p: string): string {
  return p.replace(/\//g, '-');
}

// Read the first N bytes of a file synchronously
function readHead(filePath: string, bytes = 8192): string {
  let fd: number | undefined;
  try {
    fd = openSync(filePath, 'r');
    const buf = Buffer.alloc(bytes);
    const read = readSync(fd, buf, 0, bytes, 0);
    return buf.subarray(0, read).toString('utf8');
  } catch {
    return '';
  } finally {
    if (fd !== undefined) { try { closeSync(fd); } catch {} }
  }
}

// Parse the first cwd field and first session_id from JSONL head bytes
function parseHeadInfo(head: string): { cwd: string | null; sessionId: string | null } {
  let cwd: string | null = null;
  let sessionId: string | null = null;

  for (const line of head.split('\n')) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      if (!cwd && typeof obj['cwd'] === 'string') cwd = obj['cwd'];
      if (!sessionId && typeof obj['sessionId'] === 'string') sessionId = obj['sessionId'];
      // Also look for session_id in various shapes
      if (!sessionId && typeof obj['session_id'] === 'string') sessionId = obj['session_id'];
      if (cwd && sessionId) break;
    } catch {}
  }
  return { cwd, sessionId };
}

export function discoverActiveSession(workspacePath: string): ActiveSession | null {
  const encoded = encodePath(workspacePath);
  const projectDir = join(CLAUDE_PROJECTS_DIR, encoded);

  if (!existsSync(projectDir)) return null;

  let files: { name: string; mtime: number }[];
  try {
    files = readdirSync(projectDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => {
        const full = join(projectDir, f);
        const mtime = statSync(full).mtimeMs;
        return { name: f, mtime };
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    return null;
  }

  for (const file of files) {
    const transcriptPath = join(projectDir, file.name);
    const head = readHead(transcriptPath);
    const { cwd, sessionId } = parseHeadInfo(head);

    // Skip files whose cwd doesn't match this workspace
    // (handles path-encoding ambiguity for paths sharing a common prefix)
    if (cwd && cwd !== workspacePath) continue;

    if (sessionId) {
      return {
        sessionId,
        transcriptPath,
        projectPath: cwd ?? workspacePath,
      };
    }
  }

  return null;
}
