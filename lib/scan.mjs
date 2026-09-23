import fs from 'node:fs';
import path from 'node:path';
import { loadAppState } from './appdb.mjs';
import { loadConfig } from './config.mjs';
import { inspectWorktree, listWorktrees, mapLimit, mergedBranches, resolveBaseRef } from './git.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;

function daysSince(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  return Math.floor((Date.now() - time) / DAY_MS);
}

function newest(...values) {
  const times = values
    .map((value) => (value ? new Date(value).getTime() : Number.NaN))
    .filter((time) => !Number.isNaN(time));
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

function directoryMtime(dirPath) {
  try {
    return fs.statSync(dirPath).mtime.toISOString();
  } catch {
    return null;
  }
}

function discoverRootDirectories(roots) {
  const found = new Map();
  for (const root of roots) {
    let repoDirs = [];
    try {
      repoDirs = fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    } catch {
      continue;
    }
    for (const repoDir of repoDirs) {
      const repoRoot = path.join(root, repoDir.name);
      let children = [];
      try {
        children = fs.readdirSync(repoRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
      } catch {
        continue;
      }
      for (const child of children) {
        const full = path.join(repoRoot, child.name);
        if (fs.existsSync(path.join(full, '.git'))) found.set(full, { path: full, root, repoGroup: repoDir.name });
      }
    }
  }
  return found;
}

function classify(candidate, config) {
  const reasons = [];
  const rules = config.rules;

  if (config.keep.includes(candidate.path)) {
    return { status: 'keep', reasons: ['on keep list'] };
  }
  if (candidate.sessionRunning) {
    return { status: 'active', reasons: ['session is currently running'] };
  }
  if (candidate.locked) {
    return { status: 'active', reasons: ['git worktree is locked'] };
  }

  if (rules.missingDirectory && !candidate.exists) {
    reasons.push('directory is gone but git still registers it');
  }
  if (rules.orphanNotTracked && candidate.exists && !candidate.inAppDb) {
    reasons.push('not tracked by Copilot App');
  }
  if (rules.workspaceArchived && candidate.archivedAt) {
    reasons.push(`session archived ${daysSince(candidate.archivedAt)}d ago`);
  }
  if (rules.noWorkspace && candidate.inAppDb && !candidate.workspaceId) {
    reasons.push('no Copilot session references it');
  }
  if (rules.pullRequestMerged && (candidate.prMergedAt || candidate.prState?.toLowerCase() === 'merged')) {
    reasons.push(`PR #${candidate.prNumber ?? '?'} merged`);
  }
  if (rules.stale && candidate.idleDays !== null && candidate.idleDays >= config.staleDays) {
    reasons.push(`idle ${candidate.idleDays}d (threshold ${config.staleDays}d)`);
  }

  if (!reasons.length) return { status: 'active', reasons: ['in use'] };

  const blockers = [];
  if (config.protectDirty && candidate.dirtyCount > 0) blockers.push(`${candidate.dirtyCount} uncommitted file(s)`);
  if (config.protectUnpushed && candidate.unpushed > 0) blockers.push(`${candidate.unpushed} unpushed commit(s)`);
  if (config.protectUnpushed && candidate.exists && !candidate.hasUpstream && !candidate.mergedIntoBase) {
    blockers.push('branch never pushed and not merged into base');
  }

  return blockers.length
    ? { status: 'review', reasons, blockers }
    : { status: 'obsolete', reasons, blockers: [] };
}

export async function scan({ configOverride } = {}) {
  const config = { ...loadConfig(), ...configOverride };
  const app = loadAppState();

  const roots = new Set(config.roots);
  for (const record of app.worktrees) roots.add(path.dirname(path.dirname(record.path)));
  if (!roots.size) roots.add(path.join(process.env.HOME || '', 'Code', 'copilot-worktrees'));

  const projectsById = new Map(app.projects.map((project) => [project.id, project]));
  const candidates = new Map();

  const upsert = (worktreePath, patch) => {
    const existing = candidates.get(worktreePath) || { path: worktreePath };
    candidates.set(worktreePath, { ...existing, ...patch });
  };

  for (const record of app.worktrees) {
    const project = projectsById.get(record.projectId);
    upsert(record.path, {
      ...record,
      inAppDb: true,
      projectName: project?.name ?? null,
      repoPath: project?.repoPath ?? null,
      defaultBranch: project?.defaultBranch ?? null,
    });
  }

  for (const [dirPath, info] of discoverRootDirectories([...roots])) {
    if (!candidates.has(dirPath)) upsert(dirPath, { inAppDb: false, repoGroup: info.repoGroup });
  }

  // Ask every known repo what git itself believes, so stale registrations surface too.
  const repoPaths = new Set(app.projects.map((project) => project.repoPath).filter(Boolean));
  for (const candidate of candidates.values()) if (candidate.repoPath) repoPaths.add(candidate.repoPath);

  const registries = await mapLimit([...repoPaths], 6, async (repoPath) => ({
    repoPath,
    entries: await listWorktrees(repoPath),
    baseRef: await resolveBaseRef(repoPath, app.projects.find((p) => p.repoPath === repoPath)?.defaultBranch),
  }));

  const mergedByRepo = new Map(
    await mapLimit(registries, 4, async (registry) => [
      registry.repoPath,
      await mergedBranches(registry.repoPath, registry.baseRef),
    ]),
  );

  for (const registry of registries) {
    for (const entry of registry.entries) {
      upsert(entry.path, {
        gitRegistered: true,
        prunable: entry.prunable,
        locked: entry.locked,
        branch: candidates.get(entry.path)?.branch ?? entry.branch,
        repoPath: candidates.get(entry.path)?.repoPath ?? registry.repoPath,
        baseRef: registry.baseRef,
      });
    }
  }

  const list = [...candidates.values()];
  await mapLimit(list, 8, async (candidate) => {
    candidate.exists = fs.existsSync(candidate.path);
    candidate.gitRegistered = Boolean(candidate.gitRegistered);
    candidate.inAppDb = Boolean(candidate.inAppDb);
    candidate.sessionRunning = Boolean(candidate.sessionRunning);
    candidate.dirtyCount = 0;
    candidate.unpushed = 0;
    candidate.hasUpstream = false;
    candidate.diskMtime = directoryMtime(candidate.path);

    if (candidate.exists) {
      Object.assign(candidate, await inspectWorktree(candidate.path));
    }
    const merged = mergedByRepo.get(candidate.repoPath);
    candidate.mergedIntoBase = Boolean(candidate.branch && merged?.has(candidate.branch));
    candidate.lastActivityAt = newest(
      candidate.lastCommitAt,
      candidate.diskMtime,
      candidate.workspaceUpdatedAt,
      candidate.sessionUpdatedAt,
    );
    candidate.idleDays = daysSince(candidate.lastActivityAt);
    Object.assign(candidate, classify(candidate, config));
  });

  list.sort((a, b) => (b.idleDays ?? -1) - (a.idleDays ?? -1));

  const buckets = { obsolete: [], review: [], active: [], keep: [] };
  for (const candidate of list) buckets[candidate.status].push(candidate);

  return {
    scannedAt: new Date().toISOString(),
    roots: [...roots],
    config: { staleDays: config.staleDays, rules: config.rules, protectDirty: config.protectDirty, protectUnpushed: config.protectUnpushed },
    summary: {
      total: list.length,
      obsolete: buckets.obsolete.length,
      review: buckets.review.length,
      active: buckets.active.length,
      keep: buckets.keep.length,
    },
    worktrees: list,
  };
}

export function publicView(candidate) {
  return {
    path: candidate.path,
    project: candidate.projectName ?? candidate.repoGroup ?? null,
    branch: candidate.branch,
    status: candidate.status,
    reasons: candidate.reasons,
    blockers: candidate.blockers ?? [],
    idleDays: candidate.idleDays,
    dirtyCount: candidate.dirtyCount,
    unpushed: candidate.unpushed,
    mergedIntoBase: candidate.mergedIntoBase,
    pr: candidate.prNumber ? { number: candidate.prNumber, state: candidate.prState, url: candidate.prUrl } : null,
    sessionTitle: candidate.sessionTitle ?? candidate.workspaceName ?? null,
    exists: candidate.exists,
  };
}
