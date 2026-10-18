import { GODOT_WINDOWS_DESKTOP_PRESET } from './godot-export-preset.ts';

export function createGodotActionStarter(name: string, brief: Record<string, unknown>) {
  const title = name.trim().slice(0, 100) || 'LeonardX Action Arena';
  const jsonBrief = JSON.stringify(brief, null, 2).slice(0, 12_000);
  return {
    'project.godot': `; Original LeonardX 3D action arena prototype.
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
environment/defaults/default_clear_color=Color(0.045, 0.065, 0.12, 1)
`,
    'export_presets.cfg': GODOT_WINDOWS_DESKTOP_PRESET,
    'Main.tscn': '[gd_scene load_steps=2 format=3]\n\n[ext_resource type="Script" path="res://arena.gd" id="1_arena"]\n\n[node name="Arena" type="Node3D"]\nscript = ExtResource("1_arena")\n',
    'arena.gd': `extends Node3D

const ARENA_SIZE := 32.0
const PLAYER_SPEED := 8.0
const GRAVITY := 22.0
const STARTING_ENEMIES := 6
const PROJECTILE_SPEED := 25.0
const PROJECTILE_LIFETIME := 1.8

var player: CharacterBody3D
var enemies: Array[CharacterBody3D] = []
var projectiles: Array[Area3D] = []
var player_health := 100
var defeated := 0
var damage_cooldown := 0.0
var attack_latched := false
var game_over := false
var facing := Vector3(0, 0, -1)
var hud: Label

func _ready() -> void:
	_build_arena()
	_build_player()
	_build_enemies()
	_build_hud()

func _build_arena() -> void:
	var environment_node := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color(0.045, 0.065, 0.12)
	environment.ambient_light_color = Color(0.6, 0.66, 0.8)
	environment.ambient_light_energy = 0.75
	environment_node.environment = environment
	add_child(environment_node)

	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-48, -32, 0)
	sun.light_energy = 1.35
	add_child(sun)

	var floor := StaticBody3D.new()
	floor.name = "ArenaFloor"
	var floor_shape := BoxShape3D.new()
	floor_shape.size = Vector3(ARENA_SIZE, 1.0, ARENA_SIZE)
	var floor_collision := CollisionShape3D.new()
	floor_collision.shape = floor_shape
	floor.add_child(floor_collision)
	var floor_mesh := MeshInstance3D.new()
	var floor_box := BoxMesh.new()
	floor_box.size = floor_shape.size
	floor_mesh.mesh = floor_box
	var floor_material := StandardMaterial3D.new()
	floor_material.albedo_color = Color(0.12, 0.16, 0.24)
	floor_material.roughness = 0.86
	floor_mesh.material_override = floor_material
	floor.add_child(floor_mesh)
	floor.position.y = -0.5
	add_child(floor)

	for edge in range(4):
		var wall := StaticBody3D.new()
		wall.name = "ArenaWall%d" % edge
		var shape := BoxShape3D.new()
		shape.size = Vector3(ARENA_SIZE, 3.0, 0.8) if edge < 2 else Vector3(0.8, 3.0, ARENA_SIZE)
		var collision := CollisionShape3D.new()
		collision.shape = shape
		wall.add_child(collision)
		var visual := MeshInstance3D.new()
		var wall_mesh := BoxMesh.new()
		wall_mesh.size = shape.size
		visual.mesh = wall_mesh
		var wall_material := StandardMaterial3D.new()
		wall_material.albedo_color = Color(0.2, 0.35, 0.48)
		wall_material.emission_enabled = true
		wall_material.emission = Color(0.035, 0.08, 0.12)
		visual.material_override = wall_material
		wall.add_child(visual)
		match edge:
			0: wall.position = Vector3(0, 1.0, -ARENA_SIZE * 0.5)
			1: wall.position = Vector3(0, 1.0, ARENA_SIZE * 0.5)
			2: wall.position = Vector3(-ARENA_SIZE * 0.5, 1.0, 0)
			_: wall.position = Vector3(ARENA_SIZE * 0.5, 1.0, 0)
		add_child(wall)

func _build_player() -> void:
	player = CharacterBody3D.new()
	player.name = "Player"
	player.position = Vector3(0, 1, 6)
	var shape := CapsuleShape3D.new()
	shape.radius = 0.46
	shape.height = 1.8
	var collision := CollisionShape3D.new()
	collision.shape = shape
	player.add_child(collision)
	var visual := MeshInstance3D.new()
	var capsule := CapsuleMesh.new()
	capsule.radius = shape.radius
	capsule.height = shape.height
	visual.mesh = capsule
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(0.16, 0.72, 1.0)
	material.metallic = 0.15
	material.emission_enabled = true
	material.emission = Color(0.015, 0.16, 0.25)
	visual.material_override = material
	player.add_child(visual)
	var camera := Camera3D.new()
	camera.position = Vector3(0, 17, 16)
	camera.rotation_degrees = Vector3(-48, 0, 0)
	camera.current = true
	player.add_child(camera)
	add_child(player)

func _build_enemies() -> void:
	for index in range(STARTING_ENEMIES):
		var enemy := CharacterBody3D.new()
		enemy.name = "RiftDrone_%02d" % index
		enemy.position = _enemy_start(index)
		enemy.collision_layer = 2
		enemy.collision_mask = 1
		enemy.set_meta("health", 2)
		var shape := CapsuleShape3D.new()
		shape.radius = 0.48
		shape.height = 1.7
		var collision := CollisionShape3D.new()
		collision.shape = shape
		enemy.add_child(collision)
		var visual := MeshInstance3D.new()
		var capsule := CapsuleMesh.new()
		capsule.radius = shape.radius
		capsule.height = shape.height
		visual.mesh = capsule
		var material := StandardMaterial3D.new()
		material.albedo_color = Color(0.95, 0.23, 0.28)
		material.emission_enabled = true
		material.emission = Color(0.2, 0.018, 0.025)
		visual.material_override = material
		enemy.add_child(visual)
		enemies.append(enemy)
		add_child(enemy)

func _enemy_start(index: int) -> Vector3:
	if index == 0:
		return Vector3(0, 1, -8)
	var angle := TAU * float(index - 1) / float(STARTING_ENEMIES - 1)
	return Vector3(sin(angle) * 10.0, 1, cos(angle) * 10.0)

func _build_hud() -> void:
	var layer := CanvasLayer.new()
	var panel := PanelContainer.new()
	panel.position = Vector2(18, 18)
	var margin := MarginContainer.new()
	for side in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 12)
	hud = Label.new()
	hud.add_theme_font_size_override("font_size", 20)
	margin.add_child(hud)
	panel.add_child(margin)
	layer.add_child(panel)
	add_child(layer)
	_update_hud()

func _physics_process(delta: float) -> void:
	if game_over:
		if Input.is_key_pressed(KEY_R): get_tree().reload_current_scene()
		return
	damage_cooldown = maxf(0.0, damage_cooldown - delta)
	_move_player(delta)
	_move_enemies(delta)
	_move_projectiles(delta)
	if Input.is_key_pressed(KEY_SPACE) and not attack_latched:
		_fire_projectile()
		attack_latched = true
	if not Input.is_key_pressed(KEY_SPACE): attack_latched = false
	_update_hud()

func _move_player(delta: float) -> void:
	var input := Vector2.ZERO
	if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT): input.x -= 1.0
	if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT): input.x += 1.0
	if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP): input.y -= 1.0
	if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN): input.y += 1.0
	input = input.normalized()
	if input.length() > 0.0:
		facing = Vector3(input.x, 0, input.y).normalized()
	player.velocity.x = input.x * PLAYER_SPEED
	player.velocity.z = input.y * PLAYER_SPEED
	_apply_gravity(player, delta)
	player.move_and_slide()
	player.position.x = clampf(player.position.x, -ARENA_SIZE * 0.5 + 1, ARENA_SIZE * 0.5 - 1)
	player.position.z = clampf(player.position.z, -ARENA_SIZE * 0.5 + 1, ARENA_SIZE * 0.5 - 1)

func _move_enemies(delta: float) -> void:
	for enemy in enemies:
		if not is_instance_valid(enemy): continue
		var offset := player.global_position - enemy.global_position
		offset.y = 0.0
		var distance := offset.length()
		if distance > 1.35:
			var direction := offset.normalized()
			enemy.velocity.x = direction.x * 2.6
			enemy.velocity.z = direction.z * 2.6
			_apply_gravity(enemy, delta)
			enemy.move_and_slide()
		if distance <= 1.45 and damage_cooldown <= 0.0:
			player_health = maxi(0, player_health - 20)
			damage_cooldown = 0.7
			if player_health == 0:
				game_over = true

func _move_projectiles(delta: float) -> void:
	for projectile in projectiles.duplicate():
		if not is_instance_valid(projectile):
			projectiles.erase(projectile)
			continue
		projectile.global_position += projectile.get_meta("direction") * PROJECTILE_SPEED * delta
		var remaining := float(projectile.get_meta("lifetime")) - delta
		projectile.set_meta("lifetime", remaining)
		if remaining <= 0.0 or absf(projectile.position.x) > ARENA_SIZE or absf(projectile.position.z) > ARENA_SIZE:
			projectiles.erase(projectile)
			projectile.queue_free()

func _fire_projectile() -> void:
	var projectile := Area3D.new()
	projectile.name = "PlayerProjectile"
	projectile.collision_layer = 0
	projectile.collision_mask = 2
	projectile.monitoring = true
	projectile.set_meta("direction", facing)
	projectile.set_meta("lifetime", PROJECTILE_LIFETIME)
	var collision := CollisionShape3D.new()
	var sphere := SphereShape3D.new()
	sphere.radius = 0.22
	collision.shape = sphere
	projectile.add_child(collision)
	var visual := MeshInstance3D.new()
	var mesh := SphereMesh.new()
	mesh.radius = sphere.radius
	mesh.height = sphere.radius * 2.0
	visual.mesh = mesh
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(0.45, 0.9, 1.0)
	material.emission_enabled = true
	material.emission = Color(0.2, 0.65, 0.9)
	visual.material_override = material
	projectile.add_child(visual)
	projectile.global_position = player.global_position + facing * 1.0 + Vector3.UP * 0.35
	projectile.body_entered.connect(_on_projectile_hit.bind(projectile))
	projectiles.append(projectile)
	add_child(projectile)

func _on_projectile_hit(body: Node3D, projectile: Area3D) -> void:
	if not is_instance_valid(projectile) or projectile.get_meta("spent", false): return
	if not enemies.has(body): return
	projectile.set_meta("spent", true)
	var health := int(body.get_meta("health", 1)) - 1
	if health <= 0:
		enemies.erase(body)
		body.queue_free()
		defeated += 1
		if enemies.is_empty(): game_over = true
	else:
		body.set_meta("health", health)
	projectiles.erase(projectile)
	projectile.queue_free()
	_update_hud()

func _apply_gravity(body: CharacterBody3D, delta: float) -> void:
	if not body.is_on_floor(): body.velocity.y -= GRAVITY * delta
	else: body.velocity.y = 0.0

func _update_hud() -> void:
	if hud == null: return
	if player_health <= 0:
		hud.text = "MISSION FAILED   %d / %d drones defeated   R: restart" % [defeated, STARTING_ENEMIES]
	elif enemies.is_empty():
		hud.text = "ARENA CLEAR   %d / %d drones defeated   R: restart" % [defeated, STARTING_ENEMIES]
	else:
		hud.text = "RIFT ARENA   Health %d   Drones %d / %d\nMove: WASD / arrows   Fire: Space   R: restart" % [player_health, defeated, STARTING_ENEMIES]

`,
    'assets/README.md': `# Game assets\n\nThis starter uses built-in Godot primitive geometry and contains no third-party or licensed assets. Add project-owned assets under this folder with their relative paths preserved. Godot imports supported textures, models, materials, and audio when the project is opened or built. Keep source assets in version control and avoid runtime web URLs for required game content.\n\nUpload original PNG, JPEG, or WebP textures from the IDE Game images panel. The build verifies file signatures, size limits, and SHA-256 before packaging the private assets.\n`,
    'README.md': `# ${title}\n\nOriginal single-player 3D action arena for Godot 4.7. Move the blue capsule, fire energy shots at six approaching drones, and survive until the arena is clear. Geometry is generated from built-in Godot primitives; the project does not contain licensed assets or claim online multiplayer.\n\n## Controls\n\n- Move: WASD or arrow keys.\n- Fire: Space, in the direction of the last movement (initially forward).\n- Restart after the result: R.\n\n## Manual checks\n\n1. Open the project in Godot and run the main scene; confirm the arena and HUD appear.\n2. Move in four directions; confirm arena walls contain the player.\n3. Aim by moving in the desired direction, then fire at a drone; two hits should defeat it.\n4. Let a drone reach the player; health should decrease with a short cooldown.\n5. Defeat all six drones and confirm the clear state; allow contact damage to reach zero and confirm the failure state.\n6. Press R from either result state and confirm a fresh arena starts.\n\nThe project includes a Windows Desktop export preset; matching Godot export templates are required to create a local binary. The deployed worker still needs a real HTTPS endpoint and explicit preset configuration.\n\n## Asset boundary\n\nThe project contains an assets/ folder for original project assets. Upload PNG/JPEG/WebP files from the IDE Game images panel. Assets stay in private storage and are hash-verified when packaged; external URLs are not build dependencies.\n\nThis is a local single-player prototype. A dedicated online match service, multiplayer synchronization, production animation, audio, and store signing are not implemented.\n\n## Requested brief\n\n\`\`\`json\n${jsonBrief}\n\`\`\`\n`,
  };
}
