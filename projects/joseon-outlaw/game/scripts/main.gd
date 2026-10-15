extends Node3D

const IMPLEMENTED_PHASE := 3
const INTERACTION_RANGE := 3.0

@onready var player: CharacterBody3D = $Player
@onready var objective_label: Label = $UI/ObjectivePanel/Margin/Objective
@onready var prompt_label: Label = $UI/Prompt
@onready var dialogue_panel: PanelContainer = $UI/Dialogue
@onready var dialogue_text: Label = $UI/Dialogue/Margin/Text

var _smoke_phase := 0
var _screenshot_path := ""
var _nearby_npc: Node3D


func _ready() -> void:
    QuestManager.reset()
    QuestManager.state_changed.connect(_on_quest_state_changed)
    _update_objective()
    print("JOSEON_OUTLAW_READY phase=%d" % IMPLEMENTED_PHASE)
    for argument in OS.get_cmdline_user_args():
        if argument.begins_with("--smoke-phase="):
            _smoke_phase = int(argument.get_slice("=", 1))
        elif argument.begins_with("--screenshot="):
            _screenshot_path = argument.trim_prefix("--screenshot=")
    if _smoke_phase > 0:
        call_deferred("_finish_smoke")


func _process(_delta: float) -> void:
    if _smoke_phase > 0:
        return
    _nearby_npc = _find_nearest_npc()
    prompt_label.text = _nearby_npc.call("prompt") if _nearby_npc != null else ""
    if Input.is_action_just_pressed("interact"):
        if dialogue_panel.visible:
            dialogue_panel.hide()
        elif _nearby_npc != null:
            _show_dialogue(_nearby_npc.call("interact"))


func _find_nearest_npc() -> Node3D:
    var nearest: Node3D
    var nearest_distance := INTERACTION_RANGE
    for candidate in get_tree().get_nodes_in_group("interactable"):
        var npc := candidate as Node3D
        if npc == null:
            continue
        var distance := player.global_position.distance_to(npc.global_position)
        if distance < nearest_distance:
            nearest = npc
            nearest_distance = distance
    return nearest


func _show_dialogue(line: Dictionary) -> void:
    dialogue_text.text = "%s\n%s" % [line.get("speaker", ""), line.get("text", "")]
    dialogue_panel.show()
    _update_objective()


func _on_quest_state_changed(_previous: String, _current: String) -> void:
    _update_objective()


func _update_objective() -> void:
    objective_label.text = "의뢰 · %s" % QuestManager.objective()


func _finish_smoke() -> void:
    if _smoke_phase > IMPLEMENTED_PHASE:
        _fail_smoke("Requested phase is not implemented")
        return
    await get_tree().physics_frame
    await get_tree().physics_frame
    var camera := get_viewport().get_camera_3d()
    var ground := get_node_or_null("Ground") as StaticBody3D
    if camera == null or not camera.current or ground == null:
        _fail_smoke("Base scene prerequisites are missing")
        return
    if _smoke_phase >= 2 and not await _smoke_player(camera):
        return
    if _smoke_phase >= 3 and not _smoke_quest():
        return
    if not _screenshot_path.is_empty():
        await get_tree().process_frame
        await get_tree().process_frame
        var error := get_viewport().get_texture().get_image().save_png(_screenshot_path)
        if error != OK:
            _fail_smoke("Could not save screenshot: %s" % error_string(error))
            return
        print("SCREENSHOT_OK path=%s" % _screenshot_path)
    print("SMOKE_OK phase=%d renderer=%s" % [_smoke_phase, RenderingServer.get_current_rendering_method()])
    get_tree().quit(0)


func _smoke_player(camera: Camera3D) -> bool:
    if player == null or not player.has_method("set_test_input"):
        _fail_smoke("PlayerController is missing or invalid")
        return false
    var start := player.global_position
    player.call("set_test_input", Vector2(0, -1), true)
    for frame in 45:
        await get_tree().physics_frame
    player.call("clear_test_input")
    var horizontal_distance := Vector2(start.x, start.z).distance_to(Vector2(player.global_position.x, player.global_position.z))
    var movement_state: String = player.get("movement_state")
    if horizontal_distance < 2.0 or movement_state != "run":
        _fail_smoke("Player did not run: distance=%.2f state=%s" % [horizontal_distance, movement_state])
        return false
    player.call("set_test_input", Vector2.ZERO, false, true)
    for frame in 3:
        await get_tree().physics_frame
    if player.velocity.y <= 0.0:
        _fail_smoke("Player did not jump")
        return false
    var measured_jump_velocity := player.velocity.y
    var spring_arm := player.get_node_or_null("CameraRig/Pitch/SpringArm3D") as SpringArm3D
    if spring_arm == null:
        _fail_smoke("SpringArm3D camera collision is missing")
        return false
    player.global_position = Vector3(4, 0.05, 0)
    player.velocity = Vector3.ZERO
    for frame in 3:
        await get_tree().physics_frame
    var hit_length := spring_arm.get_hit_length()
    if hit_length >= spring_arm.spring_length - 0.1:
        _fail_smoke("Camera wall collision did not shorten the spring arm: %.2f" % hit_length)
        return false
    player.global_position = Vector3(0, 0.05, 7)
    player.velocity = Vector3.ZERO
    print("CAMERA_SMOKE hit_length=%.2f spring_length=%.2f" % [hit_length, spring_arm.spring_length])
    print("PLAYER_SMOKE distance=%.2f jump_velocity=%.2f camera=%s" % [horizontal_distance, measured_jump_velocity, camera.get_path()])
    return true


func _smoke_quest() -> bool:
    var merchant := get_node_or_null("World/MerchantYun")
    var innkeeper := get_node_or_null("World/InnkeeperDeoksun")
    if merchant == null or innkeeper == null or get_tree().get_nodes_in_group("interactable").size() != 2:
        _fail_smoke("Village NPCs are missing")
        return false
    if get_node_or_null("World/Path00") == null or get_node_or_null("World/CampPlatform") == null:
        _fail_smoke("Open-zone landmarks are missing")
        return false
    QuestManager.reset()
    var first_line: Dictionary = merchant.call("interact")
    _show_dialogue(first_line)
    if QuestManager.state != QuestManager.ACCEPTED or "북쪽" not in QuestManager.objective():
        _fail_smoke("Merchant interaction did not accept the quest")
        return false
    if QuestManager.complete_quest():
        _fail_smoke("Quest allowed an invalid transition")
        return false
    if not QuestManager.recover_ledger() or not QuestManager.complete_quest() or QuestManager.reward_nyang != 50:
        _fail_smoke("Quest state sequence failed")
        return false
    QuestManager.reset()
    first_line = merchant.call("interact")
    _show_dialogue(first_line)
    print("QUEST_SMOKE npcs=2 state=%s objective=%s invalid_transition=blocked" % [QuestManager.state, QuestManager.objective()])
    return true


func _fail_smoke(message: String) -> void:
    print("SMOKE_FAIL phase=%d reason=%s" % [_smoke_phase, message])
    push_error(message)
    get_tree().quit(1)
