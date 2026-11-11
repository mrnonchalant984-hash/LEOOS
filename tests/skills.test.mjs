import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('lib/skills/registry.ts', 'utf8');
const contracts = fs.readFileSync('lib/skills/contracts.ts', 'utf8');
const orchestrator = fs.readFileSync('lib/ai/tool-orchestrator.ts', 'utf8');
const runRoute = fs.readFileSync('app/api/skills/run/route.ts', 'utf8');

test('skill registry validates frontmatter, names, descriptions, and line limits', () => {
  assert.match(contracts, /skillNameSchema = z\.string\(\)\.regex/);
  assert.match(contracts, /description: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(500\)/);
  assert.match(contracts, /lines\.length > 500/);
});

test('skill file reads reject traversal and only allow references, assets, and scripts', () => {
  assert.match(source, /split\('\/'\)\.includes\('\.\.'\)/);
  assert.match(source, /Only skill references, assets, and scripts can be read/);
});

test('skill loading stays instruction-only and script execution requires the external sandbox', () => {
  assert.match(source, /export async function loadSkill/);
  assert.match(source, /export async function readSkillFile/);
  assert.doesNotMatch(source, /node:child_process|node:os|spawn\(/);
  assert.doesNotMatch(orchestrator, /run_skill_script|runSkillScript/);
  assert.match(runRoute, /body\.confirm !== true/);
  assert.match(runRoute, /LEO_SANDBOX_URL/);
  assert.match(runRoute, /LEO_SANDBOX_HMAC_SECRET/);
  assert.match(runRoute, /LEO_SANDBOX_ACCESS_CLIENT_ID/);
  assert.match(runRoute, /CF-Access-Client-Id/);
  assert.match(runRoute, /CF-Access-Client-Secret/);
  assert.match(runRoute, /run_skill_script/);
  assert.match(runRoute, /\.eq\('owner_id', ctx\.user\.id\)/);
  assert.match(runRoute, /skill_executions/);
});
