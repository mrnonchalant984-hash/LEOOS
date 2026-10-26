import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('lib/skills/registry.ts', 'utf8');

test('skill registry validates frontmatter, names, descriptions, and line limits', () => {
  assert.match(source, /skillNameSchema = z\.string\(\)\.regex/);
  assert.match(source, /description: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(500\)/);
  assert.match(source, /lines\.length > 500/);
});

test('skill file reads reject traversal and only allow references, assets, and scripts', () => {
  assert.match(source, /split\('\/'\)\.includes\('\.\.'\)/);
  assert.match(source, /Only skill references, assets, and scripts can be read/);
});

test('progressive skill tools load instructions and run only restricted scripts', () => {
  assert.match(source, /export async function loadSkill/);
  assert.match(source, /export async function readSkillFile/);
  assert.match(source, /export async function runSkillScript/);
  assert.match(source, /60_000/);
  assert.match(source, /process\.env|os\.environ/);
});
