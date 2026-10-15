extends Node

var _report_elapsed := 0.0


func _process(delta: float) -> void:
    _report_elapsed += delta
    if _report_elapsed >= 60.0:
        _report_elapsed = 0.0
        var values := snapshot()
        print("METRICS fps=%.1f memory_mib=%.1f" % [values.fps, values.memory_mib])


func snapshot() -> Dictionary:
    return {
        "fps": Performance.get_monitor(Performance.TIME_FPS),
        "memory_mib": OS.get_static_memory_usage() / 1048576.0,
        "objects": Performance.get_monitor(Performance.OBJECT_COUNT),
    }
