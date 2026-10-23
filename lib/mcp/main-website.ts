import { normalizeIdePath, validateIdeFiles } from '../ide-files.ts';
import { requestProviderJson } from '../provider-http.ts';

const GITHUB_API = 'https://api.github.com';
const VERCEL_API = 'https://api.vercel.com';

export type MainWebsiteFile = { path: string; content: string };

export function getMainWebsiteTarget() {
  const repository = process.env.LEO_MAIN_WEBSITE_REPOSITORY?.trim() || '';
  const match = /^([A-Za-z0-9_.-]{1,100})\/([A-Za-z0-9_.-]{1,100})$/.exec(repository);
  const projectId = process.env.LEO_MAIN_WEBSITE_VERCEL_PROJECT_ID?.trim() || '';
  if (!match || !/^[A-Za-z0-9_-]{1,128}$/.test(projectId)) return null;
  return { owner: match[1], repository: match[2], projectId };
}

export function validateMainWebsiteFiles(files: MainWebsiteFile[]) {
  if (!Array.isArray(files) || files.length < 1 || files.length > 100) {
    return 'Provide between 1 and 100 changed files.';
  }
  const fileMap = Object.fromEntries(files.map(file => [file.path, file.content]));
  if (Object.keys(fileMap).length !== files.length || !validateIdeFiles(fileMap)) {
    return 'Files contain duplicate or unsafe paths, invalid content, or exceed workspace size limits.';
  }
  if (files.some(({ path }) =>
    normalizeIdePath(path) !== path ||
    /(^|\/)\.env(?:\.|$)/i.test(path) ||
    /(^|\/)\.git(\/|$)/i.test(path) ||
    /(^|\/)\.github\/workflows\//i.test(path) ||
    /\.(?:pem|key|p12|pfx)$/i.test(path),
  )) {
    return 'Secret files, credentials, and GitHub workflow files cannot be changed through the website rebuild tool.';
  }
  if (files.some(({ content }) =>
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i.test(content) ||
    /\b(?:gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{30,}|AIza[0-9A-Za-z_-]{30,}|sk-(?:proj-)?[A-Za-z0-9_-]{24,})\b/.test(content),
  )) {
    return 'Generated source contains a credential-like value. Remove it and use a server-side environment variable instead.';
  }
  return null;
}

function githubHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'LeonardX-MCP',
  };
}

async function github<T>(token: string, path: string, init: RequestInit = {}) {
  return requestProviderJson<T>('github', `${GITHUB_API}${path}`, {
    ...init,
    headers: { ...githubHeaders(token), ...(init.headers || {}) },
    signal: AbortSignal.timeout(20_000),
  });
}

function vercelUrl(path: string) {
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const separator = path.includes('?') ? '&' : '?';
  return `${VERCEL_API}${path}${teamId ? `${separator}teamId=${encodeURIComponent(teamId)}` : ''}`;
}

async function vercel<T>(token: string, path: string) {
  return requestProviderJson<T>('vercel', vercelUrl(path), {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
}

type GitHubBranch = { commit?: { sha?: string; html_url?: string } };
type GitHubRuns = { workflow_runs?: Array<Record<string, unknown>> };
type GitHubChecks = { check_runs?: Array<Record<string, unknown>> };
type VercelProject = { link?: { type?: string; org?: string; repo?: string; repoOwner?: string } | null };
type VercelDeployments = { deployments?: Array<Record<string, unknown>> };

export async function inspectMainWebsite(input: {
  githubToken: string;
  vercelToken: string;
}) {
  const target = getMainWebsiteTarget();
  if (!target) throw new Error('Configure LEO_MAIN_WEBSITE_REPOSITORY and LEO_MAIN_WEBSITE_VERCEL_PROJECT_ID before using the owner website tools.');
  const repoPath = `/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repository)}`;
  const [branch, runs, project, deployments] = await Promise.all([
    github<GitHubBranch>(input.githubToken, `${repoPath}/branches/main`),
    github<GitHubRuns>(input.githubToken, `${repoPath}/actions/runs?branch=main&per_page=5`),
    vercel<VercelProject>(input.vercelToken, `/v9/projects/${encodeURIComponent(target.projectId)}`),
    vercel<VercelDeployments>(input.vercelToken, `/v6/deployments?projectId=${encodeURIComponent(target.projectId)}&limit=5`),
  ]);
  const repoLink = project.link;
  const linkedRepository = repoLink?.repo && repoLink.repoOwner ? `${repoLink.repoOwner}/${repoLink.repo}` : null;
  const expectedRepository = `${target.owner}/${target.repository}`;
  if (linkedRepository && linkedRepository.toLowerCase() !== expectedRepository.toLowerCase()) {
    throw new Error('The configured Vercel project is linked to a different GitHub repository. Update the owner website target before pushing.');
  }
  const sha = branch.commit?.sha;
  const checks = sha
    ? await github<GitHubChecks>(input.githubToken, `${repoPath}/commits/${encodeURIComponent(sha)}/check-runs?per_page=20`)
    : { check_runs: [] };
  return {
    repository: expectedRepository,
    branch: 'main',
    latest_commit: sha || null,
    commit_url: branch.commit?.html_url || null,
    github_actions: (runs.workflow_runs || []).map(run => ({
      id: run.id,
      name: run.name,
      status: run.status,
      conclusion: run.conclusion,
      head_sha: run.head_sha,
      url: run.html_url,
      updated_at: run.updated_at,
    })),
    github_checks: (checks.check_runs || []).map(check => ({
      name: check.name,
      status: check.status,
      conclusion: check.conclusion,
      details_url: check.details_url,
    })),
    vercel_project_id: target.projectId,
    vercel_deployments: (deployments.deployments || []).map(deployment => ({
      id: deployment.uid || deployment.id,
      state: deployment.readyState || deployment.state,
      target: deployment.target,
      url: typeof deployment.url === 'string' ? `https://${deployment.url}` : null,
      created_at: deployment.createdAt,
      error_code: deployment.errorCode || null,
      error_message: deployment.errorMessage || null,
      inspector_url: deployment.inspectorUrl || null,
    })),
  };
}

export async function pushMainWebsiteChanges(input: {
  githubToken: string;
  vercelToken: string;
  expectedCommitSha: string;
  commitMessage: string;
  files: MainWebsiteFile[];
}) {
  const invalidFiles = validateMainWebsiteFiles(input.files);
  if (invalidFiles) throw new Error(invalidFiles);
  if (!/^[a-f0-9]{40}$/i.test(input.expectedCommitSha)) throw new Error('A valid expected main-branch commit SHA from the latest status check is required.');
  const commitMessage = input.commitMessage.trim();
  if (!commitMessage || commitMessage.length > 200) throw new Error('Commit message must be between 1 and 200 characters.');
  const target = getMainWebsiteTarget();
  if (!target) throw new Error('Configure LEO_MAIN_WEBSITE_REPOSITORY and LEO_MAIN_WEBSITE_VERCEL_PROJECT_ID before using the owner website tools.');

  const repoPath = `/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repository)}`;
  const [branch, project] = await Promise.all([
    github<GitHubBranch>(input.githubToken, `${repoPath}/branches/main`),
    vercel<VercelProject>(input.vercelToken, `/v9/projects/${encodeURIComponent(target.projectId)}`),
  ]);
  if (!branch.commit?.sha || branch.commit.sha !== input.expectedCommitSha) {
    throw new Error('The main branch changed since it was inspected. Re-check repository status and submit the changes against the latest commit.');
  }
  const linked = project.link;
  if (!linked || !linked.repo || !linked.repoOwner ||
      `${linked.repoOwner}/${linked.repo}`.toLowerCase() !== `${target.owner}/${target.repository}`.toLowerCase()) {
    throw new Error('The configured Vercel project is not verified as linked to the target GitHub repository.');
  }
  const baseCommit = await github<{ commit?: { tree?: { sha?: string } } }>(
    input.githubToken,
    `${repoPath}/commits/${encodeURIComponent(input.expectedCommitSha)}`,
  );
  const baseTree = baseCommit.commit?.tree?.sha;
  if (!baseTree) throw new Error('The GitHub base commit tree could not be verified.');
  const tree = await github<{ sha?: string }>(input.githubToken, `${repoPath}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseTree,
      tree: input.files.map(file => ({ path: file.path, mode: '100644', type: 'blob', content: file.content })),
    }),
  });
  if (!tree.sha) throw new Error('GitHub did not return a tree for the website changes.');
  const createdCommit = await github<{ sha?: string; html_url?: string }>(input.githubToken, `${repoPath}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message: commitMessage,
      tree: tree.sha,
      parents: [input.expectedCommitSha],
    }),
  });
  if (!createdCommit.sha) throw new Error('GitHub did not return a commit for the website changes.');
  await github(input.githubToken, `${repoPath}/git/refs/heads/main`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: createdCommit.sha, force: false }),
  });
  return {
    repository: `${target.owner}/${target.repository}`,
    branch: 'main',
    commit_sha: createdCommit.sha,
    commit_url: createdCommit.html_url || null,
    changed_files: input.files.map(file => file.path),
    vercel_project_id: target.projectId,
    deployment: 'GitHub push submitted. Check the owner website status tool for GitHub checks and the Vercel production deployment.',
  };
}
