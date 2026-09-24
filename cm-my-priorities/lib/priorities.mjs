import { loadConfig } from './config.mjs';
import { discoverGitHubRepos } from './repos.mjs';
import { gatherPriorities } from './github.mjs';

const PR_STATUS_ORDER = { 'changes-requested': 0, 'review-requested': 1, approved: 2, draft: 3 };
const ISSUE_STATUS_ORDER = { open: 0, 'has-pr': 1, waiting: 2 };

function byRank(a, b) {
  const ra = a.rank < 0 ? Infinity : a.rank;
  const rb = b.rank < 0 ? Infinity : b.rank;
  if (ra !== rb) return ra - rb;
  return new Date(b.updatedAt) - new Date(a.updatedAt); // more recent first, as a tiebreak
}

function sortPRs(items) {
  return [...items].sort((a, b) => {
    const sa = PR_STATUS_ORDER[a.status.kind] ?? 9;
    const sb = PR_STATUS_ORDER[b.status.kind] ?? 9;
    if (sa !== sb) return sa - sb;
    return byRank(a, b);
  });
}

function sortIssues(items) {
  return [...items].sort((a, b) => {
    const sa = ISSUE_STATUS_ORDER[a.status.kind] ?? 9;
    const sb = ISSUE_STATUS_ORDER[b.status.kind] ?? 9;
    if (sa !== sb) return sa - sb;
    return byRank(a, b);
  });
}

function truncate(title, max = 72) {
  return title.length > max ? `${title.slice(0, max - 1).trimEnd()}…` : title;
}

function tableRow(item) {
  const link = item._kind === 'issue' ? `[#${item.number}](${item.url})` : `[PR #${item.number}](${item.url})`;
  return `| ${link} | ${item.status.text} | ${truncate(item.title)} |`;
}

// Groups items by repo while preserving overall order: the repo of the first (highest
// priority) item leads, then the next repo not yet seen, and so on.
function groupByRepo(items) {
  const order = [];
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.repo)) {
      groups.set(item.repo, []);
      order.push(item.repo);
    }
    groups.get(item.repo).push(item);
  }
  return order.map((repo) => ({ repo, items: groups.get(repo) }));
}

function table(items) {
  if (!items.length) return '_None found._\n';
  let md = '';
  for (const { repo, items: repoItems } of groupByRepo(items)) {
    md += `**${repo}**\n\n| # | Status | Title |\n| --- | --- | --- |\n`;
    for (const item of repoItems) md += `${tableRow(item)}\n`;
    md += '\n';
  }
  return md;
}

export function getMyPriorities(overrides = {}) {
  const config = loadConfig();
  const priorityLabels = overrides.priorityLabels ?? config.priorityLabels;
  const waitingLabels = overrides.waitingLabels ?? config.waitingLabels;

  const repos = discoverGitHubRepos();
  const { assigned, reviewRequested, pickable } = gatherPriorities(repos, priorityLabels, waitingLabels);

  const tag = (kind) => (items) => items.map((i) => ({ ...i, _kind: kind }));
  const sortedAssigned = sortIssues(tag('issue')(assigned));
  const sortedReview = sortPRs(tag('pr')(reviewRequested));
  const sortedPickable = sortIssues(tag('issue')(pickable));

  const changesRequestedCount = reviewRequested.filter((i) => i.status.kind === 'changes-requested').length;
  const draftCount = reviewRequested.filter((i) => i.status.kind === 'draft').length;

  const generatedAt = new Date().toISOString();
  let md = `# My priorities\n\n`;
  md += `_Generated ${generatedAt} · repos: ${repos.length} · priority labels: ${priorityLabels.join(', ')}_\n\n`;

  if (!repos.length) {
    md += '_No Copilot App projects with a linked GitHub repo were found._\n';
    return { markdown: md, repoCount: 0 };
  }

  md += `**Summary:** ${assigned.length} assigned issue${assigned.length === 1 ? '' : 's'}`;
  md += ` | ${reviewRequested.length} review request${reviewRequested.length === 1 ? '' : 's'}`;
  md += ` | ${changesRequestedCount} changes requested`;
  md += ` | ${draftCount} draft${draftCount === 1 ? '' : 's'}`;
  md += ` | ${pickable.length} pickable\n\n`;

  // "Do next": the most actionable items first — PRs blocking on you, then issues you
  // haven't opened a PR for yet. Capped so it stays scannable; full lists follow below.
  const doNext = [
    ...sortedReview.filter((i) => i.status.kind === 'changes-requested'),
    ...sortedReview.filter((i) => i.status.kind === 'review-requested'),
    ...sortedAssigned.filter((i) => i.status.kind === 'open'),
  ].slice(0, 10);

  md += `## Do next\n\n`;
  md += doNext.length
    ? `${table(doNext)}\n`
    : '_Nothing urgent — no changes-requested PRs, pending reviews, or unstarted assigned issues._\n\n';

  md += `## Assigned issues (${assigned.length})\n\n${table(sortedAssigned)}\n`;
  md += `## Awaiting review (${reviewRequested.length})\n\n${table(sortedReview)}\n`;
  md += `## Open priority issues to pick up (${pickable.length})\n\n${table(sortedPickable)}\n`;

  return {
    markdown: md.trim() + '\n',
    repoCount: repos.length,
    priorityLabels,
    counts: {
      assigned: assigned.length,
      reviewRequested: reviewRequested.length,
      changesRequested: changesRequestedCount,
      drafts: draftCount,
      pickable: pickable.length,
    },
  };
}
