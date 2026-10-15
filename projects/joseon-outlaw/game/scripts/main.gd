extends Node3D

const IMPLEMENTED_PHASE := 6
const INTERACTION_RANGE := 3.0

@onready var player: PlayerController = $Player
@onready var objective_label: Label = $UI/ObjectivePanel/Margin/Objective
@onready var prompt_label: Label = $UI/Prompt
@onready var dialogue_panel: PanelContainer = $UI/Dialogue
@onready var dialogue_text: Label = $UI/Dialogue/Margin/Text
@onready var health_label: Label = $UI/HealthPanel/Margin/Health
@onready var end_panel: PanelContainer = $UI/EndPanel

var _smoke_phase := 0
var _screenshot_path := ""
var _require_ai := false
var _nearby_npc: Node3D
var _checkpoint := Vector3(0, 0.05, 5)


func _ready() -> void:
    QuestManager.reset()
    QuestManager.state_changed.connect(_on_quest_state_changed)
    _update_objective()
    player.health_changed.connect(_on_player_health_changed)
    _on_player_health_changed(player.health, player.max_health)
    player.died.connect(_on_player_died)
    AIClient.prefetch("merchant_yun", QuestManager.state)
    AIClient.prefetch("innkeeper_deoksun", QuestManager.state)
    print("JOSEON_OUTLAW_READY phase=%d" % IMPLEMENTED_PHASE)
    for argument in OS.get_cmdline_user_args():
        if argument.begins_with("--smoke-phase="):
            _smoke_phase = int(argument.get_slice("=", 1))
        elif argument.begins_with("--screenshot="):
            _screenshot_path = argument.trim_prefix("--screenshot=")
        elif argument == "--require-ai":
            _require_ai = true
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


func _on_quest_state_changed(_previous: String, current: String) -> void:
    _update_objective()
    end_panel.visible = current == QuestManager.COMPLETED
    AIClient.prefetch("merchant_yun", current)
    AIClient.prefetch("innkeeper_deoksun", current)


func _update_objective() -> void:
    objective_label.text = "의뢰 · %s" % QuestManager.objective()

func _on_player_health_changed(current: int, maximum: int) -> void:
    health_label.text = "체력 %d / %d" % [current, maximum]

func _on_player_died() -> void:
    health_label.text = "쓰러짐 · 체크포인트로 귀환"
    await get_tree().create_timer(0.4).timeout
    player.restore_at(_checkpoint)




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
    if _smoke_phase >= 4 and not await _smoke_combat():
        return
    if _smoke_phase >= 5 and not await _smoke_complete_run():
        return
    if _smoke_phase >= 6 and not await _smoke_ai_dialogue():
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
    if merchant == null or innkeeper == null or get_tree().get_nodes_in_group("villagers").size() != 2:
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

func _smoke_combat() -> bool:
    var bandit_a := get_node_or_null("World/BanditA") as BanditController
    var bandit_b := get_node_or_null("World/BanditB") as BanditController
    if bandit_a == null or bandit_b == null or get_tree().get_nodes_in_group("enemies").size() != 2:
        _fail_smoke("Combatants are missing")
        return false
    CombatCoordinator.reset()
    player.restore_at(Vector3(0, 0.05, -43))
    bandit_a.reset_combat(Vector3(-0.8, 0.05, -44.7))
    bandit_b.reset_combat(Vector3(0.8, 0.05, -44.7))
    bandit_a.set_combat_target(player)
    bandit_b.set_combat_target(player)
    for frame in 8:
        await get_tree().physics_frame
    var attacking := 0
    for enemy in [bandit_a, bandit_b]:
        if enemy.state == BanditController.ATTACK:
            attacking += 1
    if attacking != 1 or CombatCoordinator.max_concurrent_attackers != 1 or player.health >= player.max_health:
        _fail_smoke("Attack token or enemy damage failed: attacking=%d health=%d" % [attacking, player.health])
        return false

    CombatCoordinator.reset()
    player.restore_at(Vector3(0, 0.05, -43))
    bandit_a.reset_combat(Vector3(0, 0.05, -45))
    bandit_b.reset_combat(Vector3(5, 0.05, -47))
    bandit_a.set_combat_target(player)
    bandit_b.set_combat_target(player)
    var total_hits := 0
    for strike in 3:
        total_hits += player.attack()
        for frame in 24:
            await get_tree().physics_frame
    if total_hits != 3 or bandit_a.state != BanditController.DEAD or bandit_a.health != 0:
        _fail_smoke("Sword damage sequence failed: hits=%d health=%d state=%s" % [total_hits, bandit_a.health, bandit_a.state])
        return false
    print("COMBAT_SMOKE hits=%d enemy_health=%d state=%s token_max=%d player_health=%d" % [total_hits, bandit_a.health, bandit_a.state, CombatCoordinator.max_concurrent_attackers, player.health])
    return true

func _smoke_complete_run() -> bool:
    var merchant := get_node_or_null("World/MerchantYun")
    var chest := get_node_or_null("World/LedgerChest")
    var shortcut := get_node_or_null("World/VillageShortcut")
    var bandit_a := get_node_or_null("World/BanditA") as BanditController
    var bandit_b := get_node_or_null("World/BanditB") as BanditController
    if merchant == null or chest == null or shortcut == null or bandit_a == null or bandit_b == null:
        _fail_smoke("Complete-run objects are missing")
        return false

    player.restore_at(Vector3(0, 0.05, -20))
    player.receive_damage(player.max_health)
    for frame in 30:
        await get_tree().physics_frame
    if player.is_dead or player.health != player.max_health or player.global_position.distance_to(_checkpoint) > 0.2:
        _fail_smoke("Checkpoint respawn failed")
        return false

    QuestManager.reset()
    merchant.call("interact")
    bandit_a.reset_combat(Vector3(-2, 0.05, -46))
    bandit_b.reset_combat(Vector3(3, 0.05, -50))
    bandit_a.take_damage(bandit_a.max_health, player)
    bandit_b.take_damage(bandit_b.max_health, player)
    var chest_line: Dictionary = chest.call("interact")
    _show_dialogue(chest_line)
    if QuestManager.state != QuestManager.ITEM_RECOVERED:
        _fail_smoke("Ledger could not be recovered after defeating bandits")
        return false
    player.global_position = shortcut.global_position
    var shortcut_line: Dictionary = shortcut.call("interact")
    _show_dialogue(shortcut_line)
    if player.global_position.distance_to(_checkpoint) > 0.2:
        _fail_smoke("Village shortcut did not return the player")
        return false
    var completion_line: Dictionary = merchant.call("interact")
    _show_dialogue(completion_line)
    if QuestManager.state != QuestManager.COMPLETED or QuestManager.reward_nyang != 50 or not end_panel.visible:
        _fail_smoke("Quest completion or reward failed")
        return false
    print("COMPLETE_RUN_SMOKE state=%s reward=%d respawn=ok shortcut=ok ai_server=not_required" % [QuestManager.state, QuestManager.reward_nyang])
    return true

func _smoke_ai_dialogue() -> bool:
    AIClient.clear_cache()
    var immediate := AIClient.dialogue("merchant_yun", QuestManager.state, {
        "speaker": "윤 행수",
        "text": "큰 은혜를 입었소. 쉰 냥을 잘 쓰시오.",
    })
    if immediate.get("source") != "fallback":
        _fail_smoke("AI client did not provide an immediate fallback")
        return false
    var response: Dictionary = {}
    for frame in 150:
        await get_tree().process_frame
        response = AIClient.cached("merchant_yun", QuestManager.state)
        if not response.is_empty():
            break
    if _require_ai and response.is_empty():
        _fail_smoke("Live AI server response was required but not received")
        return false
    var source := "fallback"
    if not response.is_empty():
        source = response.get("source", "fallback")
        response["speaker"] = "윤 행수 · AI"
        _show_dialogue(response)
    print("AI_DIALOGUE_SMOKE immediate=fallback server_response=%s timeout_s=2.0 cache=%s" % [source, "hit" if not response.is_empty() else "miss"])
    return true


func _fail_smoke(message: String) -> void:
    print("SMOKE_FAIL phase=%d reason=%s" % [_smoke_phase, message])
    push_error(message)
    get_tree().quit(1)
