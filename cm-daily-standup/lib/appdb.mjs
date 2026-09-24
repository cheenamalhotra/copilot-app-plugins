import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { COPILOT_HOME } from './config.mjs';

const DB_FILE = path.join(COPILOT_HOME, 'data.db');

const require = createRequire(import.meta.url);
let DatabaseSync = null;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {
  /* older Node: fall back to CLI below */
}

function snapshot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-standup-'));
  for (const suffix of ['', '-wal', '-shm']) {
    const src = `${DB_FILE}${suffix}`;
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, `data.db${suffix}`));
  }
  return { dir, file: path.join(dir, 'data.db') };
}

function queryViaNodeSqlite(file, sql, params) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return db.prepare(sql).all(...params).map((row) => ({ ...row }));
  } finally {
    db.close();
  }
}

function queryViaCli(file, sql, params) {
  const { execFileSync } = require('node:child_process');
  const interpolated = sql.replace(/\?/g, () => `'${params.shift()}'`);
  const out = execFileSync('sqlite3', ['-readonly', '-json', file, interpolated], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
  return out ? JSON.parse(out) : [];
}

function query(file, sql, params = []) {
  return DatabaseSync ? queryViaNodeSqlite(file, sql, [...params]) : queryViaCli(file, sql, [...params]);
}

export function isAvailable() {
  return fs.existsSync(DB_FILE);
}

/** Sessions updated since `sinceIso`, with the repo/project they belong to. */
export function gatherSessionActivity(sinceIso) {
  const byRepo = new Map();
  if (!isAvailable()) return byRepo;
  const snap = snapshot();
  try {
    const rows = query(
      snap.file,
      `SELECT s.title AS title, s.updated_at AS updatedAt, ws.branch AS branch,
              p.name AS projectName, p.github_owner AS ghOwner, p.github_repo AS ghRepo
       FROM sessions s
       LEFT JOIN workspaces ws ON ws.session_id = s.id
       LEFT JOIN projects p ON p.id = ws.project_id
       WHERE s.updated_at >= ? AND s.title IS NOT NULL
       ORDER BY s.updated_at DESC`,
      [sinceIso],
    );
    for (const row of rows) {
      const key = row.ghOwner && row.ghRepo ? `${row.ghOwner}/${row.ghRepo}` : row.projectName || 'unknown';
      if (!byRepo.has(key)) byRepo.set(key, []);
      byRepo.get(key).push({ title: row.title, branch: row.branch, updatedAt: row.updatedAt });
    }
    return byRepo;
  } finally {
    fs.rmSync(snap.dir, { recursive: true, force: true });
  }
}
