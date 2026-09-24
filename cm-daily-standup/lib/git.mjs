import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { listRepoCheckouts } from './copilot-projects.mjs';

function run(cwd, args) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

/** Best-effort repo display key when the Copilot App project has no linked GitHub repo. */
function fallbackRepoKey(dir) {
  const url = run(dir, ['remote', 'get-url', 'origin']);
  const match = url.match(/github\.com[:/]([^/]+\/[^/]+?)(\.git)?$/);
  if (match) return match[1];
  return path.basename(dir);
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

/** Git commits across every repo/worktree checkout Copilot App knows about. */
export function gatherGitActivity(days) {
  const email = authorEmail();
  const since = `${days} days ago`;
  const byRepo = new Map();
  const seenHashes = new Map(); // repoKey -> Set(hash), so main + worktree checkouts don't double-count

  for (const checkout of listRepoCheckouts()) {
    const commits = commitsSince(checkout.path, since, email);
    if (!commits.length) continue;
    const key = checkout.nameWithOwner || fallbackRepoKey(checkout.path);
    if (!byRepo.has(key)) byRepo.set(key, []);
    if (!seenHashes.has(key)) seenHashes.set(key, new Set());
    const seen = seenHashes.get(key);
    for (const commit of commits) {
      if (seen.has(commit.hash)) continue;
      seen.add(commit.hash);
      byRepo.get(key).push(commit);
    }
  }
  return byRepo;
}
