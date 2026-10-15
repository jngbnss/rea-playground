extends Node3D

const IMPLEMENTED_PHASE := 2

var _smoke_phase := 0
var _screenshot_path := ""


func _ready() -> void:
    print("JOSEON_OUTLAW_READY phase=%d" % IMPLEMENTED_PHASE)
    for argument in OS.get_cmdline_user_args():
        if argument.begins_with("--smoke-phase="):
            _smoke_phase = int(argument.get_slice("=", 1))
        elif argument.begins_with("--screenshot="):
            _screenshot_path = argument.trim_prefix("--screenshot=")
    if _smoke_phase > 0:
        call_deferred("_finish_smoke")


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

    if _smoke_phase >= 2:
        var player := get_node_or_null("Player") as CharacterBody3D
        if player == null or not player.has_method("set_test_input"):
            _fail_smoke("PlayerController is missing or invalid")
            return
        var start := player.global_position
        player.call("set_test_input", Vector2(0, -1), true)
        for frame in 45:
            await get_tree().physics_frame
        player.call("clear_test_input")
        var horizontal_distance := Vector2(start.x, start.z).distance_to(Vector2(player.global_position.x, player.global_position.z))
        var movement_state: String = player.get("movement_state")
        if horizontal_distance < 2.0 or movement_state != "run":
            _fail_smoke("Player did not run: distance=%.2f state=%s" % [horizontal_distance, movement_state])
            return
        player.call("set_test_input", Vector2.ZERO, false, true)
        for frame in 3:
            await get_tree().physics_frame
        if player.velocity.y <= 0.0:
            _fail_smoke("Player did not jump")
            return
        var measured_jump_velocity := player.velocity.y
        var spring_arm := player.get_node_or_null("CameraRig/Pitch/SpringArm3D") as SpringArm3D
        if spring_arm == null:
            _fail_smoke("SpringArm3D camera collision is missing")
            return
        player.global_position = Vector3(4, 0.05, 0)
        player.velocity = Vector3.ZERO
        for frame in 3:
            await get_tree().physics_frame
        var hit_length := spring_arm.get_hit_length()
        if hit_length >= spring_arm.spring_length - 0.1:
            _fail_smoke("Camera wall collision did not shorten the spring arm: %.2f" % hit_length)
            return
        player.global_position = Vector3(0, 0.05, 3)
        player.velocity = Vector3.ZERO
        print("CAMERA_SMOKE hit_length=%.2f spring_length=%.2f" % [hit_length, spring_arm.spring_length])
        print("PLAYER_SMOKE distance=%.2f jump_velocity=%.2f camera=%s" % [horizontal_distance, measured_jump_velocity, camera.get_path()])

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


func _fail_smoke(message: String) -> void:
    print("SMOKE_FAIL phase=%d reason=%s" % [_smoke_phase, message])
    push_error(message)
    get_tree().quit(1)
