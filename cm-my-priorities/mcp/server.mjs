#!/usr/bin/env node
import readline from 'node:readline';
import { getMyPriorities } from '../lib/priorities.mjs';
import { loadConfig, saveConfig } from '../lib/config.mjs';

const SERVER_INFO = { name: 'cm-my-priorities', version: '1.0.0' };

const TOOLS = [
  {
    name: 'list_priorities',
    description:
      'List your top-priority work across all GitHub repos you have locally: open issues assigned to you, open PRs awaiting your review, and open unassigned issues matching your priority labels that you could pick up. Grouped by repo, sorted by priority label rank. Each item includes a best-effort status (e.g. "Has PR #123", "Waiting for customer", "Draft", "Approved").',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_config',
    description: 'Read priorities configuration: the priority label list (ranked, first = highest) and waiting-on-someone-else labels.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'set_config',
    description: 'Update priorities configuration. Accepts a partial object merged into the current config.',
    inputSchema: {
      type: 'object',
      properties: {
        priorityLabels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Ordered list of label names, highest priority first (e.g. ["P0","P1","P2","priority","critical"]).',
        },
        waitingLabels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Label names that mean an issue is waiting on someone else (e.g. customer, more info). Case-insensitive exact match; a generic waiting/blocked/stale pattern is also applied as a fallback.',
        },
      },
    },
  },
];

const handlers = {
  async list_priorities() {
    return getMyPriorities();
  },
  async get_config() {
    return loadConfig();
  },
  async set_config(patch) {
    return saveConfig(patch);
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
