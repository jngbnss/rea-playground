class_name BanditController
extends CharacterBody3D

signal state_changed(previous: String, current: String)
signal health_changed(current: int, maximum: int)
signal died(bandit: BanditController)

const PATROL := "patrol"
const ALERT := "alert"
const CHASE := "chase"
const ATTACK := "attack"
const STAGGER := "stagger"
const RETURN := "return"
const DEAD := "dead"

@export var max_health := 60
@export var move_speed := 3.2
@export var detection_range := 11.0
@export var attack_range := 2.2
@export var leash_range := 24.0
@export var attack_damage := 12

@onready var visual: Node3D = $Visual
@onready var weapon: MeshInstance3D = $Visual/Weapon
@onready var human_rig: Node = $Visual/HumanRig
@onready var state_label: Label3D = $StateLabel

var health := 60
var state := PATROL
var target: PlayerController
var _spawn_position := Vector3.ZERO
var _patrol_direction := 1.0
var _attack_cooldown := 0.0
var _stagger_time := 0.0
var _gravity: float = ProjectSettings.get_setting("physics/3d/default_gravity")


func _ready() -> void:
    add_to_group("enemies")
    health = max_health
    _spawn_position = global_position
    target = get_tree().get_first_node_in_group("player") as PlayerController
    _show_state()


func _physics_process(delta: float) -> void:
    if state == DEAD:
        return
    _attack_cooldown = maxf(0.0, _attack_cooldown - delta)
    if not is_on_floor():
        velocity.y -= _gravity * delta
    if state == STAGGER:
        _stagger_time -= delta
        velocity.x = move_toward(velocity.x, 0.0, 10.0 * delta)
        velocity.z = move_toward(velocity.z, 0.0, 10.0 * delta)
        if _stagger_time <= 0.0:
            _set_state(CHASE)
        move_and_slide()
        return
    if target == null or not is_instance_valid(target) or target.is_dead:
        _return_home(delta)
        move_and_slide()
        return

    var target_distance := global_position.distance_to(target.global_position)
    var home_distance := global_position.distance_to(_spawn_position)
    match state:
        PATROL:
            _patrol(delta)
            if target_distance <= detection_range:
                _set_state(ALERT)
        ALERT:
            velocity.x = 0.0
            velocity.z = 0.0
            _set_state(CHASE)
        CHASE:
            if home_distance > leash_range:
                _set_state(RETURN)
            elif target_distance <= attack_range and CombatCoordinator.request_attack(self):
                _set_state(ATTACK)
            else:
                _move_toward(target.global_position, move_speed)
        ATTACK:
            velocity.x = 0.0
            velocity.z = 0.0
            _face(target.global_position)
            if target_distance > attack_range + 0.8:
                CombatCoordinator.release_attack(self)
                _set_state(CHASE)
            elif _attack_cooldown <= 0.0:
                _attack_cooldown = 1.1
                target.receive_damage(attack_damage)
                _swing_weapon()
        RETURN:
            _return_home(delta)
    move_and_slide()


func take_damage(amount: int, attacker: Node3D = null) -> bool:
    if state == DEAD or amount <= 0:
        return false
    health = maxi(0, health - amount)
    health_changed.emit(health, max_health)
    if health == 0:
        CombatCoordinator.release_attack(self)
        _set_state(DEAD)
        collision_layer = 0
        collision_mask = 0
        died.emit(self)
        visual.rotation_degrees.z = 90.0
        state_label.text = "제압됨"
    else:
        if attacker is PlayerController:
            target = attacker
        CombatCoordinator.release_attack(self)
        _stagger_time = 0.28
        _set_state(STAGGER)
    return true


func set_combat_target(next_target: PlayerController) -> void:
    target = next_target


func reset_combat(position_override := Vector3.INF) -> void:
    if position_override != Vector3.INF:
        global_position = position_override
        _spawn_position = position_override
    health = max_health
    velocity = Vector3.ZERO
    visual.rotation = Vector3.ZERO
    collision_layer = 1
    collision_mask = 1
    _set_state(PATROL)
    health_changed.emit(health, max_health)


func _patrol(_delta: float) -> void:
    var offset := global_position.x - _spawn_position.x
    if absf(offset) > 3.0:
        _patrol_direction = -signf(offset)
    velocity.x = _patrol_direction * move_speed * 0.45
    velocity.z = 0.0
    _face(global_position + Vector3(velocity.x, 0.0, 0.0))


func _return_home(_delta: float) -> void:
    CombatCoordinator.release_attack(self)
    if global_position.distance_to(_spawn_position) < 0.7:
        velocity.x = 0.0
        velocity.z = 0.0
        _set_state(PATROL)
    else:
        _set_state(RETURN)
        _move_toward(_spawn_position, move_speed)


func _move_toward(destination: Vector3, speed: float) -> void:
    var direction := (destination - global_position)
    direction.y = 0.0
    direction = direction.normalized()
    velocity.x = direction.x * speed
    velocity.z = direction.z * speed
    _face(destination)


func _face(destination: Vector3) -> void:
    var flat_target := Vector3(destination.x, global_position.y, destination.z)
    if not global_position.is_equal_approx(flat_target):
        visual.look_at(flat_target, Vector3.UP, true)


func _set_state(next: String) -> void:
    if state == next:
        return
    var previous := state
    state = next
    state_changed.emit(previous, state)
    _show_state()


func _show_state() -> void:
    state_label.text = {PATROL: "순찰", ALERT: "발견!", CHASE: "추적", ATTACK: "공격", STAGGER: "경직", RETURN: "복귀", DEAD: "제압됨"}.get(state, state)


func _swing_weapon() -> void:
    human_rig.animate_attack()
    var tween := create_tween()
    tween.tween_property(weapon, "rotation_degrees:z", -75.0, 0.1)
    tween.tween_property(weapon, "rotation_degrees:z", 10.0, 0.18)
