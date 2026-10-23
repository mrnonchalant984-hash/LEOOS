import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { getMainWebsiteTarget, validateMainWebsiteFiles } from '../lib/mcp/main-website.ts';

const source = async path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('main website target requires a safe repository and Vercel project ID', () => {
  const previousRepository = process.env.LEO_MAIN_WEBSITE_REPOSITORY;
  const previousProject = process.env.LEO_MAIN_WEBSITE_VERCEL_PROJECT_ID;
  try {
    process.env.LEO_MAIN_WEBSITE_REPOSITORY = 'mrnonchalant984-hash/LEOOS';
    process.env.LEO_MAIN_WEBSITE_VERCEL_PROJECT_ID = 'leoos';
    assert.deepEqual(getMainWebsiteTarget(), {
      owner: 'mrnonchalant984-hash',
      repository: 'LEOOS',
      projectId: 'leoos',
    });
    process.env.LEO_MAIN_WEBSITE_REPOSITORY = 'https://attacker.test/repo';
    assert.equal(getMainWebsiteTarget(), null);
  } finally {
    if (previousRepository === undefined) delete process.env.LEO_MAIN_WEBSITE_REPOSITORY;
    else process.env.LEO_MAIN_WEBSITE_REPOSITORY = previousRepository;
    if (previousProject === undefined) delete process.env.LEO_MAIN_WEBSITE_VERCEL_PROJECT_ID;
    else process.env.LEO_MAIN_WEBSITE_VERCEL_PROJECT_ID = previousProject;
  }
});

test('main website push accepts safe source updates and rejects secrets and workflows', () => {
  assert.equal(validateMainWebsiteFiles([{ path: 'app/page.tsx', content: 'export default function Page() { return null; }' }]), null);
  assert.match(validateMainWebsiteFiles([{ path: '.env.local', content: 'API_KEY=secret' }]) || '', /Secret files/);
  assert.match(validateMainWebsiteFiles([{ path: '.github/workflows/deploy.yml', content: 'name: deploy' }]) || '', /GitHub workflow/);
  assert.match(validateMainWebsiteFiles([{ path: '../outside.ts', content: 'unsafe' }]) || '', /unsafe paths/);
  assert.match(validateMainWebsiteFiles([{ path: 'src/config.ts', content: 'const key = "ghp_abcdefghijklmnopqrstuvwxyz0123456789ABCDE";' }]) || '', /credential-like/);
  assert.match(validateMainWebsiteFiles([
    { path: 'app/page.tsx', content: 'one' },
    { path: 'app/page.tsx', content: 'two' },
  ]) || '', /duplicate/);
});

test('MCP exposes production main-branch writes only to owners with write scope and explicit confirmation', async () => {
  const server = await source('lib/mcp/server.ts');
  const route = await source('app/mcp/route.ts');
  assert.match(server, /if \(projects\.isPlatformOwner && writeAccess && projects\.updateMainWebsite\)/);
  assert.match(server, /confirm: z\.literal\(true\)/);
  assert.match(server, /expected_commit_sha/);
  assert.match(server, /update_main_website/);
  assert.match(route, /if \(!platformOwner \|\| userId !== token\.userId\)/);
  assert.match(route, /\.eq\('provider', 'github'\)\.eq\('status', 'verified'\)/);
  assert.match(route, /\.eq\('provider', 'vercel'\)\.eq\('status', 'verified'\)/);
});

test('main-branch writes refuse stale commits and verify the linked Vercel GitHub project', async () => {
  const implementation = await source('lib/mcp/main-website.ts');
  assert.match(implementation, /branch\.commit\.sha !== input\.expectedCommitSha/);
  assert.match(implementation, /linked\.repoOwner.*linked\.repo/s);
  assert.match(implementation, /force: false/);
  assert.match(implementation, /github_actions/);
  assert.match(implementation, /error_message: deployment\.errorMessage/);
});

test('workforce queue execution is owner-triggered and the dashboards poll only while visible', async () => {
  const route = await source('app/api/workforce/jobs/route.ts');
  const jobs = await source('app/workforce/jobs/page.tsx');
  const monitoring = await source('app/workforce/monitoring/page.tsx');
  const schedule = await source('vercel.json');
  assert.match(route, /requireOwner\(req\)/);
  assert.match(route, /runWorkforceWorker\(workerRequest\)/);
  assert.match(route, /workforce-on-demand-worker/);
  assert.match(jobs, /document\.visibilityState==='visible'/);
  assert.match(monitoring, /document\.visibilityState === 'visible'/);
  assert.match(schedule, /"schedule": "0 13 \* \* \*"/);
});
