#!/usr/bin/env node
import { generateStandup } from '../lib/standup.mjs';
import { loadConfig, saveConfig } from '../lib/config.mjs';

const [, , cmd, ...rest] = process.argv;

function arg(name, fallback) {
  const idx = rest.indexOf(`--${name}`);
  return idx >= 0 ? rest[idx + 1] : fallback;
}

switch (cmd) {
  case 'generate': {
    const days = arg('days') ? Number(arg('days')) : undefined;
    const { markdown } = generateStandup(days ? { days } : {});
    console.log(markdown);
    break;
  }
  case 'config': {
    console.log(JSON.stringify(loadConfig(), null, 2));
    break;
  }
  case 'set-config': {
    const patch = {};
    if (arg('days')) patch.days = Number(arg('days'));
    if (arg('reposRoot')) patch.reposRoot = arg('reposRoot');
    console.log(JSON.stringify(saveConfig(patch), null, 2));
    break;
  }
  default:
    console.log('Usage: standup.mjs <generate|config|set-config> [--days N] [--reposRoot PATH]');
    process.exit(cmd ? 1 : 0);
}
