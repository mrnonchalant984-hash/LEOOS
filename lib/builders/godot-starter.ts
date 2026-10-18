import { GODOT_WINDOWS_DESKTOP_PRESET } from './godot-export-preset.ts';

export function createGodot3dStarter(name: string, brief: Record<string, unknown>) {
  const title = name.trim().slice(0, 100) || 'Coin Collector';
  const jsonBrief = JSON.stringify(brief, null, 2).slice(0, 12_000);
  return {
    'project.godot': `; Engine configuration file.\n; Created by LeonardX.\nconfig_version=5\n\n[application]\nconfig/name=${JSON.stringify(title)}\nrun/main_scene="res://Main.tscn"\nconfig/features=PackedStringArray("4.7", "GL Compatibility")\n\n[display]\nwindow/size/viewport_width=1280\nwindow/size/viewport_height=720\nwindow/stretch/mode="canvas_items"\n\n[rendering]\nrenderer/rendering_method="gl_compatibility"\nrenderer/rendering_method.mobile="gl_compatibility"\nenvironment/defaults/default_clear_color=Color(0.08, 0.13, 0.2, 1)\n`,
    'export_presets.cfg': GODOT_WINDOWS_DESKTOP_PRESET,
    'Main.tscn': '[gd_scene load_steps=2 format=3]\n\n[ext_resource type="Script" path="res://main.gd" id="1_main"]\n\n[node name="Main" type="Node3D"]\nscript = ExtResource("1_main")\n',
    'main.gd': `extends Node3D

const COIN_COUNT := 10
const MOVE_SPEED := 7.0
const JUMP_SPEED := 8.5
const GRAVITY := 20.0

var player: CharacterBody3D
var score := 0
var coins: Array[Area3D] = []
var score_label: Label

func _ready() -> void:
\trandomize()
\t_build_world()
\t_build_player()
\t_build_coins()
\t_build_hud()

func _build_world() -> void:
\tvar environment_node := WorldEnvironment.new()
\tvar environment := Environment.new()
\tenvironment.background_mode = Environment.BG_COLOR
\tenvironment.background_color = Color(0.42, 0.68, 0.92)
\tenvironment.ambient_light_color = Color(0.72, 0.78, 0.86)
\tenvironment.ambient_light_energy = 0.7
\tenvironment_node.environment = environment
\tadd_child(environment_node)

\tvar sun := DirectionalLight3D.new()
\tsun.rotation_degrees = Vector3(-52, -28, 0)
\tsun.light_energy = 1.2
\tadd_child(sun)

\tvar ground := StaticBody3D.new()
\tground.name = "Ground"
\tvar ground_shape := CollisionShape3D.new()
\tvar box_shape := BoxShape3D.new()
\tbox_shape.size = Vector3(32, 1, 32)
\tground_shape.shape = box_shape
\tground.add_child(ground_shape)
\tvar ground_mesh := MeshInstance3D.new()
\tvar box_mesh := BoxMesh.new()
\tbox_mesh.size = box_shape.size
\tground_mesh.mesh = box_mesh
\tvar grass := StandardMaterial3D.new()
\tgrass.albedo_color = Color(0.18, 0.48, 0.31)
\tground_mesh.material_override = grass
\tground.add_child(ground_mesh)
\tground.position.y = -0.5
\tadd_child(ground)

func _build_player() -> void:
\tplayer = CharacterBody3D.new()
\tplayer.name = "Player"
\tplayer.position = Vector3(0, 1, 5)
\tvar body_shape := CollisionShape3D.new()
\tvar capsule := CapsuleShape3D.new()
\tcapsule.radius = 0.42
\tcapsule.height = 1.7
\tbody_shape.shape = capsule
\tplayer.add_child(body_shape)
\tvar body_mesh := MeshInstance3D.new()
\tvar capsule_mesh := CapsuleMesh.new()
\tcapsule_mesh.radius = capsule.radius
\tcapsule_mesh.height = capsule.height
\tbody_mesh.mesh = capsule_mesh
\tvar player_material := StandardMaterial3D.new()
\tplayer_material.albedo_color = Color(0.18, 0.36, 0.92)
\tbody_mesh.material_override = player_material
\tplayer.add_child(body_mesh)
\tvar camera := Camera3D.new()
\tcamera.position = Vector3(0, 6, 9)
\tcamera.rotation_degrees = Vector3(-28, 0, 0)
\tcamera.current = true
\tplayer.add_child(camera)
\tadd_child(player)

func _build_coins() -> void:
\tfor index in range(COIN_COUNT):
\t\tvar coin := Area3D.new()
\t\tcoin.name = "Coin_%02d" % index
\t\tcoin.position = Vector3(randf_range(-12, 12), 1, randf_range(-12, 12))
\t\tvar pickup_shape := CollisionShape3D.new()
\t\tvar sphere := SphereShape3D.new()
\t\tsphere.radius = 0.75
\t\tpickup_shape.shape = sphere
\t\tcoin.add_child(pickup_shape)
\t\tvar visual := MeshInstance3D.new()
\t\tvar coin_mesh := CylinderMesh.new()
\t\tcoin_mesh.top_radius = 0.38
\t\tcoin_mesh.bottom_radius = 0.38
\t\tcoin_mesh.height = 0.16
\t\tvisual.mesh = coin_mesh
\t\tvar gold := StandardMaterial3D.new()
\t\tgold.albedo_color = Color(1.0, 0.72, 0.08)
\t\tgold.metallic = 0.55
\t\tvisual.material_override = gold
\t\tcoin.add_child(visual)
\t\tcoin.body_entered.connect(_on_coin_body_entered.bind(coin))
\t\tcoins.append(coin)
\t\tadd_child(coin)

func _build_hud() -> void:
\tvar hud := CanvasLayer.new()
\tvar panel := PanelContainer.new()
\tpanel.position = Vector2(20, 20)
\tvar margin := MarginContainer.new()
\tmargin.add_theme_constant_override("margin_left", 14)
\tmargin.add_theme_constant_override("margin_right", 14)
\tmargin.add_theme_constant_override("margin_top", 10)
\tmargin.add_theme_constant_override("margin_bottom", 10)
\tscore_label = Label.new()
\tscore_label.add_theme_font_size_override("font_size", 20)
\tscore_label.text = _hud_text()
\tmargin.add_child(score_label)
\tpanel.add_child(margin)
\thud.add_child(panel)
\tadd_child(hud)

func _physics_process(delta: float) -> void:
\tif player == null:
\t\treturn
\tvar input := Vector2.ZERO
\tif Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT): input.x -= 1.0
\tif Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT): input.x += 1.0
\tif Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP): input.y -= 1.0
\tif Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN): input.y += 1.0
\tinput = input.normalized()
\tplayer.velocity.x = input.x * MOVE_SPEED
\tplayer.velocity.z = input.y * MOVE_SPEED
\tif player.is_on_floor() and Input.is_key_pressed(KEY_SPACE):
\t\tplayer.velocity.y = JUMP_SPEED
\tif not player.is_on_floor():
\t\tplayer.velocity.y -= GRAVITY * delta
\tplayer.move_and_slide()
\tif player.position.y < -10:
\t\tplayer.position = Vector3(0, 1, 5)
\t\tplayer.velocity = Vector3.ZERO
\tfor coin in coins:
\t\tif is_instance_valid(coin): coin.rotate_y(delta * 2.4)

func _on_coin_body_entered(body: Node3D, coin: Area3D) -> void:
\tif body != player or not is_instance_valid(coin):
\t\treturn
\tscore += 1
\tcoins.erase(coin)
\tcoin.queue_free()
\tscore_label.text = _hud_text()

func _hud_text() -> String:
\tif score >= COIN_COUNT:
\t\treturn "You win! All %d coins collected. Press R to play again." % COIN_COUNT
\treturn "Coin Collector   %d / %d\\nMove: WASD or arrows   Jump: Space" % [score, COIN_COUNT]

func _process(_delta: float) -> void:
\tif score >= COIN_COUNT and Input.is_key_pressed(KEY_R):
\t\tget_tree().reload_current_scene()
`,
    'README.md': `# ${title}\n\nLeonardX 3D Godot starter prototype. Collect all ${10} gold coins in a small 3D arena.\n\n- Move with WASD or arrow keys.\n- Jump with Space.\n- Collect every coin to win; press R to restart.\n- The prototype uses generated primitive meshes and contains no third-party assets.\n\n## Requested brief\n\n\`\`\`json\n${jsonBrief}\n\`\`\`\n\nOpen this folder in Godot 4.7 or later. A Windows Desktop export preset is included; install the matching Godot export templates for a local export. A deployed build worker must explicitly enable its verified presets. This source has not yet been run or exported by LeonardX.\n`,
  };
}
