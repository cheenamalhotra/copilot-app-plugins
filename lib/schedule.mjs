import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DATA_DIR, loadConfig, saveConfig } from './config.mjs';

export const LABEL = 'com.github.copilot.worktree-janitor';
const PLIST_PATH = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(PLUGIN_ROOT, 'bin', 'janitor.mjs');

function launchctl(args) {
  try {
    return execFileSync('launchctl', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    return String(error.stderr || error.message).trim();
  }
}

function plist(intervalHours, notify) {
  const nodePath = process.execPath;
  const args = [nodePath, CLI, 'scan', '--write'];
  if (notify) args.push('--notify');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>${args.map((arg) => `\n    <string>${arg}</string>`).join('')}
  </array>
  <key>StartInterval</key><integer>${Math.round(intervalHours * 3600)}</integer>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>${path.join(DATA_DIR, 'schedule.log')}</string>
  <key>StandardErrorPath</key><string>${path.join(DATA_DIR, 'schedule.err.log')}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
</dict>
</plist>
`;
}

export function installSchedule({ intervalHours, notify } = {}) {
  const config = loadConfig();
  const hours = intervalHours ?? config.schedule.intervalHours;
  const shouldNotify = notify ?? config.schedule.notify;

  fs.mkdirSync(path.dirname(PLIST_PATH), { recursive: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(PLIST_PATH, plist(hours, shouldNotify));

  const uid = process.getuid();
  launchctl(['bootout', `gui/${uid}/${LABEL}`]);
  const output = launchctl(['bootstrap', `gui/${uid}`, PLIST_PATH]);

  saveConfig({ schedule: { enabled: true, intervalHours: hours, notify: shouldNotify } });
  return { plistPath: PLIST_PATH, intervalHours: hours, notify: shouldNotify, launchctl: output || 'loaded' };
}

export function uninstallSchedule() {
  const uid = process.getuid();
  launchctl(['bootout', `gui/${uid}/${LABEL}`]);
  if (fs.existsSync(PLIST_PATH)) fs.unlinkSync(PLIST_PATH);
  saveConfig({ schedule: { enabled: false } });
  return { removed: true, plistPath: PLIST_PATH };
}

export function scheduleStatus() {
  const config = loadConfig();
  const installed = fs.existsSync(PLIST_PATH);
  const info = installed ? launchctl(['print', `gui/${process.getuid()}/${LABEL}`]) : '';
  const state = /state = (.+)/.exec(info)?.[1]?.trim() ?? (installed ? 'unknown' : 'not installed');
  const nodePath = /program = (.+)/.exec(info)?.[1]?.trim() ?? null;
  const status = { installed, registered: Boolean(info && !info.includes('Could not find')), state, plistPath: PLIST_PATH, config: config.schedule };
  // A Node upgrade (nvm in particular) can invalidate the recorded interpreter path.
  if (nodePath && !fs.existsSync(nodePath)) {
    status.warning = `Scheduled node interpreter is missing: ${nodePath}. Re-run schedule install.`;
  }
  return status;
}

export function notify(title, message) {
  try {
    execFileSync('osascript', [
      '-e',
      `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`,
    ]);
  } catch {
    /* notifications are best-effort */
  }
}
