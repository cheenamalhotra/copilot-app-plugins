import { loadConfig } from './config.mjs';
import { discoverGitHubRepos } from './repos.mjs';
import { gatherPriorities } from './github.mjs';

function renderItem(item) {
  const labelTag = item.rank >= 0 ? ` \`${item.labels.join(', ')}\`` : '';
  return `- [#${item.number}](${item.url}) ${item.title}${labelTag}\n`;
}

export function getMyPriorities(overrides = {}) {
  const config = loadConfig();
  const priorityLabels = overrides.priorityLabels ?? config.priorityLabels;

  const repos = discoverGitHubRepos();
  const byRepo = gatherPriorities(repos, priorityLabels);
  const repoNames = [...byRepo.keys()].sort((a, b) => a.localeCompare(b));

  let md = `# My priorities\n\n`;
  if (!repoNames.length) {
    md += '_Nothing assigned to you, awaiting your review, or open priority issues found._\n';
    return { markdown: md, repoCount: 0 };
  }

  for (const repo of repoNames) {
    const { assigned, reviewRequested, pickable } = byRepo.get(repo);
    md += `## ${repo}\n\n`;
    if (assigned.length) {
      md += `**Assigned to you**\n`;
      for (const item of assigned) md += renderItem(item);
      md += '\n';
    }
    if (reviewRequested.length) {
      md += `**Awaiting your review**\n`;
      for (const item of reviewRequested) md += renderItem(item);
      md += '\n';
    }
    if (pickable.length) {
      md += `**Open priority issues you could pick up**\n`;
      for (const item of pickable) md += renderItem(item);
      md += '\n';
    }
  }

  return { markdown: md.trim() + '\n', repoCount: repoNames.length, priorityLabels };
}
