class_name HumanRigController
extends Node3D

@export var gait_scale := 1.0

var _body: CharacterBody3D
var _attack_tween: Tween


func _ready() -> void:
    var candidate := get_parent()
    while candidate != null and candidate is not CharacterBody3D:
        candidate = candidate.get_parent()
    _body = candidate as CharacterBody3D


func _process(_delta: float) -> void:
    var speed := 0.0
    if _body != null:
        speed = Vector2(_body.velocity.x, _body.velocity.z).length()
    if speed <= 0.15:
        position.y = lerpf(position.y, 0.0, 0.18)
        rotation.z = lerpf(rotation.z, 0.0, 0.18)
        return
    var cadence := 0.013 + minf(speed, 8.0) * 0.0012
    var phase := Time.get_ticks_msec() * cadence
    position.y = absf(sin(phase)) * 0.018 * gait_scale
    rotation.z = deg_to_rad(sin(phase) * minf(speed * 0.22, 1.2) * gait_scale)


func animate_attack() -> void:
    if _attack_tween != null and _attack_tween.is_valid():
        _attack_tween.kill()
    _attack_tween = create_tween()
    _attack_tween.tween_property(self, "rotation_degrees:x", -7.0, 0.08)
    _attack_tween.parallel().tween_property(self, "rotation_degrees:y", -11.0, 0.08)
    _attack_tween.tween_property(self, "rotation_degrees:x", 0.0, 0.2)
    _attack_tween.parallel().tween_property(self, "rotation_degrees:y", 0.0, 0.2)
