import { listProjects } from './copilot-projects.mjs';

/** GitHub "owner/repo" names for every Copilot App project that has a linked GitHub repo, deduped. */
export function discoverGitHubRepos() {
  const repos = new Set();
  for (const project of listProjects()) {
    if (project.nameWithOwner) repos.add(project.nameWithOwner);
  }
  return [...repos];
}
