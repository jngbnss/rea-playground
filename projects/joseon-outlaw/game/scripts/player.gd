class_name PlayerController
extends CharacterBody3D

signal movement_state_changed(state: String)
signal health_changed(current: int, maximum: int)
signal died

@export var walk_speed := 4.5
@export var run_speed := 7.5
@export var acceleration := 18.0
@export var jump_velocity := 6.0
@export var mouse_sensitivity := 0.0025
@export var max_health := 100
@export var attack_damage := 20
@export var attack_range := 2.8

@onready var visual: Node3D = $Visual
@onready var sword: MeshInstance3D = $Visual/Sword
@onready var camera_rig: Node3D = $CameraRig
@onready var pitch: Node3D = $CameraRig/Pitch

var movement_state := "idle"
var health := 100
var is_dead := false
var _test_enabled := false
var _test_input := Vector2.ZERO
var _test_sprint := false
var _test_jump := false
var _attack_ready := true
var _attack_tween: Tween
var _gravity: float = ProjectSettings.get_setting("physics/3d/default_gravity")


func _ready() -> void:
    add_to_group("player")
    health = max_health
    _ensure_input_actions()
    var smoke_run := false
    for argument in OS.get_cmdline_user_args():
        if argument.begins_with("--smoke-phase="):
            smoke_run = true
            break
    if not smoke_run:
        Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


func _unhandled_input(event: InputEvent) -> void:
    if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
        camera_rig.rotate_y(-event.relative.x * mouse_sensitivity)
        pitch.rotation.x = clamp(pitch.rotation.x - event.relative.y * mouse_sensitivity, deg_to_rad(-55.0), deg_to_rad(35.0))
    elif event.is_action_pressed("toggle_mouse"):
        Input.mouse_mode = Input.MOUSE_MODE_VISIBLE if Input.mouse_mode == Input.MOUSE_MODE_CAPTURED else Input.MOUSE_MODE_CAPTURED


func _physics_process(delta: float) -> void:
    if is_dead:
        return
    var input_vector := _test_input if _test_enabled else Input.get_vector("move_left", "move_right", "move_forward", "move_back")
    var sprinting := _test_sprint if _test_enabled else Input.is_action_pressed("sprint")
    var wants_jump := _consume_test_jump() if _test_enabled else Input.is_action_just_pressed("jump")
    _move(input_vector, sprinting, wants_jump, delta)
    if not _test_enabled and Input.is_action_just_pressed("attack"):
        attack()


func _move(input_vector: Vector2, sprinting: bool, wants_jump: bool, delta: float) -> void:
    var camera_basis := Basis(Vector3.UP, camera_rig.global_rotation.y)
    var direction := (camera_basis * Vector3(input_vector.x, 0.0, input_vector.y)).normalized()
    var speed := run_speed if sprinting else walk_speed
    var target_velocity := direction * speed
    velocity.x = move_toward(velocity.x, target_velocity.x, acceleration * delta)
    velocity.z = move_toward(velocity.z, target_velocity.z, acceleration * delta)
    if not is_on_floor():
        velocity.y -= _gravity * delta
    elif wants_jump:
        velocity.y = jump_velocity
    move_and_slide()
    if direction.length_squared() > 0.01:
        visual.rotation.y = lerp_angle(visual.rotation.y, atan2(direction.x, direction.z), minf(1.0, 12.0 * delta))
    _set_movement_state(direction, sprinting)


func attack() -> int:
    if not _attack_ready or is_dead:
        return 0
    _attack_ready = false
    _animate_attack()
    get_tree().create_timer(0.35).timeout.connect(func() -> void: _attack_ready = true)
    var hits := 0
    var forward := -visual.global_basis.z.normalized()
    for candidate in get_tree().get_nodes_in_group("enemies"):
        var enemy := candidate as Node3D
        if enemy == null:
            continue
        var offset := enemy.global_position - global_position
        var flat_offset := Vector3(offset.x, 0.0, offset.z)
        if flat_offset.length() <= attack_range and forward.dot(flat_offset.normalized()) >= 0.25:
            if enemy.call("take_damage", attack_damage, self):
                hits += 1
    return hits


func receive_damage(amount: int) -> bool:
    if is_dead or amount <= 0:
        return false
    health = maxi(0, health - amount)
    health_changed.emit(health, max_health)
    if health == 0:
        is_dead = true
        velocity = Vector3.ZERO
        visual.rotation_degrees.z = 90.0
        died.emit()
    return true


func restore_at(checkpoint: Vector3) -> void:
    global_position = checkpoint
    velocity = Vector3.ZERO
    health = max_health
    is_dead = false
    visual.rotation = Vector3.ZERO
    health_changed.emit(health, max_health)


func _animate_attack() -> void:
    if _attack_tween != null and _attack_tween.is_valid():
        _attack_tween.kill()
    _attack_tween = create_tween()
    _attack_tween.tween_property(sword, "rotation_degrees:z", -95.0, 0.1)
    _attack_tween.tween_property(sword, "rotation_degrees:z", -8.0, 0.2)


func _set_movement_state(direction: Vector3, sprinting: bool) -> void:
    var next := "jump" if not is_on_floor() else ("run" if sprinting and not direction.is_zero_approx() else ("walk" if not direction.is_zero_approx() else "idle"))
    if next != movement_state:
        movement_state = next
        movement_state_changed.emit(next)
    var bob := sin(Time.get_ticks_msec() * 0.012) * 0.035 if next in ["walk", "run"] else 0.0
    visual.position.y = lerpf(visual.position.y, bob, 0.25)


func set_test_input(input_vector: Vector2, sprinting := false, jump := false) -> void:
    _test_enabled = true
    _test_input = input_vector
    _test_sprint = sprinting
    _test_jump = jump


func clear_test_input() -> void:
    _test_enabled = false
    _test_input = Vector2.ZERO
    _test_sprint = false
    _test_jump = false


func _consume_test_jump() -> bool:
    var value := _test_jump
    _test_jump = false
    return value


func _ensure_input_actions() -> void:
    var actions := {
        &"move_left": KEY_A,
        &"move_right": KEY_D,
        &"move_forward": KEY_W,
        &"move_back": KEY_S,
        &"sprint": KEY_SHIFT,
        &"jump": KEY_SPACE,
        &"interact": KEY_E,
        &"toggle_mouse": KEY_ESCAPE,
    }
    for action: StringName in actions:
        if InputMap.has_action(action):
            continue
        InputMap.add_action(action)
        var event := InputEventKey.new()
        event.physical_keycode = actions[action]
        InputMap.action_add_event(action, event)
    if not InputMap.has_action(&"attack"):
        InputMap.add_action(&"attack")
        var mouse_event := InputEventMouseButton.new()
        mouse_event.button_index = MOUSE_BUTTON_LEFT
        InputMap.action_add_event(&"attack", mouse_event)
