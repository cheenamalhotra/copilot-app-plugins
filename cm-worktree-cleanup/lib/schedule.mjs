import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DATA_DIR, loadConfig, saveConfig } from './config.mjs';

export const LABEL = 'com.github.copilot.worktree-janitor';
const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(PLUGIN_ROOT, 'bin', 'janitor.mjs');
const PLATFORM = process.platform;

function run(command, args) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    return String(error.stderr || error.message || '').trim();
  }
}

function hasCommand(command) {
  const probe = PLATFORM === 'win32' ? ['where', [command]] : ['which', [command]];
  try {
    execFileSync(probe[0], probe[1], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function scanArgs(notify) {
  const args = [CLI, 'scan', '--write'];
  if (notify) args.push('--notify');
  return args;
}

// ---------------------------------------------------------------- macOS ---

const DARWIN_PLIST_PATH = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);

function darwinPlist(intervalHours, notify) {
  const args = [process.execPath, ...scanArgs(notify)];
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

function darwinInstall(hours, shouldNotify) {
  fs.mkdirSync(path.dirname(DARWIN_PLIST_PATH), { recursive: true });
  fs.writeFileSync(DARWIN_PLIST_PATH, darwinPlist(hours, shouldNotify));
  const uid = process.getuid();
  run('launchctl', ['bootout', `gui/${uid}/${LABEL}`]);
  const output = run('launchctl', ['bootstrap', `gui/${uid}`, DARWIN_PLIST_PATH]);
  return { target: DARWIN_PLIST_PATH, detail: output || 'loaded' };
}

function darwinUninstall() {
  const uid = process.getuid();
  run('launchctl', ['bootout', `gui/${uid}/${LABEL}`]);
  if (fs.existsSync(DARWIN_PLIST_PATH)) fs.unlinkSync(DARWIN_PLIST_PATH);
  return { target: DARWIN_PLIST_PATH };
}

function darwinStatus() {
  const installed = fs.existsSync(DARWIN_PLIST_PATH);
  const info = installed ? run('launchctl', ['print', `gui/${process.getuid()}/${LABEL}`]) : '';
  const state = /state = (.+)/.exec(info)?.[1]?.trim() ?? (installed ? 'unknown' : 'not installed');
  const programPath = /program = (.+)/.exec(info)?.[1]?.trim() ?? null;
  return {
    installed,
    registered: Boolean(info && !info.includes('Could not find')),
    state,
    target: DARWIN_PLIST_PATH,
    interpreterPath: programPath,
  };
}

function darwinNotify(title, message) {
  run('osascript', ['-e', `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`]);
}

// ---------------------------------------------------------------- Linux ---
// Prefer a systemd --user timer; fall back to crontab when systemd is unavailable
// (minimal containers, some WSL1 setups).

const LINUX_UNIT_DIR = path.join(os.homedir(), '.config', 'systemd', 'user');
const LINUX_SERVICE_PATH = path.join(LINUX_UNIT_DIR, `${LABEL}.service`);
const LINUX_TIMER_PATH = path.join(LINUX_UNIT_DIR, `${LABEL}.timer`);
const CRON_MARKER = `# worktree-janitor (${LABEL})`;

function systemdAvailable() {
  return hasCommand('systemctl');
}

function linuxSystemdInstall(hours, shouldNotify) {
  fs.mkdirSync(LINUX_UNIT_DIR, { recursive: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const args = scanArgs(shouldNotify);
  fs.writeFileSync(
    LINUX_SERVICE_PATH,
    `[Unit]
Description=Worktree Janitor scan

[Service]
Type=oneshot
ExecStart=${process.execPath} ${args.map((a) => `"${a}"`).join(' ')}
StandardOutput=append:${path.join(DATA_DIR, 'schedule.log')}
StandardError=append:${path.join(DATA_DIR, 'schedule.err.log')}
`,
  );
  fs.writeFileSync(
    LINUX_TIMER_PATH,
    `[Unit]
Description=Worktree Janitor schedule

[Timer]
OnUnitActiveSec=${Math.round(hours * 3600)}s
OnBootSec=5min
Persistent=true

[Install]
WantedBy=timers.target
`,
  );
  run('systemctl', ['--user', 'daemon-reload']);
  const output = run('systemctl', ['--user', 'enable', '--now', `${LABEL}.timer`]);
  return { target: LINUX_TIMER_PATH, detail: output || 'enabled' };
}

function linuxSystemdUninstall() {
  run('systemctl', ['--user', 'disable', '--now', `${LABEL}.timer`]);
  for (const file of [LINUX_SERVICE_PATH, LINUX_TIMER_PATH]) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  run('systemctl', ['--user', 'daemon-reload']);
  return { target: LINUX_TIMER_PATH };
}

function linuxSystemdStatus() {
  const installed = fs.existsSync(LINUX_TIMER_PATH);
  const state = installed ? run('systemctl', ['--user', 'is-active', `${LABEL}.timer`]) : 'not installed';
  return { installed, registered: installed, state, target: LINUX_TIMER_PATH, interpreterPath: process.execPath };
}

function readCrontab() {
  return run('crontab', ['-l']);
}

function linuxCronInstall(hours, shouldNotify) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const minutes = Math.max(1, Math.round(hours * 60));
  const args = [...scanArgs(shouldNotify)].map((a) => `"${a}"`).join(' ');
  const line = `*/${minutes} * * * * ${process.execPath} ${args} >> ${path.join(DATA_DIR, 'schedule.log')} 2>> ${path.join(DATA_DIR, 'schedule.err.log')} ${CRON_MARKER}`;
  const existing = readCrontab();
  const kept = (existing || '')
    .split('\n')
    .filter((l) => l && !l.includes(CRON_MARKER));
  const next = [...kept, line].join('\n') + '\n';
  const tmp = path.join(os.tmpdir(), `wt-janitor-cron-${Date.now()}.txt`);
  fs.writeFileSync(tmp, next);
  const output = run('crontab', [tmp]);
  fs.rmSync(tmp, { force: true });
  return { target: 'crontab', detail: output || 'installed' };
}

function linuxCronUninstall() {
  const existing = readCrontab();
  const kept = (existing || '').split('\n').filter((l) => l && !l.includes(CRON_MARKER));
  const tmp = path.join(os.tmpdir(), `wt-janitor-cron-${Date.now()}.txt`);
  fs.writeFileSync(tmp, kept.length ? kept.join('\n') + '\n' : '');
  run('crontab', [tmp]);
  fs.rmSync(tmp, { force: true });
  return { target: 'crontab' };
}

function linuxCronStatus() {
  const existing = readCrontab();
  const installed = Boolean(existing && existing.includes(CRON_MARKER));
  return {
    installed,
    registered: installed,
    state: installed ? 'scheduled' : 'not installed',
    target: 'crontab',
    interpreterPath: process.execPath,
  };
}

function linuxNotify(title, message) {
  if (hasCommand('notify-send')) run('notify-send', [title, message]);
}

// -------------------------------------------------------------- Windows ---

const WIN_TASK_NAME = 'WorktreeJanitor';

function winInstall(hours, shouldNotify) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const args = scanArgs(shouldNotify)
    .map((a) => `\\"${a}\\"`)
    .join(' ');
  const taskRun = `\\"${process.execPath}\\" ${args}`;
  run('schtasks', ['/Delete', '/TN', WIN_TASK_NAME, '/F']);
  const output =
    hours < 24
      ? run('schtasks', [
          '/Create', '/TN', WIN_TASK_NAME, '/TR', taskRun,
          '/SC', 'HOURLY', '/MO', String(Math.max(1, Math.round(hours))), '/F',
        ])
      : run('schtasks', [
          '/Create', '/TN', WIN_TASK_NAME, '/TR', taskRun,
          '/SC', 'DAILY', '/MO', String(Math.max(1, Math.round(hours / 24))), '/F',
        ]);
  return { target: WIN_TASK_NAME, detail: output || 'created' };
}

function winUninstall() {
  const output = run('schtasks', ['/Delete', '/TN', WIN_TASK_NAME, '/F']);
  return { target: WIN_TASK_NAME, detail: output };
}

function winStatus() {
  const info = run('schtasks', ['/Query', '/TN', WIN_TASK_NAME, '/FO', 'LIST']);
  const installed = Boolean(info) && !/ERROR/i.test(info);
  const state = /Status:\s*(.+)/.exec(info)?.[1]?.trim() ?? (installed ? 'unknown' : 'not installed');
  return { installed, registered: installed, state, target: WIN_TASK_NAME, interpreterPath: process.execPath };
}

function winNotify(title, message) {
  // Best effort: a balloon tip via a short-lived PowerShell script. No bundled
  // dependency required; silently skipped if PowerShell is unavailable.
  const script = `
Add-Type -AssemblyName System.Windows.Forms
$n = New-Object System.Windows.Forms.NotifyIcon
$n.Icon = [System.Drawing.SystemIcons]::Information
$n.Visible = $true
$n.ShowBalloonTip(5000, '${title.replace(/'/g, "''")}', '${message.replace(/'/g, "''")}', [System.Windows.Forms.ToolTipIcon]::Info)
Start-Sleep -Seconds 6
$n.Dispose()
`;
  try {
    execFileSync('powershell', ['-NoProfile', '-Command', script], { stdio: 'ignore' });
  } catch {
    /* notifications are best-effort */
  }
}

// -------------------------------------------------------------- dispatch --

function backend() {
  if (PLATFORM === 'darwin') {
    return { install: darwinInstall, uninstall: darwinUninstall, status: darwinStatus, notify: darwinNotify };
  }
  if (PLATFORM === 'win32') {
    return { install: winInstall, uninstall: winUninstall, status: winStatus, notify: winNotify };
  }
  // linux and other unix-likes
  if (systemdAvailable()) {
    return {
      install: linuxSystemdInstall,
      uninstall: linuxSystemdUninstall,
      status: linuxSystemdStatus,
      notify: linuxNotify,
    };
  }
  return { install: linuxCronInstall, uninstall: linuxCronUninstall, status: linuxCronStatus, notify: linuxNotify };
}

export function installSchedule({ intervalHours, notify } = {}) {
  const config = loadConfig();
  const hours = intervalHours ?? config.schedule.intervalHours;
  const shouldNotify = notify ?? config.schedule.notify;

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const { target, detail } = backend().install(hours, shouldNotify);

  saveConfig({ schedule: { enabled: true, intervalHours: hours, notify: shouldNotify } });
  return { platform: PLATFORM, target, intervalHours: hours, notify: shouldNotify, detail };
}

export function uninstallSchedule() {
  const { target } = backend().uninstall();
  saveConfig({ schedule: { enabled: false } });
  return { removed: true, platform: PLATFORM, target };
}

export function scheduleStatus() {
  const config = loadConfig();
  const info = backend().status();
  const status = { platform: PLATFORM, config: config.schedule, ...info };
  // A Node upgrade (nvm in particular) can invalidate the recorded interpreter path.
  if (info.interpreterPath && !fs.existsSync(info.interpreterPath)) {
    status.warning = `Scheduled node interpreter is missing: ${info.interpreterPath}. Re-run schedule install.`;
  }
  return status;
}

export function notify(title, message) {
  try {
    backend().notify(title, message);
  } catch {
    /* notifications are best-effort */
  }
}
