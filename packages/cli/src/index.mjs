#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const configDir = join(homedir(), '.config', 'leonardx');
const configFile = join(configDir, 'config.json');
const usage = `LeonardX CLI\n\nCommands:\n  login --api-key <key> --base-url <url>  Store credentials locally\n  projects list [--status <status>]      List your projects\n  projects create <name> [--type <type>] Create a project\n  logout                                 Remove local credentials\n`;

function readConfig() {
  if (!existsSync(configFile)) return null;
  try { return JSON.parse(readFileSync(configFile, 'utf8')); } catch { return null; }
}
function saveConfig(value) {
  mkdirSync(configDir, { recursive: true });
  writeFileSync(configFile, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
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
async function main(args) {
  if (!args.length || args.includes('--help') || args.includes('-h')) { process.stdout.write(usage); return; }
  const [command, resource, action] = args;
  if (command === 'login') {
    const apiKey = option(args, '--api-key'); const baseUrl = option(args, '--base-url');
    if (!apiKey || !baseUrl) throw new Error('Both --api-key and --base-url are required.');
    const url = new URL(baseUrl); if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new Error('The base URL must use HTTPS.');
    saveConfig({ apiKey, baseUrl: url.toString().replace(/\/$/, '') }); process.stdout.write(`Credentials saved to ${configFile}\n`); return;
  }
  if (command === 'logout') { if (existsSync(configFile)) writeFileSync(configFile, '', { mode: 0o600 }); process.stdout.write('Credentials removed.\n'); return; }
  if (command === 'projects' && resource === 'list') { process.stdout.write(JSON.stringify(await api(`/api/v1/projects${option(args, '--status') ? `?status=${encodeURIComponent(option(args, '--status'))}` : ''}`), null, 2) + '\n'); return; }
  if (command === 'projects' && resource === 'create') {
    const name = action; if (!name) throw new Error('A project name is required.');
    process.stdout.write(JSON.stringify(await api('/api/v2/projects', { method: 'POST', body: JSON.stringify({ project_name: name, type: option(args, '--type') || 'web_app' }) }), null, 2) + '\n'); return;
  }
  throw new Error('Unknown command. Run leonardx --help.');
}
main(process.argv.slice(2)).catch(error => { console.error(`Error: ${error.message}`); process.exitCode = 1; });
