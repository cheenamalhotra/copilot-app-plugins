import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const COPILOT_HOME = process.env.COPILOT_HOME || path.join(os.homedir(), '.copilot');

export const DATA_DIR =
  process.env.STANDUP_DATA_DIR ||
  path.join(COPILOT_HOME, 'plugin-data', '_direct', 'cm-daily-standup');

const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

const DEFAULTS = {
  days: 1,
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
