class_name CourierCart
extends CharacterBody3D

signal driving_changed(active: bool)
signal route_progress(current: int, total: int)
signal route_completed

const START_POSITION := Vector3(0, 0.05, -24)
const CHECKPOINTS := [
    Vector3(0, 0.05, -30),
    Vector3(0, 0.05, -37),
    Vector3(0, 0.05, -44),
]
const CHECKPOINT_RADIUS := 2.8
const MAX_FORWARD_SPEED := 14.0
const MAX_REVERSE_SPEED := 4.0
const ENGINE_ACCELERATION := 6.5
const BRAKE_DECELERATION := 12.0
const COAST_DECELERATION := 2.2
const WHEELBASE := 2.7
const LOW_SPEED_STEER := deg_to_rad(32.0)
const HIGH_SPEED_STEER := deg_to_rad(8.0)
const STEER_RATE := 2.8
const STEER_RETURN_RATE := 4.6

@onready var camera: Camera3D = $CameraRig/Pitch/SpringArm3D/Camera3D
@onready var speed_label: Label3D = $SpeedLabel

var driving := false
var route_complete := false
var checkpoint_index := 0
var forward_speed := 0.0
var steer_angle := 0.0
var _player: PlayerController
var _test_enabled := false
var _test_throttle := 0.0
var _test_brake := 0.0
var _test_steer := 0.0
var _gravity: float = ProjectSettings.get_setting("physics/3d/default_gravity")
var _gate_materials: Array[StandardMaterial3D] = []


func _ready() -> void:
    add_to_group("interactable")
    add_to_group("courier_cart")
    _ensure_input_action()
    _build_route_markers()
    reset_route()


func _physics_process(delta: float) -> void:
    if not driving:
        speed_label.text = "역참 수레"
        return
    var throttle := _test_throttle if _test_enabled else float(Input.is_action_pressed("move_forward"))
    var brake := _test_brake if _test_enabled else float(Input.is_action_pressed("move_back"))
    var steer := _test_steer if _test_enabled else Input.get_axis("move_left", "move_right")
    _update_speed(throttle, brake, delta)
    _update_steering(steer, delta)
    rotation.y -= forward_speed / WHEELBASE * tan(steer_angle) * delta
    var horizontal := -global_basis.z * forward_speed
    velocity.x = horizontal.x
    velocity.z = horizontal.z
    if not is_on_floor():
        velocity.y -= _gravity * delta
    else:
        velocity.y = -0.5
    move_and_slide()
    for index in get_slide_collision_count():
        if absf(get_slide_collision(index).get_normal().y) < 0.5:
            forward_speed *= 0.72
            break
    _player.global_position = global_position
    camera.fov = lerpf(58.0, 67.0, clampf(absf(forward_speed) / MAX_FORWARD_SPEED, 0.0, 1.0))
    speed_label.text = "%d km/h" % roundi(absf(forward_speed) * 3.6)
    _update_checkpoint()
    if not _test_enabled and Input.is_action_just_pressed("cart_reset"):
        reset_cart()


func prompt() -> String:
    if driving:
        return "E  수레에서 내리기"
    if QuestManager.state != QuestManager.ACCEPTED:
        return "윤 행수의 의뢰를 받은 뒤 이용할 수 있다"
    if route_complete:
        return "E  수레 타기 · 운송 완료"
    return "E  역참 수레 타기"


func interact() -> Dictionary:
    if driving:
        _dismount()
        return {"speaker": "역참 수레", "text": "수레에서 내렸다."}
    if QuestManager.state != QuestManager.ACCEPTED:
        return {"speaker": "역참 수레", "text": "먼저 윤 행수의 의뢰를 확인하자."}
    if _mount():
        return {"speaker": "역참 수레", "text": "고삐를 잡았다. 금빛 관문 셋을 차례로 통과하자."}
    return {"speaker": "역참 수레", "text": "지금은 수레를 탈 수 없다."}


func reset_cart() -> void:
    global_position = START_POSITION
    rotation = Vector3.ZERO
    velocity = Vector3.ZERO
    forward_speed = 0.0
    steer_angle = 0.0
    if not route_complete:
        checkpoint_index = 0
        route_progress.emit(checkpoint_index, CHECKPOINTS.size())
        _update_gate_materials()
    if driving and _player != null:
        _player.global_position = global_position


func reset_route() -> void:
    if driving:
        _dismount()
    route_complete = false
    checkpoint_index = 0
    reset_cart()
    route_progress.emit(0, CHECKPOINTS.size())
    _update_gate_materials()


func set_test_input(throttle: float, brake: float, steer: float) -> void:
    _test_enabled = true
    _test_throttle = clampf(throttle, 0.0, 1.0)
    _test_brake = clampf(brake, 0.0, 1.0)
    _test_steer = clampf(steer, -1.0, 1.0)


func clear_test_input() -> void:
    _test_enabled = false
    _test_throttle = 0.0
    _test_brake = 0.0
    _test_steer = 0.0


func _mount() -> bool:
    _player = get_tree().get_first_node_in_group("player") as PlayerController
    if _player == null or _player.is_dead:
        return false
    driving = true
    _player.set_physics_process(false)
    _player.velocity = Vector3.ZERO
    _player.visible = false
    _player.get_node("CollisionShape3D").set_deferred("disabled", true)
    _player.get_node("CameraRig/Pitch/SpringArm3D/Camera3D").current = false
    _player.global_position = global_position
    camera.current = true
    driving_changed.emit(true)
    return true


func _dismount() -> void:
    driving = false
    forward_speed = 0.0
    steer_angle = 0.0
    camera.current = false
    if _player != null:
        _player.global_position = global_position + global_basis.x * 1.8 + Vector3(0, 0.05, 0)
        _player.visible = true
        _player.get_node("CollisionShape3D").set_deferred("disabled", false)
        _player.set_physics_process(true)
        _player.get_node("CameraRig/Pitch/SpringArm3D/Camera3D").current = true
    driving_changed.emit(false)


func _update_speed(throttle: float, brake: float, delta: float) -> void:
    if throttle > 0.0:
        if forward_speed < -0.2:
            forward_speed = move_toward(forward_speed, 0.0, BRAKE_DECELERATION * throttle * delta)
        else:
            forward_speed = move_toward(forward_speed, MAX_FORWARD_SPEED * throttle, ENGINE_ACCELERATION * delta)
    elif brake > 0.0:
        if forward_speed > 0.2:
            forward_speed = move_toward(forward_speed, 0.0, BRAKE_DECELERATION * brake * delta)
        else:
            forward_speed = move_toward(forward_speed, -MAX_REVERSE_SPEED * brake, ENGINE_ACCELERATION * 0.55 * delta)
    else:
        forward_speed = move_toward(forward_speed, 0.0, COAST_DECELERATION * delta)


func _update_steering(input_value: float, delta: float) -> void:
    var speed_ratio := clampf(absf(forward_speed) / MAX_FORWARD_SPEED, 0.0, 1.0)
    var fade := speed_ratio * (2.0 - speed_ratio)
    var maximum := lerpf(LOW_SPEED_STEER, HIGH_SPEED_STEER, fade)
    var target := input_value * maximum
    var returning := absf(input_value) < 0.01 or signf(target) != signf(steer_angle)
    var rate := STEER_RETURN_RATE if returning else STEER_RATE
    steer_angle = move_toward(steer_angle, target, rate * delta)


func _update_checkpoint() -> void:
    if route_complete or QuestManager.state != QuestManager.ACCEPTED:
        return
    if global_position.distance_to(CHECKPOINTS[checkpoint_index]) > CHECKPOINT_RADIUS:
        return
    checkpoint_index += 1
    route_progress.emit(checkpoint_index, CHECKPOINTS.size())
    if checkpoint_index == CHECKPOINTS.size():
        route_complete = true
        route_completed.emit()
    _update_gate_materials()


func _build_route_markers() -> void:
    var root := Node3D.new()
    root.name = "CourierGates"
    get_parent().call_deferred("add_child", root)
    for index in CHECKPOINTS.size():
        var material := StandardMaterial3D.new()
        material.albedo_color = Color("766242")
        material.emission_enabled = true
        material.emission = Color("2c251c")
        material.emission_energy_multiplier = 0.4
        _gate_materials.append(material)
        var gate := Node3D.new()
        gate.name = "Gate%02d" % (index + 1)
        gate.position = CHECKPOINTS[index]
        root.add_child(gate)
        _gate_box(gate, Vector3(-2.5, 1.5, 0), Vector3(0.18, 3.0, 0.18), material)
        _gate_box(gate, Vector3(2.5, 1.5, 0), Vector3(0.18, 3.0, 0.18), material)
        _gate_box(gate, Vector3(0, 2.85, 0), Vector3(5.2, 0.18, 0.18), material)
        var label := Label3D.new()
        label.position = Vector3(0, 3.45, 0)
        label.text = "운송 관문 %d" % (index + 1)
        label.font_size = 34
        label.outline_size = 8
        label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
        label.modulate = Color("f0d58a")
        gate.add_child(label)


func _gate_box(parent: Node3D, position: Vector3, size: Vector3, material: StandardMaterial3D) -> void:
    var instance := MeshInstance3D.new()
    instance.position = position
    var mesh := BoxMesh.new()
    mesh.size = size
    instance.mesh = mesh
    instance.material_override = material
    parent.add_child(instance)


func _update_gate_materials() -> void:
    for index in _gate_materials.size():
        var material := _gate_materials[index]
        var active := not route_complete and index == checkpoint_index
        var passed := route_complete or index < checkpoint_index
        material.albedo_color = Color("d7ad4f") if active else (Color("526b50") if passed else Color("766242"))
        material.emission = Color("d7ad4f") if active else Color("2c251c")
        material.emission_energy_multiplier = 2.4 if active else 0.35


func _ensure_input_action() -> void:
    if InputMap.has_action(&"cart_reset"):
        return
    InputMap.add_action(&"cart_reset")
    var event := InputEventKey.new()
    event.physical_keycode = KEY_R
    InputMap.action_add_event(&"cart_reset", event)
