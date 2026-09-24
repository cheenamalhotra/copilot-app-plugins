#!/usr/bin/env node
import { getMyPriorities } from '../lib/priorities.mjs';
import { loadConfig, saveConfig } from '../lib/config.mjs';

const [, , cmd, ...rest] = process.argv;

function arg(name, fallback) {
  const idx = rest.indexOf(`--${name}`);
  return idx >= 0 ? rest[idx + 1] : fallback;
}

switch (cmd) {
  case 'list': {
    const { markdown } = getMyPriorities();
    console.log(markdown);
    break;
  }
  case 'config': {
    console.log(JSON.stringify(loadConfig(), null, 2));
    break;
  }
  case 'set-config': {
    const patch = {};
    if (arg('reposRoot')) patch.reposRoot = arg('reposRoot');
    const labels = arg('priorityLabels');
    if (labels) patch.priorityLabels = labels.split(',').map((s) => s.trim()).filter(Boolean);
    console.log(JSON.stringify(saveConfig(patch), null, 2));
    break;
  }
  default:
    console.log('Usage: priorities.mjs <list|config|set-config> [--reposRoot PATH] [--priorityLabels P0,P1,P2]');
    process.exit(cmd ? 1 : 0);
}
