extends Node

signal dialogue_ready(npc_id: String, quest_state: String, response: Dictionary)

const DEFAULT_URL := "http://127.0.0.1:8765/v1/dialogue"
const REQUEST_TIMEOUT := 2.0

var server_url := DEFAULT_URL
var _cache: Dictionary = {}
var _queue: Array[Dictionary] = []
var _queued_keys: Dictionary = {}
var _busy := false
var _active: Dictionary = {}
var _http: HTTPRequest


func _ready() -> void:
    _create_http()
    for argument in OS.get_cmdline_user_args():
        if argument.begins_with("--ai-url="):
            server_url = argument.trim_prefix("--ai-url=")
    set_process(true)


func _process(_delta: float) -> void:
    if _busy or _queue.is_empty():
        return
    _active = _queue.pop_front()
    var key := _key(_active.npc_id, _active.quest_state)
    _queued_keys.erase(key)
    _busy = true
    var body := {
        "schema_version": "1.0",
        "request_id": "godot_%d" % Time.get_ticks_usec(),
        "npc_id": _active.npc_id,
        "quest": {"id": "lost_ledger", "state": _active.quest_state},
        "history": [],
        "world": {"bandits_defeated": _defeated_bandits(), "player_location": "village"},
        "timeout_ms": 2000,
    }
    var error := _http.request(server_url, ["Content-Type: application/json"], HTTPClient.METHOD_POST, JSON.stringify(body))
    if error != OK:
        _busy = false
        _active = {}


func dialogue(npc_id: String, quest_state: String, fixed_line: Dictionary) -> Dictionary:
    var key := _key(npc_id, quest_state)
    if _cache.has(key):
        return _cache[key].duplicate()
    prefetch(npc_id, quest_state)
    var immediate := fixed_line.duplicate()
    immediate["source"] = "fallback"
    return immediate


func prefetch(npc_id: String, quest_state: String) -> void:
    var key := _key(npc_id, quest_state)
    if _cache.has(key) or _queued_keys.has(key) or (_busy and _key(_active.npc_id, _active.quest_state) == key):
        return
    _queue.append({"npc_id": npc_id, "quest_state": quest_state})
    _queued_keys[key] = true


func cached(npc_id: String, quest_state: String) -> Dictionary:
    return _cache.get(_key(npc_id, quest_state), {}).duplicate()


func clear_cache() -> void:
    _cache.clear()
    _queue.clear()
    _queued_keys.clear()
    if _http != null:
        if _http.request_completed.is_connected(_on_request_completed):
            _http.request_completed.disconnect(_on_request_completed)
        _http.cancel_request()
        _http.queue_free()
        _create_http()
    _busy = false
    _active = {}

func _create_http() -> void:
    _http = HTTPRequest.new()
    _http.timeout = REQUEST_TIMEOUT
    add_child(_http)
    _http.request_completed.connect(_on_request_completed)


func _on_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
    var completed := _active
    _active = {}
    _busy = false
    if result != HTTPRequest.RESULT_SUCCESS or response_code != 200 or completed.is_empty():
        return
    var parsed = JSON.parse_string(body.get_string_from_utf8())
    if not parsed is Dictionary or not _valid_response(parsed):
        return
    var key := _key(completed.npc_id, completed.quest_state)
    _cache[key] = parsed
    dialogue_ready.emit(completed.npc_id, completed.quest_state, parsed)


func _valid_response(response: Dictionary) -> bool:
    return response.get("text", "") is String and not response.get("text", "").is_empty() \
        and response.get("emotion", "") in ["neutral", "happy", "worried", "angry", "sad", "surprised", "grateful"] \
        and response.get("intent", "") in ["greet", "offer_quest", "give_hint", "remind_objective", "thank", "small_talk", "farewell"] \
        and response.get("source", "") in ["llm", "fallback"]


func _defeated_bandits() -> int:
    var count := 0
    for enemy in get_tree().get_nodes_in_group("enemies"):
        if enemy.state == BanditController.DEAD:
            count += 1
    return count


static func _key(npc_id: String, quest_state: String) -> String:
    return "%s:%s" % [npc_id, quest_state]
