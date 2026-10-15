class_name JoseonWorld
extends Node3D

var _wood := _pbr_material("weathered_brown_planks", Color("6f5b49"), 0.9)
var _wood_dark := _pbr_material("weathered_brown_planks", Color("332b25"), 1.15)
var _plaster := _pbr_material("plastered_wall_02", Color("817b70"), 0.8)
var _roof := _pbr_material("grey_roof_tiles", Color("697278"), 0.72)
var _path := _pbr_material("dirt_floor", Color("756b5f"), 0.32)
var _pine := _material(Color("334e32"))
var _pine_light := _material(Color("496540"))
var _stone := _material(Color("686b67"))
var _stone_light := _material(Color("8b887b"))
var _red := _material(Color("933b2f"))
var _gold := _material(Color("c99a43"))
var _straw := _material(Color("9d7b45"))
var _window := _emissive_material(Color("e6a25a"), 1.8)
var _fire := _emissive_material(Color("ff8a3d"), 3.2)


func _ready() -> void:
    _build_distant_mountains()
    _build_path()
    _build_village()
    _build_mountain_pass()
    _build_camp()


func _build_distant_mountains() -> void:
    for entry in [
        [Vector3(-24, 5, -44), Vector3(12, 15, 8), Color("263b3d")],
        [Vector3(24, 6, -52), Vector3(15, 18, 10), Color("30464a")],
        [Vector3(-22, 7, -76), Vector3(18, 22, 12), Color("40565b")],
        [Vector3(20, 8, -84), Vector3(20, 25, 14), Color("4b6167")],
    ]:
        _mountain(entry[0], entry[1], _material(entry[2]))


func _build_path() -> void:
    for index in 6:
        var z := 5.0 - index * 11.0
        _box("Path%02d" % index, Vector3(0, 0.025, z), Vector3(5.8, 0.05, 10.5), _path, false)
        for side in [-1.0, 1.0]:
            _rock(Vector3(side * (3.3 + fmod(index * 1.7, 1.2)), 0, z - 2.5), 0.24 + index * 0.025)
    for position in [Vector3(-3.3, 0, 0), Vector3(3.4, 0, -8), Vector3(-3.5, 0, -18), Vector3(3.6, 0, -30), Vector3(-3.4, 0, -41)]:
        _grass_cluster(position)


func _build_village() -> void:
    _hanok(Vector3(-8, 0, 1), Vector3(6, 3.2, 5), "윤 행수의 집")
    _hanok(Vector3(8, 0, -3), Vector3(7, 3.5, 5.5), "덕순 주막")
    _hanok(Vector3(-9, 0, -10), Vector3(5, 2.8, 4.5), "창고")
    _gate(Vector3(0, 0, -13))
    _box("MarketBannerLeft", Vector3(-4.2, 2.0, -12.7), Vector3(0.8, 2.2, 0.08), _red, false)
    _box("MarketBannerRight", Vector3(4.2, 2.0, -12.7), Vector3(0.8, 2.2, 0.08), _red, false)
    for position in [Vector3(-4, 2.5, 4), Vector3(4, 2.5, -5), Vector3(-3, 2.5, -11)]:
        _lantern(position)
    for position in [Vector3(-13, 0, 5), Vector3(13, 0, 2), Vector3(-14, 0, -8), Vector3(14, 0, -14)]:
        _tree(position)
    _stone_wall(Vector3(-13, 0, -1), 5, Vector3(0, 0, 1))
    _stone_wall(Vector3(13, 0, -8), 5, Vector3(0, 0, 1))
    for position in [Vector3(10.5, 0, 0), Vector3(11.6, 0, 0.2), Vector3(10.9, 0, 1.1)]:
        _jar(position)


func _build_mountain_pass() -> void:
    for index in 5:
        var z := -19.0 - index * 7.0
        _rock(Vector3(-7.5 - index, 0, z), 2.0 + index * 0.4)
        _rock(Vector3(7.0 + index * 0.8, 0, z - 2), 2.6 + index * 0.3)
    for position in [Vector3(-6, 0, -20), Vector3(7, 0, -25), Vector3(-8, 0, -35), Vector3(8, 0, -42)]:
        _tree(position)
    for position in [Vector3(-4, 0, -24), Vector3(4, 0, -29), Vector3(-4.5, 0, -36), Vector3(4.2, 0, -43)]:
        _grass_cluster(position)
    _marker(Vector3(0, 3.2, -28), "북쪽 고갯길")


func _build_camp() -> void:
    _box("CampPlatform", Vector3(0, 0.08, -53), Vector3(13, 0.16, 12), _stone, false)
    _tent(Vector3(-4, 0, -55))
    _marker(Vector3(0, 3.5, -59), "도적 소굴")
    _campfire(Vector3(0, 0, -51))
    _box("CampBanner", Vector3(0, 2.0, -58.5), Vector3(2.6, 1.5, 0.08), _red, false)
    for position in [Vector3(-5.5, 0, -49), Vector3(5.2, 0, -55), Vector3(4.8, 0, -49)]:
        _rock(position, 0.55)


func _hanok(position: Vector3, size: Vector3, title: String) -> void:
    var root := Node3D.new()
    root.name = title
    root.position = position
    add_child(root)
    _box_child(root, "Foundation", Vector3(0, 0.18, 0), Vector3(size.x + 0.8, 0.36, size.z + 0.7), _stone_light, true)
    _box_child(root, "Walls", Vector3(0, size.y * 0.5 + 0.35, 0), size, _plaster, true)
    for x in [-size.x * 0.43, 0.0, size.x * 0.43]:
        _box_child(root, "Pillar", Vector3(x, size.y * 0.5 + 0.35, size.z * 0.51), Vector3(0.25, size.y + 0.5, 0.25), _wood, false)
    _box_child(root, "Door", Vector3(0, 1.45, size.z * 0.515), Vector3(1.35, 2.5, 0.12), _wood_dark, false)
    for x in [-size.x * 0.27, size.x * 0.27]:
        _window_lattice(root, Vector3(x, 1.55, size.z * 0.522), Vector2(1.25, 1.45))
    _box_child(root, "RoofLeft", Vector3(-size.x * 0.21, size.y + 0.82, 0), Vector3(size.x * 0.64, 0.3, size.z + 1.5), _roof, false, Vector3(0, 0, -14))
    _box_child(root, "RoofRight", Vector3(size.x * 0.21, size.y + 0.82, 0), Vector3(size.x * 0.64, 0.3, size.z + 1.5), _roof, false, Vector3(0, 0, 14))
    _box_child(root, "RoofRidge", Vector3(0, size.y + 1.25, 0), Vector3(0.3, 0.34, size.z + 1.8), _roof, false)
    for z in [-size.z * 0.57, size.z * 0.57]:
        _box_child(root, "Eave", Vector3(0, size.y + 0.66, z), Vector3(size.x + 1.5, 0.18, 0.22), _wood_dark, false)


func _window_lattice(parent: Node3D, position: Vector3, size: Vector2) -> void:
    _box_child(parent, "WindowGlow", position, Vector3(size.x, size.y, 0.08), _window, false)
    for index in 4:
        var x := -size.x * 0.38 + index * size.x * 0.255
        _box_child(parent, "WindowBar", position + Vector3(x, 0, 0.055), Vector3(0.055, size.y, 0.04), _wood, false)
    for index in 3:
        var y := -size.y * 0.32 + index * size.y * 0.32
        _box_child(parent, "WindowBar", position + Vector3(0, y, 0.055), Vector3(size.x, 0.055, 0.04), _wood, false)


func _gate(position: Vector3) -> void:
    _box("GateLeft", position + Vector3(-2.1, 1.5, 0), Vector3(0.45, 3, 0.55), _wood, true)
    _box("GateRight", position + Vector3(2.1, 1.5, 0), Vector3(0.45, 3, 0.55), _wood, true)
    _box("GateBeam", position + Vector3(0, 2.7, 0), Vector3(5.2, 0.35, 0.65), _wood, false)
    _box("GateRoofLeft", position + Vector3(-1.0, 3.35, 0), Vector3(3.2, 0.28, 1.6), _roof, false, Vector3(0, 0, -10))
    _box("GateRoofRight", position + Vector3(1.0, 3.35, 0), Vector3(3.2, 0.28, 1.6), _roof, false, Vector3(0, 0, 10))


func _tree(position: Vector3) -> void:
    _cylinder(position + Vector3(0, 2.1, 0), 0.24, 4.2, _wood)
    for crown in [
        [Vector3(-0.35, 2.8, 0.12), Vector3(1.55, 0.62, 1.15), _pine],
        [Vector3(0.45, 3.2, -0.18), Vector3(1.35, 0.7, 1.25), _pine_light],
        [Vector3(-0.18, 3.75, 0.0), Vector3(1.25, 0.66, 1.0), _pine],
        [Vector3(0.22, 4.25, 0.1), Vector3(0.95, 0.58, 0.82), _pine_light],
        [Vector3(-0.08, 4.72, -0.05), Vector3(0.68, 0.52, 0.62), _pine],
    ]:
        _sphere(position + crown[0], crown[1], crown[2])


func _grass_cluster(position: Vector3) -> void:
    for index in 5:
        var offset := Vector3((index % 3 - 1) * 0.18, 0.35, (index / 3.0 - 0.5) * 0.2)
        _cylinder(position + offset, 0.05, 0.7 + index * 0.05, _pine_light, 0.0)


func _rock(position: Vector3, scale_value: float) -> void:
    _cylinder(position + Vector3(0, scale_value * 0.45, 0), scale_value, scale_value * 0.9, _stone, scale_value * 0.35, 7)


func _stone_wall(position: Vector3, count: int, direction: Vector3) -> void:
    for index in count:
        var jitter := 0.08 if index % 2 == 0 else -0.06
        _box("StoneWall", position + direction * index * 1.05 + Vector3(jitter, 0.42, 0), Vector3(1.0, 0.75, 0.8), _stone_light if index % 2 == 0 else _stone, false, Vector3(0, index * 7, 0))


func _jar(position: Vector3) -> void:
    _cylinder(position + Vector3(0, 0.4, 0), 0.42, 0.8, _wood_dark, 0.3, 16)
    _cylinder(position + Vector3(0, 0.82, 0), 0.3, 0.08, _gold, 0.3, 16)


func _lantern(position: Vector3) -> void:
    _cylinder(position, 0.25, 0.55, _window, 0.22, 12)
    var light := OmniLight3D.new()
    light.position = position
    light.light_color = Color("e6a25a")
    light.light_energy = 1.6
    light.omni_range = 5.0
    light.shadow_enabled = true
    add_child(light)


func _tent(position: Vector3) -> void:
    _box("TentLeft", position + Vector3(-1.0, 1.15, 0), Vector3(2.8, 0.16, 3.5), _straw, true, Vector3(0, 0, 52))
    _box("TentRight", position + Vector3(1.0, 1.15, 0), Vector3(2.8, 0.16, 3.5), _straw, true, Vector3(0, 0, -52))


func _campfire(position: Vector3) -> void:
    for rotation in [0.0, 60.0, -60.0]:
        _box("FireLog", position + Vector3(0, 0.22, 0), Vector3(1.3, 0.18, 0.18), _wood_dark, false, Vector3(0, rotation, 0))
    _cylinder(position + Vector3(0, 0.65, 0), 0.48, 1.1, _fire, 0.0, 10)
    var light := OmniLight3D.new()
    light.position = position + Vector3(0, 1.1, 0)
    light.light_color = Color("ff8a3d")
    light.light_energy = 3.5
    light.omni_range = 9.0
    light.shadow_enabled = true
    add_child(light)


func _mountain(position: Vector3, size: Vector3, material: StandardMaterial3D) -> void:
    var mesh_instance := MeshInstance3D.new()
    mesh_instance.position = position - Vector3(0, size.y * 0.08, 0)
    mesh_instance.scale = Vector3(size.x, size.y * 0.58, size.z)
    var mesh := SphereMesh.new()
    mesh.radius = 1.0
    mesh.height = 2.0
    mesh.radial_segments = 18
    mesh.rings = 8
    mesh_instance.mesh = mesh
    mesh_instance.material_override = material
    mesh_instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
    add_child(mesh_instance)


func _marker(position: Vector3, text: String) -> void:
    var label := Label3D.new()
    label.position = position
    label.text = text
    label.font_size = 42
    label.outline_size = 10
    label.modulate = Color("f1e7d3")
    label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
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


func _cylinder(position: Vector3, radius: float, height: float, material: StandardMaterial3D, top_radius := -1.0, segments := 12) -> void:
    var mesh_instance := MeshInstance3D.new()
    mesh_instance.position = position
    var mesh := CylinderMesh.new()
    mesh.bottom_radius = radius
    mesh.top_radius = radius if top_radius < 0.0 else top_radius
    mesh.height = height
    mesh.radial_segments = segments
    mesh_instance.mesh = mesh
    mesh_instance.material_override = material
    add_child(mesh_instance)


func _sphere(position: Vector3, scale_value: Vector3, material: StandardMaterial3D) -> void:
    var mesh_instance := MeshInstance3D.new()
    mesh_instance.position = position
    mesh_instance.scale = scale_value
    var mesh := SphereMesh.new()
    mesh.radius = 1.0
    mesh.height = 2.0
    mesh.radial_segments = 12
    mesh.rings = 6
    mesh_instance.mesh = mesh
    mesh_instance.material_override = material
    add_child(mesh_instance)


static func _pbr_material(asset_id: String, tint: Color, tiling: float) -> StandardMaterial3D:
    var base_path := "res://assets/polyhaven/%s/%s" % [asset_id, asset_id]
    var material := StandardMaterial3D.new()
    material.albedo_color = tint
    material.albedo_texture = load(base_path + "_diff_1k.jpg")
    material.normal_enabled = true
    material.normal_scale = 0.72
    material.normal_texture = load(base_path + "_nor_gl_1k.jpg")
    material.roughness = 1.0
    material.roughness_texture = load(base_path + "_rough_1k.jpg")
    material.uv1_scale = Vector3.ONE * tiling
    material.uv1_triplanar = true
    return material


static func _material(color: Color, metallic := 0.0) -> StandardMaterial3D:
    var material := StandardMaterial3D.new()
    material.albedo_color = color
    material.metallic = metallic
    material.roughness = 0.88
    return material


static func _emissive_material(color: Color, energy: float) -> StandardMaterial3D:
    var material := _material(color)
    material.emission_enabled = true
    material.emission = color
    material.emission_energy_multiplier = energy
    return material
