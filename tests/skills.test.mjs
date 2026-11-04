import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('lib/skills/registry.ts', 'utf8');
const orchestrator = fs.readFileSync('lib/ai/tool-orchestrator.ts', 'utf8');
const runRoute = fs.readFileSync('app/api/skills/run/route.ts', 'utf8');

test('skill registry validates frontmatter, names, descriptions, and line limits', () => {
  assert.match(source, /skillNameSchema = z\.string\(\)\.regex/);
  assert.match(source, /description: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(500\)/);
  assert.match(source, /lines\.length > 500/);
});

test('skill file reads reject traversal and only allow references, assets, and scripts', () => {
  assert.match(source, /split\('\/'\)\.includes\('\.\.'\)/);
  assert.match(source, /Only skill references, assets, and scripts can be read/);
});

test('progressive skill tools load instructions without executing user scripts', () => {
  assert.match(source, /export async function loadSkill/);
  assert.match(source, /export async function readSkillFile/);
  assert.doesNotMatch(source, /node:child_process|node:os|spawn\(/);
  assert.doesNotMatch(orchestrator, /run_skill_script|runSkillScript/);
  assert.match(runRoute, /status:\s*503/);
  assert.match(runRoute, /disabled until a separately isolated runner is deployed and verified/);
});
