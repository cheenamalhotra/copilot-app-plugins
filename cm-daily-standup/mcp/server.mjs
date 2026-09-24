#!/usr/bin/env node
import readline from 'node:readline';
import { generateStandup } from '../lib/standup.mjs';
import { loadConfig, saveConfig } from '../lib/config.mjs';

const SERVER_INFO = { name: 'cm-daily-standup', version: '1.0.0' };

const TOOLS = [
  {
    name: 'generate_standup',
    description:
      'Generate a standup summary grouped by repo: your git commits, GitHub PRs/issues you authored/reviewed/commented on, and Copilot App sessions you worked in, within a rolling window of days.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'How many days back to cover. Defaults to config (1).' },
      },
    },
  },
  {
    name: 'get_config',
    description: 'Read standup configuration: default days window.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'set_config',
    description: 'Update standup configuration. Accepts a partial object merged into the current config.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Default rolling window in days.' },
      },
    },
  },
];

const handlers = {
  async generate_standup({ days } = {}) {
    return generateStandup(days ? { days } : {});
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
