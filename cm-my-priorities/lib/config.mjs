import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const COPILOT_HOME = process.env.COPILOT_HOME || path.join(os.homedir(), '.copilot');

export const DATA_DIR =
  process.env.PRIORITIES_DATA_DIR ||
  path.join(COPILOT_HOME, 'plugin-data', '_direct', 'cm-my-priorities');

const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

// Order matters: earlier labels rank higher (P0 above P1, etc).
const DEFAULTS = {
  priorityLabels: ['P0', 'P1', 'P2', 'priority', 'critical'],
  // Exact label names (case-insensitive) that mean an issue is waiting on someone else.
  // Labels not in this list still get picked up by a generic waiting/blocked/stale pattern.
  waitingLabels: ['waiting for customer', 'needs-author-feedback', 'more information needed'],
};

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadConfig() {
  ensureDataDir();
  if (!fs.existsSync(CONFIG_FILE)) return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveConfig(partial) {
  const merged = { ...loadConfig(), ...partial };
  ensureDataDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
  return merged;
}
