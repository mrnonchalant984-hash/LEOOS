extends CharacterBody3D

const SPEED := 5.0
const GRAVITY := 18.0

func _physics_process(delta: float) -> void:
	if not is_on_floor():
		velocity.y -= GRAVITY * delta

	var input_vector := Input.get_vector("move_left", "move_right", "move_forward", "move_backward")
	var direction := Vector3(input_vector.x, 0.0, input_vector.y)
	if direction.length() > 1.0:
		direction = direction.normalized()

	velocity.x = direction.x * SPEED
	velocity.z = direction.z * SPEED
	move_and_slide()

