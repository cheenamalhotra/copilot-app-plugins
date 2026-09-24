import { execFileSync } from 'node:child_process';

function hasGh() {
  try {
    execFileSync('gh', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function ghJson(args) {
  try {
    const out = execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return JSON.parse(out || '[]');
  } catch {
    return [];
  }
}

/** Index of the first matching label in `priorityLabels` (lower = higher priority), or -1 if none match. */
function priorityRank(labels, priorityLabels) {
  const names = new Set((labels || []).map((l) => l.name.toLowerCase()));
  for (let i = 0; i < priorityLabels.length; i++) {
    if (names.has(priorityLabels[i].toLowerCase())) return i;
  }
  return -1;
}

function labelNames(labels) {
  return (labels || []).map((l) => l.name);
}

const JSON_FIELDS = 'number,title,url,labels,updatedAt';

/**
 * For each repo, gathers:
 *  - assigned: open issues assigned to you
 *  - reviewRequested: open PRs where your review is requested
 *  - pickable: open, unassigned issues matching a priority label
 * Each item carries a `rank` (label index, -1 = unranked) for sorting; results within
 * each bucket are sorted by rank ascending (unranked last).
 */
export function gatherPriorities(repos, priorityLabels) {
  const byRepo = new Map();
  if (!hasGh()) return byRepo;

  for (const repo of repos) {
    const assigned = ghJson(['issue', 'list', '-R', repo, '--assignee', '@me', '--state', 'open', '--json', JSON_FIELDS, '--limit', '50']);
    const reviewRequested = ghJson(['pr', 'list', '-R', repo, '--search', 'review-requested:@me', '--state', 'open', '--json', JSON_FIELDS, '--limit', '50']);
    const pickable = ghJson(['issue', 'list', '-R', repo, '--search', 'no:assignee', '--state', 'open', '--json', JSON_FIELDS, '--limit', '100']).filter(
      (i) => priorityRank(i.labels, priorityLabels) >= 0,
    );

    const toItem = (i) => ({
      number: i.number,
      title: i.title,
      url: i.url,
      labels: labelNames(i.labels),
      rank: priorityRank(i.labels, priorityLabels),
    });

    const bySortedRank = (items) => items.map(toItem).sort((a, b) => {
      const ra = a.rank < 0 ? Infinity : a.rank;
      const rb = b.rank < 0 ? Infinity : b.rank;
      return ra - rb;
    });

    const entry = {
      assigned: bySortedRank(assigned),
      reviewRequested: bySortedRank(reviewRequested),
      pickable: bySortedRank(pickable),
    };
    if (entry.assigned.length || entry.reviewRequested.length || entry.pickable.length) {
      byRepo.set(repo, entry);
    }
  }
  return byRepo;
}
