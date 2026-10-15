extends Node3D

var _smoke_phase := 0
var _screenshot_path := ""


func _ready() -> void:
    print("JOSEON_OUTLAW_READY phase=1")
    for argument in OS.get_cmdline_user_args():
        if argument.begins_with("--smoke-phase="):
            _smoke_phase = int(argument.get_slice("=", 1))
        elif argument.begins_with("--screenshot="):
            _screenshot_path = argument.trim_prefix("--screenshot=")
    if _smoke_phase > 0:
        call_deferred("_finish_smoke")


func _finish_smoke() -> void:
    await get_tree().process_frame
    await get_tree().process_frame
    await get_tree().process_frame
    var camera := get_node_or_null("Camera3D") as Camera3D
    var ground := get_node_or_null("Ground") as MeshInstance3D
    if camera == null or not camera.current or ground == null:
        push_error("Phase 1 scene prerequisites are missing")
        get_tree().quit(1)
        return
    if not _screenshot_path.is_empty():
        var error := get_viewport().get_texture().get_image().save_png(_screenshot_path)
        if error != OK:
            push_error("Could not save smoke screenshot: %s" % error_string(error))
            get_tree().quit(1)
            return
        print("SCREENSHOT_OK path=%s" % _screenshot_path)
    print("SMOKE_OK phase=%d renderer=%s" % [_smoke_phase, RenderingServer.get_current_rendering_method()])
    get_tree().quit(0)
