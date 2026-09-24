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

// Fallback pattern for "waiting on someone else" labels when a repo's label isn't in
// the configured waitingLabels list (repos name these differently: "needs-author-feedback",
// "waiting for customer", "more-information-needed", "stale", etc).
const WAITING_LABEL_PATTERN = /waiting|needs?[\s-]?(feedback|info|response|author)|no[\s-]?repro|blocked|on[\s-]?hold|stale/i;

/** Best-effort issue status: linked PR takes priority over a "waiting on X" label. */
function issueStatus(issue, waitingLabels) {
  const linkedPRs = (issue.closedByPullRequestsReferences || []).map((pr) => pr.number);
  if (linkedPRs.length) return { text: `Has PR #${linkedPRs.join(', #')}`, kind: 'has-pr' };

  const waitingSet = new Set((waitingLabels || []).map((l) => l.toLowerCase()));
  const match = (issue.labels || []).find(
    (l) => waitingSet.has(l.name.toLowerCase()) || WAITING_LABEL_PATTERN.test(l.name),
  );
  if (match) return { text: match.name, kind: 'waiting' };

  return { text: 'Open', kind: 'open' };
}

/** Best-effort PR status from review state. */
function prStatus(pr) {
  if (pr.isDraft) return { text: 'Draft', kind: 'draft' };
  if (pr.reviewDecision === 'CHANGES_REQUESTED') return { text: 'Changes requested', kind: 'changes-requested' };
  if (pr.reviewDecision === 'APPROVED') return { text: 'Approved', kind: 'approved' };
  return { text: 'Review requested', kind: 'review-requested' };
}

const ISSUE_FIELDS = 'number,title,url,labels,updatedAt,closedByPullRequestsReferences';
const PR_FIELDS = 'number,title,url,labels,updatedAt,isDraft,reviewDecision';

/**
 * Gathers, across all repos combined:
 *  - assigned: open issues assigned to you
 *  - reviewRequested: open PRs where your review is requested
 *  - pickable: open, unassigned issues matching a priority label
 * Each item carries `repo`, a `rank` (label index, -1 = unranked), `updatedAt`, and a
 * `status` (e.g. "Has PR #123", "Waiting for customer", "Draft", "Review requested").
 * Unsorted — callers decide ordering.
 */
export function gatherPriorities(repos, priorityLabels, waitingLabels) {
  const result = { assigned: [], reviewRequested: [], pickable: [] };
  if (!hasGh()) return result;

  for (const repo of repos) {
    const assigned = ghJson(['issue', 'list', '-R', repo, '--assignee', '@me', '--state', 'open', '--json', ISSUE_FIELDS, '--limit', '50']);
    const reviewRequested = ghJson(['pr', 'list', '-R', repo, '--search', 'review-requested:@me', '--state', 'open', '--json', PR_FIELDS, '--limit', '50']);
    const pickable = ghJson(['issue', 'list', '-R', repo, '--search', 'no:assignee', '--state', 'open', '--json', ISSUE_FIELDS, '--limit', '100']).filter(
      (i) => priorityRank(i.labels, priorityLabels) >= 0,
    );

    const toIssueItem = (i) => ({
      repo,
      number: i.number,
      title: i.title,
      url: i.url,
      labels: labelNames(i.labels),
      rank: priorityRank(i.labels, priorityLabels),
      updatedAt: i.updatedAt,
      status: issueStatus(i, waitingLabels),
    });

    const toPrItem = (i) => ({
      repo,
      number: i.number,
      title: i.title,
      url: i.url,
      labels: labelNames(i.labels),
      rank: priorityRank(i.labels, priorityLabels),
      updatedAt: i.updatedAt,
      status: prStatus(i),
    });

    result.assigned.push(...assigned.map(toIssueItem));
    result.reviewRequested.push(...reviewRequested.map(toPrItem));
    result.pickable.push(...pickable.map(toIssueItem));
  }
  return result;
}
