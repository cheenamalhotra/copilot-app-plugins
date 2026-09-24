import { execFileSync } from 'node:child_process';

function hasGh() {
  try {
    execFileSync('gh', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const JSON_FIELDS = 'repository,number,title,url,state,createdAt,updatedAt,closedAt';

function search(kind, filterFlag, sinceDate) {
  try {
    const out = execFileSync(
      'gh',
      ['search', kind, filterFlag, `--updated=>=${sinceDate}`, '--json', JSON_FIELDS, '--limit', '50'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return JSON.parse(out || '[]');
  } catch {
    return [];
  }
}

/** Which action(s) this item represents in the window, e.g. Opened, Reviewed, Merged, Closed, Commented, Updated. */
function classifyActions(item, tags, sinceMs) {
  const actions = new Set();
  const createdAt = item.createdAt ? Date.parse(item.createdAt) : NaN;
  const closedAt = item.closedAt ? Date.parse(item.closedAt) : NaN;

  if (tags.has('authored') && createdAt >= sinceMs) actions.add('Opened');
  if (item.state === 'merged' && closedAt >= sinceMs) actions.add('Merged');
  else if (item.state === 'closed' && closedAt >= sinceMs) actions.add('Closed');
  if (tags.has('reviewed')) actions.add('Reviewed');
  if (tags.has('commented')) actions.add('Commented');
  if (!actions.size) actions.add('Updated');

  return actions;
}

/** PRs/issues you authored, commented on, or reviewed, updated since `sinceDate` (YYYY-MM-DD). */
export function gatherGitHubActivity(sinceDate) {
  const byRepo = new Map();
  if (!hasGh()) return byRepo;

  const queries = [
    ['prs', '--author=@me', 'authored'],
    ['prs', '--commenter=@me', 'commented'],
    ['prs', '--reviewed-by=@me', 'reviewed'],
    ['issues', '--author=@me', 'authored'],
    ['issues', '--commenter=@me', 'commented'],
  ];

  const sinceMs = Date.parse(`${sinceDate}T00:00:00Z`);
  const byUrl = new Map(); // url -> { item, kind, tags }

  for (const [kind, flag, tag] of queries) {
    for (const item of search(kind, flag, sinceDate)) {
      if (!byUrl.has(item.url)) byUrl.set(item.url, { item, kind, tags: new Set() });
      byUrl.get(item.url).tags.add(tag);
    }
  }

  for (const { item, kind, tags } of byUrl.values()) {
    const key = item.repository?.nameWithOwner || 'unknown';
    if (!byRepo.has(key)) byRepo.set(key, []);
    byRepo.get(key).push({
      kind: kind === 'prs' ? 'PR' : 'issue',
      number: item.number,
      title: item.title,
      state: item.state,
      url: item.url,
      actions: [...classifyActions(item, tags, sinceMs)],
    });
  }
  return byRepo;
}
