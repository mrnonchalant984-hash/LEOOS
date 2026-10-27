import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const route = await readFile(new URL('../app/api/games/[id]/publish/route.ts', import.meta.url), 'utf8');
const studio = await readFile(new URL('../components/games/BrowserGameStudio.tsx', import.meta.url), 'utf8');
const tools = await readFile(new URL('../lib/ai/tool-orchestrator.ts', import.meta.url), 'utf8');
const chat = await readFile(new URL('../app/api/chat/route.ts', import.meta.url), 'utf8');
const integrations = await readFile(new URL('../app/api/integrations/[provider]/[action]/route.ts', import.meta.url), 'utf8');

test('browser-game publishing requires authentication, ownership, explicit confirmation, and a real game project', () => {
  assert.match(route, /getProfile\(request\)/);
  assert.match(route, /\.eq\('user_id', ctx\.user\.id\)/);
  assert.match(route, /project\.type !== 'game'/);
  assert.match(route, /requestBody\.confirm !== true/);
});

test('browser-game publishing uses connected GitHub/Vercel operations and never claims a URL before READY', () => {
  assert.match(route, /callIntegration\(request, 'github', 'create-repo'/);
  assert.match(route, /callIntegration\(request, 'github', 'commit-files'/);
  assert.match(route, /callIntegration\(request, 'github', 'commit-status'/);
  assert.match(route, /callIntegration\(request, 'vercel', 'deploy-git-repo'/);
  assert.match(route, /callIntegration\(request, 'vercel', 'deployment-status'/);
  assert.match(route, /state === 'READY'/);
  assert.match(route, /live_url: liveUrl/);
  assert.match(route, /SECRET_VALUE/);
});

test('game studio exposes explicit publish/update, verified live URL, source repository, asset management, and runtime repair', () => {
  assert.match(studio, /Publish \/ update/);
  assert.match(studio, /\/api\/games\/\$\{encodeURIComponent\(project\.id\)\}\/publish/);
  assert.match(studio, /publication\.live_url/);
  assert.match(studio, /Upload asset/);
  assert.match(studio, /Repair runtime errors with Leo/);
});

test('Leo tool publishing is gated by project-write and repository-write authorization and chat calls the publishing tool', () => {
  assert.match(tools, /name: 'publish_browser_game'/);
  assert.match(tools, /!options\.allowRepositoryWrites/);
  assert.match(tools, /reference\.kind === 'publish_browser_game'/);
  assert.match(chat, /call publish_browser_game/);
});

test('generation pipeline syntax-checks classic JavaScript before saving generated game files', async () => {
  const generationRoute = await readFile(new URL('../app/api/games/[id]/generate/route.ts', import.meta.url), 'utf8');
  const generation = await readFile(new URL('../lib/builders/game-generation.ts', import.meta.url), 'utf8');
  assert.match(generationRoute, /gameJavaScriptSyntaxErrors\(generated\)/);
  assert.match(generation, /new Script\(source/);
  assert.match(generation, /JavaScript syntax error in/);
});

test('unpublishing requires confirmation and delegates deployment deletion to the connected Vercel account', () => {
  assert.match(route, /export async function DELETE/);
  assert.match(route, /body\.confirm !== true/);
  assert.match(route, /callIntegration\(request, 'vercel', 'delete-deployment'/);
  assert.match(integrations, /action === 'delete-deployment'/);
  assert.match(integrations, /vercel: \['create-project','deploy-git-repo','deployment-status','delete-deployment'\]/);
});
