import { execFileSync } from 'node:child_process';

function hasGh() {
  try {
    execFileSync('gh', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function search(kind, filterFlag, sinceDate) {
  try {
    const out = execFileSync(
      'gh',
      [
        'search',
        kind,
        filterFlag,
        `--updated=>=${sinceDate}`,
        '--json',
        'repository,number,title,url,state,updatedAt',
        '--limit',
        '50',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return JSON.parse(out || '[]');
  } catch {
    return [];
  }
}

/** PRs/issues you authored, commented on, or reviewed, updated since `sinceDate` (YYYY-MM-DD). */
export function gatherGitHubActivity(sinceDate) {
  const byRepo = new Map();
  if (!hasGh()) return byRepo;

  const queries = [
    ['prs', '--author=@me'],
    ['prs', '--commenter=@me'],
    ['prs', '--reviewed-by=@me'],
    ['issues', '--author=@me'],
    ['issues', '--commenter=@me'],
  ];

  const seen = new Set();
  for (const [kind, flag] of queries) {
    for (const item of search(kind, flag, sinceDate)) {
      const dedupeKey = item.url;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      const key = item.repository?.nameWithOwner || 'unknown';
      if (!byRepo.has(key)) byRepo.set(key, []);
      byRepo.get(key).push({
        kind: kind === 'prs' ? 'PR' : 'issue',
        number: item.number,
        title: item.title,
        state: item.state,
        url: item.url,
      });
    }
  }
  return byRepo;
}
