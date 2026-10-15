class_name JoseonWorld
extends Node3D

var _wood := _material(Color("6d4326"))
var _plaster := _material(Color("d8c9a6"))
var _roof := _material(Color("292724"))
var _path := _material(Color("8a6541"))
var _pine := _material(Color("304c2d"))
var _stone := _material(Color("77746b"))
var _red := _material(Color("9f3027"))
var _gold := _material(Color("d9a441"))


func _ready() -> void:
    _build_path()
    _build_village()
    _build_mountain_pass()
    _build_camp()


func _build_path() -> void:
    for index in 6:
        _box("Path%02d" % index, Vector3(0, 0.025, 5 - index * 11), Vector3(5.5, 0.05, 10.5), _path, false)


func _build_village() -> void:
    _hanok(Vector3(-8, 0, 1), Vector3(6, 3.2, 5), "윤 행수의 집")
    _hanok(Vector3(8, 0, -3), Vector3(7, 3.5, 5.5), "덕순 주막")
    _hanok(Vector3(-9, 0, -10), Vector3(5, 2.8, 4.5), "창고")
    _gate(Vector3(0, 0, -13))
    _marker(Vector3(0, 3.6, 8), "청송골")
    _box("MarketBannerLeft", Vector3(-4.2, 2.0, -12.7), Vector3(0.8, 2.2, 0.08), _red, false)
    _box("MarketBannerRight", Vector3(4.2, 2.0, -12.7), Vector3(0.8, 2.2, 0.08), _red, false)
    for position in [Vector3(-4, 2.5, 4), Vector3(4, 2.5, -5), Vector3(-3, 2.5, -11)]:
        _cylinder(position, 0.24, 0.55, _gold)
    for position in [Vector3(-13, 0, 5), Vector3(13, 0, 2), Vector3(-14, 0, -8)]:
        _tree(position)


func _build_mountain_pass() -> void:
    for index in 5:
        var z := -19.0 - index * 7.0
        _rock(Vector3(-7.5 - index, 0, z), 2.0 + index * 0.4)
        _rock(Vector3(7.0 + index * 0.8, 0, z - 2), 2.6 + index * 0.3)
    for position in [Vector3(-6, 0, -20), Vector3(7, 0, -25), Vector3(-8, 0, -35), Vector3(8, 0, -42)]:
        _tree(position)
    _marker(Vector3(0, 3.0, -28), "북쪽 고갯길")


func _build_camp() -> void:
    _box("CampPlatform", Vector3(0, 0.08, -53), Vector3(13, 0.16, 12), _stone, false)
    _box("Tent", Vector3(-4, 1.2, -55), Vector3(4, 2.4, 3), _roof, true)
    _box("LedgerChest", Vector3(3.6, 0.6, -55), Vector3(1.3, 1.2, 0.9), _wood, true)
    _marker(Vector3(0, 3.2, -59), "도적 소굴")
    _cylinder(Vector3(0, 0.45, -51), 0.65, 0.18, _gold, 0.35)
    _box("CampBanner", Vector3(0, 2.0, -58.5), Vector3(2.6, 1.5, 0.08), _red, false)


func _hanok(position: Vector3, size: Vector3, title: String) -> void:
    var root := Node3D.new()
    root.name = title
    root.position = position
    add_child(root)
    _box_child(root, "Walls", Vector3(0, size.y * 0.5, 0), size, _plaster, true)
    for x in [-size.x * 0.42, size.x * 0.42]:
        _box_child(root, "Pillar", Vector3(x, size.y * 0.5, size.z * 0.51), Vector3(0.24, size.y + 0.35, 0.24), _wood, false)
    _box_child(root, "RoofLeft", Vector3(-size.x * 0.2, size.y + 0.55, 0), Vector3(size.x * 0.62, 0.28, size.z + 1.2), _roof, false, Vector3(0, 0, -12))
    _box_child(root, "RoofRight", Vector3(size.x * 0.2, size.y + 0.55, 0), Vector3(size.x * 0.62, 0.28, size.z + 1.2), _roof, false, Vector3(0, 0, 12))


func _gate(position: Vector3) -> void:
    _box("GateLeft", position + Vector3(-2.1, 1.5, 0), Vector3(0.4, 3, 0.5), _wood, true)
    _box("GateRight", position + Vector3(2.1, 1.5, 0), Vector3(0.4, 3, 0.5), _wood, true)
    _box("GateRoof", position + Vector3(0, 3.2, 0), Vector3(5.2, 0.35, 1.2), _roof, false)


func _tree(position: Vector3) -> void:
    _cylinder(position + Vector3(0, 1.2, 0), 0.22, 2.4, _wood)
    _cylinder(position + Vector3(0, 3.1, 0), 1.5, 3.0, _pine, 0.0)


func _rock(position: Vector3, scale_value: float) -> void:
    _cylinder(position + Vector3(0, scale_value * 0.45, 0), scale_value, scale_value * 0.9, _stone, scale_value * 0.35)


func _marker(position: Vector3, text: String) -> void:
    var label := Label3D.new()
    label.position = position
    label.text = text
    label.font_size = 36
    label.outline_size = 8
    label.modulate = Color("f1e7d3")
    add_child(label)


func _box(name_value: String, position: Vector3, size: Vector3, material: StandardMaterial3D, collision: bool, rotation := Vector3.ZERO) -> void:
    var root := Node3D.new()
    root.name = name_value
    root.position = position
    root.rotation_degrees = rotation
    add_child(root)
    _box_child(root, "Mesh", Vector3.ZERO, size, material, collision)


func _box_child(parent: Node3D, name_value: String, position: Vector3, size: Vector3, material: StandardMaterial3D, collision: bool, rotation := Vector3.ZERO) -> void:
    var mesh_instance := MeshInstance3D.new()
    mesh_instance.name = name_value
    mesh_instance.position = position
    mesh_instance.rotation_degrees = rotation
    var mesh := BoxMesh.new()
    mesh.size = size
    mesh_instance.mesh = mesh
    mesh_instance.material_override = material
    parent.add_child(mesh_instance)
    if collision:
        mesh_instance.create_trimesh_collision()


func _cylinder(position: Vector3, radius: float, height: float, material: StandardMaterial3D, top_radius := -1.0) -> void:
    var mesh_instance := MeshInstance3D.new()
    mesh_instance.position = position
    var mesh := CylinderMesh.new()
    mesh.bottom_radius = radius
    mesh.top_radius = radius if top_radius < 0.0 else top_radius
    mesh.height = height
    mesh.radial_segments = 12
    mesh_instance.mesh = mesh
    mesh_instance.material_override = material
    add_child(mesh_instance)


static func _material(color: Color) -> StandardMaterial3D:
    var material := StandardMaterial3D.new()
    material.albedo_color = color
    material.roughness = 0.92
    return material
