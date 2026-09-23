import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function git(cwd, args, { allowFailure = true } = {}) {
  try {
    const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    return stdout.trim();
  } catch (error) {
    if (allowFailure) return null;
    throw new Error(String(error.stderr || error.message).trim());
  }
}

export async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

export async function listWorktrees(repoPath) {
  const raw = await git(repoPath, ['worktree', 'list', '--porcelain']);
  if (raw === null) return [];
  const entries = [];
  let current = null;
  for (const line of raw.split('\n')) {
    if (line.startsWith('worktree ')) {
      current = { path: line.slice(9), branch: null, head: null, prunable: false, locked: false };
      entries.push(current);
    } else if (!current) {
      continue;
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice(7).replace('refs/heads/', '');
    } else if (line.startsWith('HEAD ')) {
      current.head = line.slice(5);
    } else if (line.startsWith('prunable')) {
      current.prunable = true;
    } else if (line.startsWith('locked')) {
      current.locked = true;
    }
  }
  return entries.slice(1); // index 0 is the main checkout
}

export async function inspectWorktree(worktreePath) {
  const [status, upstream, lastCommitAt, lastCommitSubject] = await Promise.all([
    git(worktreePath, ['status', '--porcelain']),
    git(worktreePath, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']),
    git(worktreePath, ['log', '-1', '--format=%cI']),
    git(worktreePath, ['log', '-1', '--format=%s']),
  ]);
  const dirtyFiles = status ? status.split('\n').filter(Boolean) : [];
  let unpushed = 0;
  if (upstream) {
    const count = await git(worktreePath, ['rev-list', '--count', `${upstream}..HEAD`]);
    unpushed = Number(count ?? 0);
  }
  return {
    dirtyCount: dirtyFiles.length,
    dirtySample: dirtyFiles.slice(0, 10),
    hasUpstream: Boolean(upstream),
    unpushed,
    lastCommitAt,
    lastCommitSubject,
  };
}

export async function mergedBranches(repoPath, baseRef) {
  if (!baseRef) return new Set();
  const merged = await git(repoPath, ['branch', '--merged', baseRef, '--format=%(refname:short)']);
  return new Set(merged ? merged.split('\n').filter(Boolean) : []);
}

export async function resolveBaseRef(repoPath, defaultBranch) {
  const candidates = [
    defaultBranch && `origin/${defaultBranch}`,
    defaultBranch,
    'origin/main',
    'main',
    'origin/master',
    'master',
  ].filter(Boolean);
  for (const ref of candidates) {
    if (await git(repoPath, ['rev-parse', '--verify', '--quiet', ref])) return ref;
  }
  return null;
}
