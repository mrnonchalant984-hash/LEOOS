import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { createGodotActionStarter } from '../lib/builders/godot-action-starter.ts';
import { createGodotFootballStarter } from '../lib/builders/godot-football-starter.ts';

const godot = process.env.GODOT_BIN?.trim();
const unavailable = !godot || !existsSync(godot);

function runGodotProject(files, script) {
  const root = mkdtempSync(join(tmpdir(), 'leonardx-godot-smoke-'));
  try {
    for (const [relative, contents] of Object.entries(files)) {
      const target = resolve(root, relative);
      assert.ok(target.startsWith(`${resolve(root)}\\`) || target.startsWith(`${resolve(root)}/`));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, contents, 'utf8');
    }
    writeFileSync(join(root, 'qa_smoke.gd'), script, 'utf8');
    const result = spawnSync(godot, ['--headless', '--path', root, '--script', 'res://qa_smoke.gd'], {
      encoding: 'utf8',
      timeout: 45_000,
      windowsHide: true,
    });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /LeonardX gameplay smoke passed/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('Godot football kick, goal, score and reset work in the headless physics runtime', { skip: unavailable }, () => {
  runGodotProject(createGodotFootballStarter('Football Runtime Check', {}), `
extends SceneTree

func _initialize() -> void:
    call_deferred("_run_checks")

func _run_checks() -> void:
    var scene = load("res://Main.tscn").instantiate()
    root.add_child(scene)
    await physics_frame
    scene.ball.global_position = scene.player.global_position
    scene._kick_ball()
    await physics_frame
    if scene.ball.linear_velocity.length() <= 0.1:
        push_error("Kicking near the ball did not apply an impulse")
        quit(1)
        return
    scene.ball.linear_velocity = Vector3.ZERO
    scene.ball.angular_velocity = Vector3.ZERO
    scene.ball.global_position = Vector3(0, 0.65, 20)
    await physics_frame
    await physics_frame
    if scene.score_blue != 1 or scene.ball.global_position.distance_to(Vector3(0, 0.65, 0)) > 0.1:
        push_error("Goal trigger did not award a point and reset the ball")
        quit(1)
        return
    print("LeonardX gameplay smoke passed: football kick, goal, score and reset")
    quit(0)
`);
});

test('Godot action arena projectile hit and enemy damage work in the headless physics runtime', { skip: unavailable }, () => {
  runGodotProject(createGodotActionStarter('Action Runtime Check', {}), `
extends SceneTree

func _initialize() -> void:
    call_deferred("_run_checks")

func _run_checks() -> void:
    var scene = load("res://Main.tscn").instantiate()
    root.add_child(scene)
    await physics_frame
    var target = scene.enemies[0]
    target.global_position = Vector3(0, 1, 3)
    target.set_meta("health", 1)
    scene.facing = Vector3(0, 0, -1)
    scene._fire_projectile()
    for _frame in range(30): await physics_frame
    if scene.defeated != 1 or scene.enemies.size() != scene.STARTING_ENEMIES - 1:
        push_error("Projectile did not defeat the low-health target")
        quit(1)
        return
    var attacker = scene.enemies[0]
    attacker.global_position = scene.player.global_position
    var initial_health = scene.player_health
    scene._move_enemies(0.016)
    if scene.player_health != initial_health - 20:
        push_error("Enemy contact did not damage the player")
        quit(1)
        return
    print("LeonardX gameplay smoke passed: projectile hit, enemy defeat and contact damage")
    quit(0)
`);
});
