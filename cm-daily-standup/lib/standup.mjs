import { loadConfig } from './config.mjs';
import { gatherGitActivity } from './git.mjs';
import { gatherGitHubActivity } from './github.mjs';
import { gatherSessionActivity } from './appdb.mjs';

function mergeInto(combined, byRepo, bucket) {
  for (const [repo, items] of byRepo) {
    if (!combined.has(repo)) combined.set(repo, { commits: [], prs: [], sessions: [] });
    combined.get(repo)[bucket].push(...items);
  }
}

export function generateStandup(overrides = {}) {
  const config = loadConfig();
  const days = overrides.days ?? config.days;
  const reposRoot = overrides.reposRoot ?? config.reposRoot;

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const sinceIso = since.toISOString();
  const sinceDate = sinceIso.slice(0, 10);

  const combined = new Map();
  mergeInto(combined, gatherGitActivity(reposRoot, days), 'commits');
  mergeInto(combined, gatherGitHubActivity(sinceDate), 'prs');
  mergeInto(combined, gatherSessionActivity(sinceIso), 'sessions');

  const repos = [...combined.keys()].sort((a, b) => a.localeCompare(b));

  let md = `# Standup — last ${days} day${days === 1 ? '' : 's'}\n\n`;
  if (!repos.length) {
    md += '_No git commits, GitHub activity, or Copilot App sessions found in this window._\n';
    return { markdown: md, days, reposRoot, repoCount: 0 };
  }

  for (const repo of repos) {
    const { commits, prs, sessions } = combined.get(repo);
    md += `## ${repo}\n\n`;
    if (commits.length) {
      md += `**Commits**\n`;
      for (const c of commits) md += `- \`${c.hash}\` (${c.date}) ${c.subject}\n`;
      md += '\n';
    }
    if (prs.length) {
      md += `**PRs / Issues**\n`;
      const order = ['Opened', 'Updated', 'Reviewed', 'Merged', 'Closed', 'Commented'];
      const byAction = new Map();
      for (const p of prs) {
        for (const action of p.actions ?? ['Updated']) {
          if (!byAction.has(action)) byAction.set(action, []);
          byAction.get(action).push(p);
        }
      }
      for (const action of order) {
        const items = byAction.get(action);
        if (!items?.length) continue;
        md += `- ${action}:\n`;
        for (const p of items) md += `  - [${p.kind} #${p.number}](${p.url}) ${p.title}\n`;
      }
      md += '\n';
    }
    if (sessions.length) {
      md += `**Copilot sessions**\n`;
      for (const s of sessions) {
        const branch = s.branch ? ` \`${s.branch}\`` : '';
        md += `- ${s.title}${branch}\n`;
      }
      md += '\n';
    }
  }

  return { markdown: md.trim() + '\n', days, reposRoot, repoCount: repos.length };
}
