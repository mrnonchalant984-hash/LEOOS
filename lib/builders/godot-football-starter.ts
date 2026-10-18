import { GODOT_WINDOWS_DESKTOP_PRESET } from './godot-export-preset.ts';

export function createGodotFootballStarter(name: string, brief: Record<string, unknown>) {
  const title = name.trim().slice(0, 100) || 'LeonardX Football Prototype';
  const jsonBrief = JSON.stringify(brief, null, 2).slice(0, 12_000);
  return {
    'project.godot': `; Original LeonardX football gameplay prototype. Primitive meshes are placeholders.
config_version=5

[application]
config/name=${JSON.stringify(title)}
run/main_scene="res://Main.tscn"
config/features=PackedStringArray("4.7", "GL Compatibility")

[display]
window/size/viewport_width=1280
window/size/viewport_height=720
window/stretch/mode="canvas_items"

[rendering]
renderer/rendering_method="gl_compatibility"
renderer/rendering_method.mobile="gl_compatibility"
environment/defaults/default_clear_color=Color(0.08, 0.13, 0.2, 1)
`,
    'export_presets.cfg': GODOT_WINDOWS_DESKTOP_PRESET,
    'Main.tscn': '[gd_scene load_steps=2 format=3]\n\n[ext_resource type="Script" path="res://match.gd" id="1_match"]\n\n[node name="Match" type="Node3D"]\nscript = ExtResource("1_match")\n',
    'match.gd': `extends Node3D

const PITCH_LENGTH := 42.0
const PITCH_WIDTH := 26.0
const MATCH_SECONDS := 180.0
const PLAYER_SPEED := 8.0
const KICK_POWER := 15.0

var player: CharacterBody3D
var teammate: CharacterBody3D
var opponent: CharacterBody3D
var blue_keeper: CharacterBody3D
var red_keeper: CharacterBody3D
var ball: RigidBody3D
var score_blue := 0
var score_red := 0
var time_left := MATCH_SECONDS
var score_label: Label
var match_over := false
var kick_latched := false

func _ready() -> void:
	randomize()
	_build_pitch()
	_build_ball()
	player = _build_actor("BluePlayer", Vector3(0, 1, 12), Color(0.12, 0.35, 0.95), 1.0)
	teammate = _build_actor("BlueTeammate", Vector3(-7, 1, 7), Color(0.18, 0.48, 1.0), 0.75)
	opponent = _build_actor("RedOpponent", Vector3(5, 1, -8), Color(0.9, 0.16, 0.12), 0.8)
	blue_keeper = _build_actor("BlueGoalkeeper", Vector3(0, 1, 19), Color(0.95, 0.72, 0.12), 0.65)
	red_keeper = _build_actor("RedGoalkeeper", Vector3(0, 1, -19), Color(0.95, 0.72, 0.12), 0.65)
	_build_goal("RedGoal", -PITCH_LENGTH * 0.5 + 1.0, "blue")
	_build_goal("BlueGoal", PITCH_LENGTH * 0.5 - 1.0, "red")
	_build_camera()
	_build_hud()

func _build_pitch() -> void:
	var ground := StaticBody3D.new()
	ground.name = "Pitch"
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(PITCH_WIDTH, 0.4, PITCH_LENGTH)
	shape.shape = box
	ground.add_child(shape)
	var mesh := MeshInstance3D.new()
	var visual := BoxMesh.new()
	visual.size = box.size
	mesh.mesh = visual
	var grass := StandardMaterial3D.new()
	grass.albedo_color = Color(0.12, 0.42, 0.22)
	mesh.material_override = grass
	ground.add_child(mesh)
	ground.position.y = -0.2
	add_child(ground)
	_add_marking(Vector3(0, 0.012, 0), Vector3(PITCH_WIDTH - 1, 0.025, 0.12))
	_add_marking(Vector3(0, 0.012, -PITCH_LENGTH * 0.5 + 5), Vector3(11, 0.025, 0.12))
	_add_marking(Vector3(0, 0.012, PITCH_LENGTH * 0.5 - 5), Vector3(11, 0.025, 0.12))
	_add_marking(Vector3(-PITCH_WIDTH * 0.5 + 0.2, 0.012, 0), Vector3(0.12, 0.025, PITCH_LENGTH - 1))
	_add_marking(Vector3(PITCH_WIDTH * 0.5 - 0.2, 0.012, 0), Vector3(0.12, 0.025, PITCH_LENGTH - 1))
	_add_marking(Vector3(0, 0.02, -PITCH_LENGTH * 0.5 + 0.5), Vector3(8, 0.025, 0.12))
	_add_marking(Vector3(0, 0.02, PITCH_LENGTH * 0.5 - 0.5), Vector3(8, 0.025, 0.12))

func _add_marking(position: Vector3, size: Vector3) -> void:
	var line := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = size
	line.mesh = mesh
	var paint := StandardMaterial3D.new()
	paint.albedo_color = Color(0.92, 0.94, 0.86)
	line.material_override = paint
	line.position = position
	add_child(line)

func _build_ball() -> void:
	ball = RigidBody3D.new()
	ball.name = "MatchBall"
	ball.mass = 0.45
	ball.position = Vector3(0, 0.65, 0)
	ball.linear_damp = 0.45
	ball.angular_damp = 0.3
	var collision := CollisionShape3D.new()
	var sphere := SphereShape3D.new()
	sphere.radius = 0.34
	collision.shape = sphere
	ball.add_child(collision)
	var visual := MeshInstance3D.new()
	var sphere_mesh := SphereMesh.new()
	sphere_mesh.radius = sphere.radius
	sphere_mesh.height = sphere.radius * 2
	visual.mesh = sphere_mesh
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(0.94, 0.94, 0.9)
	visual.material_override = material
	ball.add_child(visual)
	add_child(ball)

func _build_actor(actor_name: String, start: Vector3, color: Color, speed: float) -> CharacterBody3D:
	var actor := CharacterBody3D.new()
	actor.name = actor_name
	actor.position = start
	actor.set_meta("speed", speed)
	var collision := CollisionShape3D.new()
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.42
	capsule.height = 1.8
	collision.shape = capsule
	actor.add_child(collision)
	var visual := MeshInstance3D.new()
	var body := CapsuleMesh.new()
	body.radius = capsule.radius
	body.height = capsule.height
	visual.mesh = body
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	visual.material_override = material
	actor.add_child(visual)
	add_child(actor)
	return actor

func _build_goal(goal_name: String, z_position: float, defending_team: String) -> void:
	var goal := Area3D.new()
	goal.name = goal_name
	goal.position = Vector3(0, 1.1, z_position)
	goal.collision_layer = 0
	goal.collision_mask = 1
	var collision := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(7.2, 2.5, 1.2)
	collision.shape = box
	goal.add_child(collision)
	goal.body_entered.connect(_on_goal_body_entered.bind(defending_team))
	add_child(goal)
	for x in [-3.6, 3.6]:
		_add_goal_post(Vector3(x, 1.2, z_position))
	_add_goal_post(Vector3(0, 2.4, z_position))

func _add_goal_post(position: Vector3) -> void:
	var post := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = Vector3(0.18, 2.4, 0.18)
	post.mesh = mesh
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(0.96, 0.96, 0.92)
	post.material_override = material
	post.position = position
	add_child(post)

func _build_camera() -> void:
	var camera := Camera3D.new()
	camera.position = Vector3(0, 12, 17)
	camera.rotation_degrees = Vector3(-32, 0, 0)
	camera.current = true
	player.add_child(camera)

func _build_hud() -> void:
	var layer := CanvasLayer.new()
	var panel := PanelContainer.new()
	panel.position = Vector2(18, 18)
	var margin := MarginContainer.new()
	for side in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 12)
	score_label = Label.new()
	score_label.add_theme_font_size_override("font_size", 20)
	score_label.text = _score_text()
	margin.add_child(score_label)
	panel.add_child(margin)
	layer.add_child(panel)
	add_child(layer)

func _physics_process(delta: float) -> void:
	if match_over:
		if Input.is_key_pressed(KEY_R): get_tree().reload_current_scene()
		return
	time_left = maxf(0.0, time_left - delta)
	if time_left <= 0.0:
		match_over = true
		score_label.text = _score_text() + "\nFull time — press R to restart."
		return
	_move_player(delta)
	_move_bot(teammate, _teammate_target(), delta)
	_move_bot(opponent, ball.global_position, delta)
	_move_keeper(blue_keeper, ball.global_position, 19.0, delta)
	_move_keeper(red_keeper, ball.global_position, -19.0, delta)
	if Input.is_key_pressed(KEY_K) and not kick_latched:
		_kick_ball()
		kick_latched = true
	if not Input.is_key_pressed(KEY_K): kick_latched = false
	ball.position.x = clampf(ball.position.x, -PITCH_WIDTH * 0.5 + 0.6, PITCH_WIDTH * 0.5 - 0.6)
	ball.position.z = clampf(ball.position.z, -PITCH_LENGTH * 0.5 + 0.6, PITCH_LENGTH * 0.5 - 0.6)
	score_label.text = _score_text()

func _move_player(delta: float) -> void:
	var input := Vector2.ZERO
	if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT): input.x -= 1.0
	if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT): input.x += 1.0
	if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP): input.y -= 1.0
	if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN): input.y += 1.0
	input = input.normalized()
	player.velocity.x = input.x * PLAYER_SPEED
	player.velocity.z = input.y * PLAYER_SPEED
	_apply_gravity(player, delta)
	player.move_and_slide()
	player.position.x = clampf(player.position.x, -PITCH_WIDTH * 0.5 + 1, PITCH_WIDTH * 0.5 - 1)
	player.position.z = clampf(player.position.z, -PITCH_LENGTH * 0.5 + 1, PITCH_LENGTH * 0.5 - 1)

func _move_bot(actor: CharacterBody3D, target: Vector3, delta: float) -> void:
	var offset := target - actor.global_position
	offset.y = 0
	if offset.length() > 2.3:
		var direction := offset.normalized()
		actor.velocity.x = direction.x * PLAYER_SPEED * float(actor.get_meta("speed"))
		actor.velocity.z = direction.z * PLAYER_SPEED * float(actor.get_meta("speed"))
	else:
		actor.velocity.x = move_toward(actor.velocity.x, 0.0, 16.0 * delta)
		actor.velocity.z = move_toward(actor.velocity.z, 0.0, 16.0 * delta)
	_apply_gravity(actor, delta)
	actor.move_and_slide()
	actor.position.x = clampf(actor.position.x, -PITCH_WIDTH * 0.5 + 1, PITCH_WIDTH * 0.5 - 1)
	actor.position.z = clampf(actor.position.z, -PITCH_LENGTH * 0.5 + 1, PITCH_LENGTH * 0.5 - 1)

func _move_keeper(keeper: CharacterBody3D, target: Vector3, goal_z: float, delta: float) -> void:
	var desired_x := clampf(target.x, -2.8, 2.8)
	keeper.velocity.x = clampf(desired_x - keeper.position.x, -5.0, 5.0)
	keeper.velocity.z = 0.0
	_apply_gravity(keeper, delta)
	keeper.move_and_slide()
	keeper.position.z = goal_z

func _apply_gravity(actor: CharacterBody3D, delta: float) -> void:
	if not actor.is_on_floor(): actor.velocity.y -= 20.0 * delta
	else: actor.velocity.y = 0.0

func _teammate_target() -> Vector3:
	if player.global_position.distance_to(ball.global_position) < 3.0:
		return Vector3(-6, 1, -2)
	return ball.global_position

func _kick_ball() -> void:
	if player.global_position.distance_to(ball.global_position) > 2.8: return
	var direction := Vector3(0, 0, -1)
	if Vector2(player.velocity.x, player.velocity.z).length() > 0.5:
		direction = Vector3(player.velocity.x, 0, player.velocity.z).normalized()
	ball.sleeping = false
	ball.apply_central_impulse(direction * KICK_POWER + Vector3.UP * 2.8)

func _on_goal_body_entered(body: Node3D, defending_team: String) -> void:
	if body != ball or match_over: return
	if defending_team == "red": score_blue += 1
	else: score_red += 1
	ball.linear_velocity = Vector3.ZERO
	ball.angular_velocity = Vector3.ZERO
	ball.global_position = Vector3(0, 0.65, 0)
	score_label.text = _score_text()

func _score_text() -> String:
	var clock := int(ceil(time_left))
	var minutes := int(clock / 60)
	var seconds := clock % 60
	return "LEONARDX FOOTBALL PROTOTYPE   %d - %d   %02d:%02d\nWASD / arrows: move   K: kick   R: restart after full time" % [score_blue, score_red, minutes, seconds]
`,
    'README.md': `# ${title}\n\nOriginal Godot 3D football gameplay prototype generated from the saved project brief. The pitch, players, goals, and ball use primitive placeholder geometry; no commercial-game assets are included.\n\n## Controls\n\n- Move: WASD or arrow keys.\n- Kick: K while close to the ball.\n- Restart: R after full time.\n\n## Manual gameplay checks\n\n1. Open in Godot 4.7 and run the main scene; check for parser, scene, or physics errors.\n2. Move the blue player and confirm it stays inside the pitch.\n3. Move near the ball and press K; confirm the ball travels and rolls.\n4. Kick the ball into either goal area; confirm the correct score increments and the ball resets.\n5. Observe the two simple keepers track the ball laterally and bots approach the ball.\n6. Wait for the match timer and confirm full-time state and restart.\n\nThis project source has not been run or exported by LeonardX. Touch controls, animation, licensed player assets, advanced football rules, and multiplayer are not implemented. A Windows Desktop export preset is included; install the matching Godot export templates for a local export. A deployed worker must explicitly enable this preset after its Linux engine and templates are verified.\n\n## Requested brief\n\n\`\`\`json\n${jsonBrief}\n\`\`\`\n`,
  };
}
