import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const source = async path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('football briefs create a real Godot project source tree with a bounded match loop', async () => {
  const setup = await source('app/api/setup/projects/route.ts');
  const football = await source('lib/builders/godot-football-starter.ts');
  assert.match(setup, /football\|soccer/);
  assert.match(setup, /createGodotFootballStarter/);
  assert.match(football, /project\.godot/);
  assert.match(football, /export_presets\.cfg/);
  assert.match(football, /Main\.tscn/);
  assert.match(football, /RigidBody3D\.new\(\)/);
  assert.match(football, /apply_central_impulse/);
  assert.match(football, /_on_goal_body_entered/);
  assert.match(football, /MATCH_SECONDS/);
  assert.match(football, /_move_keeper/);
  assert.match(football, /not been run or exported by LeonardX/);
});

test('action-game briefs select an original offline combat starter', async () => {
  const setup = await source('app/api/setup/projects/route.ts');
  const action = await source('lib/builders/godot-action-starter.ts');
  assert.match(setup, /createGodotActionStarter/);
  assert.match(setup, /action\|shooter\|combat\|arena/);
  assert.match(action, /project\.godot/);
  assert.match(action, /export_presets\.cfg/);
  assert.match(action, /Main\.tscn/);
  assert.match(action, /_fire_projectile/);
  assert.match(action, /_on_projectile_hit/);
  assert.match(action, /player_health/);
  assert.match(action, /STARTING_ENEMIES/);
  assert.match(action, /claim online multiplayer/);
  assert.match(action, /Upload original PNG, JPEG, or WebP textures from the IDE Game images panel/);
});
