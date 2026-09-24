#!/usr/bin/env node
import { deleteWorktrees, keepWorktrees, unkeepWorktrees } from '../lib/actions.mjs';
import { loadConfig, readReport, saveConfig, writeReport, REPORT_PATH } from '../lib/config.mjs';
import { publicView, scan } from '../lib/scan.mjs';
import { installSchedule, notify, scheduleStatus, uninstallSchedule } from '../lib/schedule.mjs';

const [command, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((arg) => arg.startsWith('--')));
const positional = rest.filter((arg) => !arg.startsWith('--'));
const flagValue = (name) => {
  const hit = rest.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : undefined;
};

function table(rows) {
  if (!rows.length) return '  (none)';
  return rows
    .map((row) => {
      const tags = [
        row.dirtyCount ? `dirty:${row.dirtyCount}` : null,
        row.unpushed ? `unpushed:${row.unpushed}` : null,
        row.mergedIntoBase ? 'merged' : null,
        row.pr ? `PR#${row.pr.number}:${row.pr.state}` : null,
      ].filter(Boolean);
      return `  ${row.path}\n    ${row.idleDays ?? '?'}d idle | ${row.reasons.join('; ')}${
        tags.length ? ` | ${tags.join(' ')}` : ''
      }${row.blockers.length ? `\n    blockers: ${row.blockers.join('; ')}` : ''}`;
    })
    .join('\n');
}

function resolveSelection(report, paths) {
  const byPath = new Map(report.worktrees.map((item) => [item.path, item]));
  const missing = paths.filter((item) => !byPath.has(item));
  if (missing.length) throw new Error(`not in last scan report:\n${missing.join('\n')}`);
  return paths.map((item) => byPath.get(item));
}

async function main() {
  switch (command) {
    case 'scan': {
      const staleDays = flagValue('stale-days');
      const report = await scan({
        configOverride: staleDays ? { staleDays: Number(staleDays) } : undefined,
      });
      writeReport(report);

      if (flags.has('--json')) {
        console.log(JSON.stringify({ ...report, worktrees: report.worktrees.map(publicView) }, null, 2));
        break;
      }

      const byStatus = (status) => report.worktrees.filter((item) => item.status === status).map(publicView);
      console.log(`Scanned ${report.summary.total} worktrees at ${report.scannedAt}`);
      console.log(`Roots: ${report.roots.join(', ')}\n`);
      console.log(`Obsolete — safe to delete (${report.summary.obsolete}):`);
      console.log(table(byStatus('obsolete')));
      console.log(`\nNeeds review — has unsaved work (${report.summary.review}):`);
      console.log(table(byStatus('review')));
      console.log(`\nActive (${report.summary.active}) | Keep-listed (${report.summary.keep})`);
      console.log(`\nReport: ${REPORT_PATH}`);

      if (flags.has('--notify') && report.summary.obsolete + report.summary.review > 0) {
        notify(
          'Copilot worktree janitor',
          `${report.summary.obsolete} obsolete, ${report.summary.review} need review. Ask Copilot to "review my worktrees".`,
        );
      }
      break;
    }

    case 'delete': {
      const report = readReport();
      if (!report) throw new Error('No scan report yet. Run: janitor scan');
      const selection = flags.has('--all-obsolete')
        ? report.worktrees.filter((item) => item.status === 'obsolete')
        : resolveSelection(report, positional);
      if (!selection.length) throw new Error('Nothing selected. Pass worktree paths or --all-obsolete.');

      const results = await deleteWorktrees({
        candidates: selection,
        force: flags.has('--force'),
        deleteBranch: flags.has('--delete-branch') ? true : undefined,
        dryRun: !flags.has('--yes'),
      });
      for (const result of results) {
        console.log(`${result.action.padEnd(13)} ${result.path}${result.reason ? ` — ${result.reason}` : ''}`);
        if (result.salvagedTo) console.log(`              uncommitted work saved to ${result.salvagedTo}`);
      }
      if (!flags.has('--yes')) console.log('\nDry run. Re-run with --yes to actually delete.');
      break;
    }

    case 'keep':
      console.log(`Keep list:\n${keepWorktrees(positional).map((item) => `  ${item}`).join('\n')}`);
      break;

    case 'unkeep':
      console.log(`Keep list:\n${unkeepWorktrees(positional).map((item) => `  ${item}`).join('\n') || '  (empty)'}`);
      break;

    case 'config': {
      if (positional[0] === 'set') {
        const patch = JSON.parse(positional.slice(1).join(' '));
        console.log(JSON.stringify(saveConfig(patch), null, 2));
      } else {
        console.log(JSON.stringify(loadConfig(), null, 2));
      }
      break;
    }

    case 'schedule': {
      const action = positional[0] ?? 'status';
      if (action === 'install') {
        const hours = flagValue('interval-hours');
        console.log(
          JSON.stringify(
            installSchedule({
              intervalHours: hours ? Number(hours) : undefined,
              notify: flags.has('--no-notify') ? false : undefined,
            }),
            null,
            2,
          ),
        );
      } else if (action === 'uninstall') {
        console.log(JSON.stringify(uninstallSchedule(), null, 2));
      } else {
        console.log(JSON.stringify(scheduleStatus(), null, 2));
      }
      break;
    }

    default:
      console.log(`copilot worktree janitor

  janitor scan [--json] [--notify] [--write] [--stale-days=N]
  janitor delete <path...> | --all-obsolete   [--yes] [--force] [--delete-branch]
  janitor keep <path...>
  janitor unkeep <path...>
  janitor config [set '<json>']
  janitor schedule install [--interval-hours=N] [--no-notify] | uninstall | status
`);
  }
}

main().catch((error) => {
  console.error(`error: ${error.message}`);
  process.exit(1);
});
