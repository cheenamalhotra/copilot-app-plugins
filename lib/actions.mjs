import fs from 'node:fs';
import path from 'node:path';
import { appendHistory, loadConfig, saveConfig, SALVAGE_DIR } from './config.mjs';
import { git } from './git.mjs';

function salvage(candidate) {
  if (!candidate.exists || candidate.dirtyCount === 0) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(SALVAGE_DIR, `${stamp}_${path.basename(candidate.path)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function writeSalvage(candidate, dir) {
  const patch = await git(candidate.path, ['diff', 'HEAD']);
  fs.writeFileSync(path.join(dir, 'uncommitted.patch'), patch ?? '');

  // A patch only covers tracked files, so copy untracked ones verbatim.
  const listing = await git(candidate.path, ['ls-files', '--others', '--exclude-standard']);
  const untracked = listing ? listing.split('\n').filter(Boolean) : [];
  fs.writeFileSync(path.join(dir, 'untracked.txt'), untracked.join('\n'));
  for (const relative of untracked) {
    const source = path.join(candidate.path, relative);
    const target = path.join(dir, 'untracked', relative);
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
    } catch {
      /* unreadable or vanished files must not abort the cleanup */
    }
  }

  fs.writeFileSync(
    path.join(dir, 'meta.json'),
    JSON.stringify(
      {
        salvagedAt: new Date().toISOString(),
        path: candidate.path,
        branch: candidate.branch,
        repoPath: candidate.repoPath,
        untrackedCount: untracked.length,
        restore: `cd <worktree-or-clone> && git apply ${path.join(dir, 'uncommitted.patch')}`,
      },
      null,
      2,
    ),
  );
}

/**
 * Removes the given worktrees. Paths must come from a scan report so that
 * nothing outside a known worktree root can ever be targeted.
 */
export async function deleteWorktrees({ candidates, force = false, deleteBranch, dryRun = false }) {
  const config = loadConfig();
  const removeBranch = deleteBranch ?? config.deleteBranchWhenMerged;
  const results = [];

  for (const candidate of candidates) {
    const blockers = candidate.blockers ?? [];
    if (blockers.length && !force) {
      results.push({ path: candidate.path, action: 'skipped', reason: `blocked: ${blockers.join('; ')}` });
      continue;
    }
    if (dryRun) {
      results.push({ path: candidate.path, action: 'would-delete', reason: (candidate.reasons ?? []).join('; ') });
      continue;
    }

    let salvagedTo = null;
    try {
      const dir = salvage(candidate);
      if (dir) {
        await writeSalvage(candidate, dir);
        salvagedTo = dir;
      }

      const repoPath = candidate.repoPath;
      let warning = null;

      if (repoPath) {
        const args = ['worktree', 'remove', candidate.path];
        if (force || candidate.dirtyCount > 0) args.push('--force');
        if ((await git(repoPath, args)) === null) {
          warning = 'git worktree remove failed; directory removed directly';
        }
        await git(repoPath, ['worktree', 'prune']);
      } else {
        warning = 'no owning repo found; directory removed directly';
      }

      if (fs.existsSync(candidate.path)) {
        fs.rmSync(candidate.path, { recursive: true, force: true });
      }

      if (removeBranch && candidate.branch && candidate.mergedIntoBase && repoPath) {
        await git(repoPath, ['branch', '-d', candidate.branch]);
      }

      results.push({
        path: candidate.path,
        action: 'deleted',
        branch: candidate.branch,
        branchDeleted: Boolean(removeBranch && candidate.mergedIntoBase),
        salvagedTo,
        warning,
      });
    } catch (error) {
      results.push({ path: candidate.path, action: 'failed', reason: error.message, salvagedTo });
    }
  }

  if (!dryRun) appendHistory({ event: 'delete', results });
  return results;
}

export function keepWorktrees(paths) {
  const config = loadConfig();
  const keep = [...new Set([...config.keep, ...paths])];
  saveConfig({ keep });
  appendHistory({ event: 'keep', paths });
  return keep;
}

export function unkeepWorktrees(paths) {
  const config = loadConfig();
  const keep = config.keep.filter((entry) => !paths.includes(entry));
  saveConfig({ keep });
  return keep;
}
