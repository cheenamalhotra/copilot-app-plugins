import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const COPILOT_HOME = process.env.COPILOT_HOME || path.join(os.homedir(), '.copilot');
export const DATA_DIR =
  process.env.WORKTREE_JANITOR_DATA_DIR ||
  path.join(COPILOT_HOME, 'plugin-data', '_direct', 'worktree-janitor');

export const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
export const REPORT_PATH = path.join(DATA_DIR, 'last-report.json');
export const HISTORY_PATH = path.join(DATA_DIR, 'history.jsonl');
export const SALVAGE_DIR = path.join(DATA_DIR, 'salvage');

export const DEFAULT_CONFIG = {
  roots: [],
  staleDays: 14,
  rules: {
    missingDirectory: true,
    orphanNotTracked: true,
    workspaceArchived: true,
    noWorkspace: true,
    pullRequestMerged: true,
    stale: true,
  },
  keep: [],
  protectDirty: true,
  protectUnpushed: true,
  deleteBranchWhenMerged: false,
  schedule: { enabled: false, intervalHours: 24, notify: true },
};

function deepMerge(base, override) {
  if (!override || typeof override !== 'object' || Array.isArray(override)) return override ?? base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(override)) {
    out[key] = key in out && !Array.isArray(out[key]) && typeof out[key] === 'object'
      ? deepMerge(out[key], value)
      : value;
  }
  return out;
}

export function loadConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return deepMerge(DEFAULT_CONFIG, raw);
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}

export function saveConfig(config) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const merged = deepMerge(loadConfig(), config);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2));
  return merged;
}

export function writeReport(report) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  return REPORT_PATH;
}

export function readReport() {
  try {
    return JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
  } catch {
    return null;
  }
}

export function appendHistory(entry) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.appendFileSync(HISTORY_PATH, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
}
