import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
test('Gemini computer use loop uses browser environment, prompt-injection detection, and bounded actions',async()=>{const s=await read('lib/agents/gemini-computer-use.ts');assert.match(s,/computerUse:\s*\{\s*environment:\s*'ENVIRONMENT_BROWSER'/);assert.match(s,/enablePromptInjectionDetection:\s*true/);assert.match(s,/MAX_STEPS/);assert.match(s,/waiting_approval/);});
test('isolated browser runtime enforces domain allowlists and private-network blocking',async()=>{const s=await read('browser-runtime/server.mjs');assert.match(s,/allowedDomains/);assert.match(s,/metadata\.google\.internal/);assert.match(s,/blockedbyclient/);assert.match(s,/MAX_SESSIONS/);});
test('Bram computer-use route is owner-only and signs short-lived approvals',async()=>{const s=await read('app/api/agents/computer-use/route.ts');assert.match(s,/isPlatformOwner/);assert.match(s,/createHmac/);assert.match(s,/timingSafeEqual/);assert.match(s,/5\*60_000/);});
