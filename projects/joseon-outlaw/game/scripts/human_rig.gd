class_name HumanRigController
extends Node3D

@export var gait_scale := 1.0
@export var clothing_color := Color("173442")
@export var sash_color := Color("792a20")

var _body: CharacterBody3D
var _attack_tween: Tween


func _ready() -> void:
    var candidate := get_parent()
    while candidate != null and candidate is not CharacterBody3D:
        candidate = candidate.get_parent()
    _body = candidate as CharacterBody3D
    set_clothing_color(clothing_color)


func set_clothing_color(color: Color) -> void:
    clothing_color = color
    var material := StandardMaterial3D.new()
    material.albedo_color = color
    material.roughness = 0.9
    material.cull_mode = BaseMaterial3D.CULL_DISABLED
    material.transparency = BaseMaterial3D.TRANSPARENCY_DISABLED
    var underlayer := find_child("male_casualsuit06Mesh", true, false) as MeshInstance3D
    if underlayer != null:
        underlayer.material_override = material
    for node in find_children("Hanbok*", "MeshInstance3D", true, false):
        var garment := node as MeshInstance3D
        var garment_material := material
        if "Sash" in garment.name:
            garment_material = material.duplicate() as StandardMaterial3D
            garment_material.albedo_color = sash_color
        garment.material_override = garment_material


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
