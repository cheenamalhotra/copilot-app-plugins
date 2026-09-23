#!/usr/bin/env node
import readline from 'node:readline';
import { deleteWorktrees, keepWorktrees, unkeepWorktrees } from '../lib/actions.mjs';
import { loadConfig, readReport, saveConfig, writeReport } from '../lib/config.mjs';
import { publicView, scan } from '../lib/scan.mjs';
import { installSchedule, scheduleStatus, uninstallSchedule } from '../lib/schedule.mjs';

const SERVER_INFO = { name: 'worktree-janitor', version: '1.0.0' };

const pathsArray = {
  type: 'array',
  items: { type: 'string' },
  description: 'Absolute worktree paths, exactly as returned by scan_worktrees.',
};

const TOOLS = [
  {
    name: 'scan_worktrees',
    description:
      'Scan Copilot App worktree directories and classify each as obsolete, review (has unsaved work), active, or keep. Always run this before deleting.',
    inputSchema: {
      type: 'object',
      properties: {
        staleDays: { type: 'number', description: 'Idle-day threshold for the stale rule. Defaults to config.' },
        status: {
          type: 'string',
          enum: ['all', 'obsolete', 'review', 'active', 'keep'],
          description: 'Filter results. Defaults to all.',
        },
      },
    },
  },
  {
    name: 'get_last_report',
    description: 'Return the most recent scan report, including scheduled background scans. Cheap; no git work.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['all', 'obsolete', 'review', 'active', 'keep'] },
      },
    },
  },
  {
    name: 'preview_delete',
    description: 'Dry run: show exactly what deleting the selected worktrees would do. No changes are made.',
    inputSchema: { type: 'object', properties: { paths: pathsArray }, required: ['paths'] },
  },
  {
    name: 'delete_worktrees',
    description:
      'Permanently remove the selected worktrees. Only call after the user has explicitly confirmed the exact list. Worktrees with unsaved work are skipped unless force is true; their uncommitted changes are saved as a patch first.',
    inputSchema: {
      type: 'object',
      properties: {
        paths: pathsArray,
        confirmed: { type: 'boolean', description: 'Must be true. Set only after the user confirms the list.' },
        force: { type: 'boolean', description: 'Also delete worktrees that have uncommitted or unpushed work.' },
        deleteBranch: { type: 'boolean', description: 'Also delete the local branch when it is merged into base.' },
      },
      required: ['paths', 'confirmed'],
    },
  },
  {
    name: 'keep_worktrees',
    description: 'Mark worktrees as keep-forever so future scans never suggest them.',
    inputSchema: { type: 'object', properties: { paths: pathsArray }, required: ['paths'] },
  },
  {
    name: 'unkeep_worktrees',
    description: 'Remove worktrees from the keep list.',
    inputSchema: { type: 'object', properties: { paths: pathsArray }, required: ['paths'] },
  },
  {
    name: 'get_config',
    description: 'Read janitor configuration: roots, stale threshold, rules, safety flags, keep list, schedule.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'set_config',
    description: 'Update janitor configuration. Accepts a partial object that is merged into the current config.',
    inputSchema: {
      type: 'object',
      properties: {
        staleDays: { type: 'number' },
        roots: { type: 'array', items: { type: 'string' } },
        protectDirty: { type: 'boolean' },
        protectUnpushed: { type: 'boolean' },
        deleteBranchWhenMerged: { type: 'boolean' },
        rules: {
          type: 'object',
          properties: {
            missingDirectory: { type: 'boolean' },
            orphanNotTracked: { type: 'boolean' },
            workspaceArchived: { type: 'boolean' },
            noWorkspace: { type: 'boolean' },
            pullRequestMerged: { type: 'boolean' },
            stale: { type: 'boolean' },
          },
        },
      },
    },
  },
  {
    name: 'configure_schedule',
    description: 'Install, remove, or inspect the recurring background scan (macOS launchd agent).',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['install', 'uninstall', 'status'] },
        intervalHours: { type: 'number', description: 'How often to scan. Default 24.' },
        notify: { type: 'boolean', description: 'Send a macOS notification when cleanup candidates are found.' },
      },
      required: ['action'],
    },
  },
];

function filterReport(report, status) {
  const worktrees = report.worktrees
    .filter((item) => !status || status === 'all' || item.status === status)
    .map(publicView);
  return { scannedAt: report.scannedAt, roots: report.roots, summary: report.summary, worktrees };
}

function selectFromReport(paths) {
  const report = readReport();
  if (!report) throw new Error('No scan report available. Run scan_worktrees first.');
  const byPath = new Map(report.worktrees.map((item) => [item.path, item]));
  const missing = paths.filter((item) => !byPath.has(item));
  if (missing.length) {
    throw new Error(`These paths are not in the last scan report, re-scan first: ${missing.join(', ')}`);
  }
  return paths.map((item) => byPath.get(item));
}

const handlers = {
  async scan_worktrees({ staleDays, status }) {
    const report = await scan({ configOverride: staleDays ? { staleDays } : undefined });
    writeReport(report);
    return filterReport(report, status);
  },

  async get_last_report({ status }) {
    const report = readReport();
    if (!report) return { scannedAt: null, message: 'No scan has run yet. Call scan_worktrees.' };
    return filterReport(report, status);
  },

  async preview_delete({ paths }) {
    return { results: await deleteWorktrees({ candidates: selectFromReport(paths), dryRun: true }) };
  },

  async delete_worktrees({ paths, confirmed, force, deleteBranch }) {
    if (!confirmed) throw new Error('Refusing to delete: user confirmation required (confirmed must be true).');
    const results = await deleteWorktrees({
      candidates: selectFromReport(paths),
      force: Boolean(force),
      deleteBranch,
    });
    const report = readReport();
    if (report) {
      const deleted = new Set(results.filter((r) => r.action === 'deleted').map((r) => r.path));
      report.worktrees = report.worktrees.filter((item) => !deleted.has(item.path));
      writeReport(report);
    }
    return { results };
  },

  async keep_worktrees({ paths }) {
    return { keep: keepWorktrees(paths) };
  },

  async unkeep_worktrees({ paths }) {
    return { keep: unkeepWorktrees(paths) };
  },

  async get_config() {
    return loadConfig();
  },

  async set_config(patch) {
    return saveConfig(patch);
  },

  async configure_schedule({ action, intervalHours, notify }) {
    if (action === 'install') return installSchedule({ intervalHours, notify });
    if (action === 'uninstall') return uninstallSchedule();
    return scheduleStatus();
  },
};

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function dispatch(request) {
  const { id, method, params } = request;
  if (method === 'initialize') {
    return {
      protocolVersion: params?.protocolVersion ?? '2024-11-05',
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
    };
  }
  if (method === 'tools/list') return { tools: TOOLS };
  if (method === 'tools/call') {
    const handler = handlers[params?.name];
    if (!handler) throw new Error(`Unknown tool: ${params?.name}`);
    const result = await handler(params.arguments ?? {});
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
  if (method === 'ping') return {};
  throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let request;
  try {
    request = JSON.parse(trimmed);
  } catch {
    return;
  }
  if (request.id === undefined) return; // notification
  try {
    send({ jsonrpc: '2.0', id: request.id, result: await dispatch(request) });
  } catch (error) {
    send({
      jsonrpc: '2.0',
      id: request.id,
      error: { code: error.code ?? -32000, message: error.message },
    });
  }
});
