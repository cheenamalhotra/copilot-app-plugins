import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function run(cwd, args) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

/** "owner/repo" from the origin remote when it's GitHub, else null (not a GitHub repo). */
function githubRepoKey(dir) {
  const url = run(dir, ['remote', 'get-url', 'origin']);
  const match = url.match(/github\.com[:/]([^/]+\/[^/]+?)(\.git)?$/);
  return match ? match[1] : null;
}

/** Find git repo roots under `root`, up to `maxDepth` levels deep. */
function discoverRepoDirs(root, maxDepth = 3) {
  const found = new Set();
  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((e) => e.name === '.git')) {
      found.add(dir);
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      walk(path.join(dir, e.name), depth + 1);
    }
  }
  walk(root, 0);
  return [...found];
}

/** GitHub "owner/repo" names for every local git repo under `root` that has a github.com origin, deduped. */
export function discoverGitHubRepos(root) {
  const repos = new Set();
  for (const dir of discoverRepoDirs(root)) {
    const key = githubRepoKey(dir);
    if (key) repos.add(key);
  }
  return [...repos];
}
