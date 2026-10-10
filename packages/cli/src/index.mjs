#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { appendScratchpad, createAgentWorktree, isPathAllowed, mergeAgentWorktree, readScratchpad, strategies, validateAgentWorktree } from './orchestration.mjs';

const configDir = join(homedir(), '.config', 'leonardx');
const configFile = join(configDir, 'config.json');
const usage = `LEO OS CLI\n\nCommands:\n  leo login --api-key <key> --base-url <url>  Validate and store credentials\n  leo init <workspace-id>                     Link this directory to a workspace\n  leo status                                  Read the linked workspace status\n  leo deploy --brief "<prompt>"               Cloud dispatch (currently browser-auth only)\n  leo ship                                    Cloud deploy (currently browser-auth only)\n  leo agents strategy <strategy>              Select a conflict strategy\n  leo agents check-path --role <role> <path>   Check a worker path boundary\n  leo agents worktree <create|validate|merge>  Manage an isolated Git worktree\n  leo agents scratchpad <read|add>             Read or append handoff metadata\n  leo projects list [--status <status>]       List your projects\n  leo projects create <name> [--type <type>]  Create a project\n  leo logout                                  Remove local credentials\n`;

function readConfig() {
  if (!existsSync(configFile)) return null;
  try { return JSON.parse(readFileSync(configFile, 'utf8')); } catch { return null; }
}
function saveConfig(value) {
  mkdirSync(configDir, { recursive: true });
  const temporaryFile = `${configFile}.${process.pid}.tmp`;
  writeFileSync(temporaryFile, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  renameSync(temporaryFile, configFile);
  try { chmodSync(configFile, 0o600); } catch { /* Windows ACLs are managed by the OS. */ }
}
function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
async function api(path, init = {}) {
  const config = readConfig();
  if (!config?.apiKey || !config?.baseUrl) throw new Error('Not authenticated. Run: leonardx login --api-key <key> --base-url <url>');
  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json', ...(init.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || body?.error || `LeonardX API request failed (${response.status})`);
  return body;
}
function readWorkspaceLink() {
  const linkFile = resolve(process.cwd(), '.leo', 'config.json');
  if (!existsSync(linkFile)) throw new Error('This directory is not linked. Run: leo init <workspace-id>');
  const link = JSON.parse(readFileSync(linkFile, 'utf8'));
  if (typeof link.workspaceId !== 'string' || !/^[\w-]{1,80}$/.test(link.workspaceId)) throw new Error('The local workspace link is invalid.');
  return link;
}
async function main(args) {
  if (!args.length || args.includes('--help') || args.includes('-h')) { process.stdout.write(usage); return; }
  const [command, resource, action] = args;
  if (command === 'login') {
    const apiKey = option(args, '--api-key'); const baseUrl = option(args, '--base-url');
    if (!apiKey || !baseUrl) throw new Error('Both --api-key and --base-url are required.');
    const url = new URL(baseUrl);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost')) || url.username || url.password || url.search || url.hash) throw new Error('Use an HTTPS base URL (HTTP is allowed only for localhost), without embedded credentials or query parameters.');
    const normalizedBaseUrl = url.toString().replace(/\/$/, '');
    const response = await fetch(`${normalizedBaseUrl}/api/v2/me`, { headers: { authorization: `Bearer ${apiKey}` } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error?.message || `Credential validation failed (${response.status}).`);
    saveConfig({ apiKey, baseUrl: normalizedBaseUrl }); process.stdout.write(`Authenticated as ${body?.data?.email || 'LEO OS API user'}. Credentials saved locally.\n`); return;
  }
  if (command === 'logout') { if (existsSync(configFile)) { const current = readConfig(); saveConfig({ ...current, apiKey: '' }); } process.stdout.write('Credentials removed.\n'); return; }
  if (command === 'init') {
    const workspaceId = resource;
    if (!workspaceId || !/^[\w-]{1,80}$/.test(workspaceId)) throw new Error('Provide a valid workspace id: leo init <workspace-id>');
    await api(`/api/v2/projects/${encodeURIComponent(workspaceId)}/status`);
    const directory = resolve(process.cwd(), '.leo'); const linkFile = join(directory, 'config.json');
    if (existsSync(linkFile)) throw new Error('This directory already has a .leo/config.json link. Remove it manually if you intend to relink.');
    mkdirSync(directory, { recursive: true });
    writeFileSync(linkFile, JSON.stringify({ workspaceId, linkedAt: new Date().toISOString(), version: 1 }, null, 2) + '\n', { flag: 'wx' });
    process.stdout.write(`Linked this directory to workspace ${workspaceId}.\n`); return;
  }
  if (command === 'status') {
    const { workspaceId } = readWorkspaceLink();
    const result = await api(`/api/v2/projects/${encodeURIComponent(workspaceId)}/status`);
    process.stdout.write(JSON.stringify(result.data, null, 2) + '\n'); return;
  }
  if (command === 'deploy') {
    const brief = option(args, '--brief');
    if (!brief?.trim()) throw new Error('Provide a task brief: leo deploy --brief "Describe the change"');
    throw new Error('Cloud task dispatch is not exposed to API keys yet. Use the authenticated LeonardX workspace to run this task; no task was submitted.');
  }
  if (command === 'ship') throw new Error('CLI deployment is not exposed to API keys yet. Use the authenticated project deployment flow; no deployment was triggered.');
  if (command === 'agents' && resource === 'strategy') {
    const selected = action;
    if (!strategies.includes(selected)) throw new Error(`Choose one strategy: ${strategies.join(', ')}`);
    const linkFile = resolve(process.cwd(), '.leo', 'config.json');
    if (!existsSync(linkFile)) throw new Error('Link this directory first with: leo init <workspace-id>');
    const link = JSON.parse(readFileSync(linkFile, 'utf8'));
    saveLocalJson(linkFile, { ...link, conflictStrategy: selected });
    process.stdout.write(`Agent conflict strategy set to ${selected}.\n`); return;
  }
  if (command === 'agents' && resource === 'check-path') {
    const link = readWorkspaceLink();
    if (link.conflictStrategy !== 'disjoint-directory') throw new Error('Select the disjoint-directory strategy first: leo agents strategy disjoint-directory');
    const role = option(args, '--role'); const filePath = args[args.indexOf('--role') + 2];
    if (!role || !filePath) throw new Error('Usage: leo agents check-path --role <database|ui|api|docs|general> <path>');
    if (!isPathAllowed(role, filePath)) throw new Error(`Path rejected by the ${role} agent boundary: ${filePath}`);
    process.stdout.write(`Path is within the ${role} agent boundary.\n`); return;
  }
  if (command === 'agents' && resource === 'worktree') {
    const link = readWorkspaceLink();
    if (link.conflictStrategy !== 'git-worktree') throw new Error('Select the Git worktree strategy first: leo agents strategy git-worktree');
    const operation = action; const agent = args[3];
    if (operation === 'create') { process.stdout.write(`Created isolated checkout at ${await createAgentWorktree(process.cwd(), agent, args[4] || 'HEAD')}\n`); return; }
    if (operation === 'validate') { const worktree = resolve('.leo', 'worktrees', `agent-${agent}`); process.stdout.write(JSON.stringify(await validateAgentWorktree(worktree), null, 2) + '\n'); return; }
    if (operation === 'merge') { process.stdout.write(JSON.stringify(await mergeAgentWorktree(process.cwd(), agent, args[4] || 'main'), null, 2) + '\n'); return; }
    throw new Error('Usage: leo agents worktree <create|validate|merge> <agent-name>');
  }
  if (command === 'agents' && resource === 'scratchpad') {
    const link = readWorkspaceLink();
    if (link.conflictStrategy !== 'shared-scratchpad') throw new Error('Select the shared-scratchpad strategy first: leo agents strategy shared-scratchpad');
    const operation = action; const root = process.cwd();
    if (operation === 'read') { process.stdout.write(JSON.stringify(await readScratchpad(root), null, 2) + '\n'); return; }
    if (operation === 'add') {
      const entry = JSON.parse(option(args, '--entry') || 'null');
      process.stdout.write(JSON.stringify(await appendScratchpad(root, entry), null, 2) + '\n'); return;
    }
    throw new Error('Usage: leo agents scratchpad <read|add --entry <json>>');
  }
  if (command === 'projects' && resource === 'list') { process.stdout.write(JSON.stringify(await api(`/api/v1/projects${option(args, '--status') ? `?status=${encodeURIComponent(option(args, '--status'))}` : ''}`), null, 2) + '\n'); return; }
  if (command === 'projects' && resource === 'create') {
    const name = action; if (!name) throw new Error('A project name is required.');
    process.stdout.write(JSON.stringify(await api('/api/v2/projects', { method: 'POST', body: JSON.stringify({ project_name: name, type: option(args, '--type') || 'web_app' }) }), null, 2) + '\n'); return;
  }
  throw new Error('Unknown command. Run leonardx --help.');
}
function saveLocalJson(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  renameSync(temporary, file);
}
main(process.argv.slice(2)).catch(error => { console.error(`Error: ${error.message}`); process.exitCode = 1; });
