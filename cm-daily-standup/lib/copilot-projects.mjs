import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

export const COPILOT_HOME = process.env.COPILOT_HOME || path.join(os.homedir(), '.copilot');
const DB_FILE = path.join(COPILOT_HOME, 'data.db');

// node:sqlite ships with Node 22+ on every platform (no external binary needed).
// Fall back to the sqlite3 CLI on older Node so the plugin still works there.
const require = createRequire(import.meta.url);
let DatabaseSync = null;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {
  /* older Node: fall back to CLI below */
}

// The app keeps data.db open in WAL mode. Query a snapshot copy so this never
// blocks or interferes with the running app.
function snapshot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-plugin-'));
  for (const suffix of ['', '-wal', '-shm']) {
    const src = `${DB_FILE}${suffix}`;
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, `data.db${suffix}`));
  }
  return { dir, file: path.join(dir, 'data.db') };
}

function queryViaNodeSqlite(file, sql) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return db.prepare(sql).all().map((row) => ({ ...row }));
  } finally {
    db.close();
  }
}

function queryViaCli(file, sql) {
  const { execFileSync } = require('node:child_process');
  const out = execFileSync('sqlite3', ['-readonly', '-json', file, sql], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
  return out ? JSON.parse(out) : [];
}

function query(file, sql) {
  return DatabaseSync ? queryViaNodeSqlite(file, sql) : queryViaCli(file, sql);
}

export function isAvailable() {
  return fs.existsSync(DB_FILE);
}

function withNameWithOwner(row) {
  return { ...row, nameWithOwner: row.owner && row.repo ? `${row.owner}/${row.repo}` : null };
}

/** Every project configured in Copilot App that has a local repo checkout, with its GitHub identity when linked. */
export function listProjects() {
  if (!isAvailable()) return [];
  const snap = snapshot();
  try {
    const rows = query(
      snap.file,
      `SELECT id, name, main_repo_path AS repoPath, github_owner AS owner, github_repo AS repo, default_branch AS defaultBranch
       FROM projects
       WHERE main_repo_path IS NOT NULL AND main_repo_path != ''`,
    );
    return rows.map(withNameWithOwner);
  } finally {
    fs.rmSync(snap.dir, { recursive: true, force: true });
  }
}

/**
 * Every local checkout path Copilot App knows about for every project: the main repo
 * path plus any active worktrees, deduped and filtered to paths that still exist on
 * disk. Each entry carries its project's repo identity so callers can group activity.
 */
export function listRepoCheckouts() {
  if (!isAvailable()) return [];
  const snap = snapshot();
  try {
    const projects = query(
      snap.file,
      `SELECT id, name, main_repo_path AS repoPath, github_owner AS owner, github_repo AS repo
       FROM projects WHERE main_repo_path IS NOT NULL AND main_repo_path != ''`,
    ).map(withNameWithOwner);
    const worktrees = query(snap.file, `SELECT project_id AS projectId, path FROM worktrees`);

    const byId = new Map(projects.map((p) => [p.id, p]));
    const checkouts = new Map(); // path -> project

    for (const p of projects) checkouts.set(p.repoPath, p);
    for (const w of worktrees) {
      const project = byId.get(w.projectId);
      if (project && w.path) checkouts.set(w.path, project);
    }

    return [...checkouts.entries()]
      .filter(([dirPath]) => fs.existsSync(dirPath))
      .map(([dirPath, project]) => ({
        path: dirPath,
        projectId: project.id,
        projectName: project.name,
        nameWithOwner: project.nameWithOwner,
      }));
  } finally {
    fs.rmSync(snap.dir, { recursive: true, force: true });
  }
}
