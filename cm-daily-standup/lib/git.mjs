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

/** Repo display name: "owner/repo" from the origin remote when it's GitHub, else the folder name. */
function repoKey(dir) {
  const url = run(dir, ['remote', 'get-url', 'origin']);
  const match = url.match(/github\.com[:/]([^/]+\/[^/]+?)(\.git)?$/);
  if (match) return match[1];
  return path.basename(dir);
}

/** Find git repo roots under `root`, up to `maxDepth` levels deep (handles nested worktree layouts). */
export function discoverRepos(root, maxDepth = 3) {
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
      return; // don't descend into a repo's own subdirectories
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      walk(path.join(dir, e.name), depth + 1);
    }
  }
  walk(root, 0);
  return [...found];
}

export function authorEmail() {
  return run(process.cwd(), ['config', '--global', 'user.email']);
}

/** Commits by `email` in `dir` since `sinceIso`. */
export function commitsSince(dir, sinceIso, email) {
  const args = [
    'log',
    `--since=${sinceIso}`,
    '--no-merges',
    '--date=short',
    '--pretty=format:%h|%ad|%s',
  ];
  if (email) args.push(`--author=${email}`);
  const out = run(dir, args);
  if (!out) return [];
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, date, ...subjectParts] = line.split('|');
      return { hash, date, subject: subjectParts.join('|') };
    });
}

export function gatherGitActivity(root, days) {
  const email = authorEmail();
  const since = `${days} days ago`;
  const byRepo = new Map();
  for (const dir of discoverRepos(root)) {
    const commits = commitsSince(dir, since, email);
    if (!commits.length) continue;
    const key = repoKey(dir);
    if (!byRepo.has(key)) byRepo.set(key, []);
    byRepo.get(key).push(...commits);
  }
  return byRepo;
}
