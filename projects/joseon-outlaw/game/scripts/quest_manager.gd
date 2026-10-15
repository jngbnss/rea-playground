extends Node

signal state_changed(previous: String, current: String)
signal reward_changed(total: int)

const NOT_STARTED := "not_started"
const ACCEPTED := "accepted"
const ITEM_RECOVERED := "item_recovered"
const COMPLETED := "completed"

var state := NOT_STARTED
var reward_nyang := 0


func reset() -> void:
    var previous := state
    state = NOT_STARTED
    reward_nyang = 0
    state_changed.emit(previous, state)
    reward_changed.emit(reward_nyang)


func accept_quest() -> bool:
    return _transition(NOT_STARTED, ACCEPTED)


func recover_ledger() -> bool:
    return _transition(ACCEPTED, ITEM_RECOVERED)


func complete_quest() -> bool:
    if not _transition(ITEM_RECOVERED, COMPLETED):
        return false
    reward_nyang += 50
    reward_changed.emit(reward_nyang)
    return true


func objective() -> String:
    match state:
        NOT_STARTED:
            return "윤 행수와 이야기하시오"
        ACCEPTED:
            return "북쪽 산길에서 장부를 찾으시오"
        ITEM_RECOVERED:
            return "윤 행수에게 장부를 돌려주시오"
        COMPLETED:
            return "의뢰 완료 · 보상 50냥"
        _:
            return ""


func _transition(expected: String, next: String) -> bool:
    if state != expected:
        return false
    var previous := state
    state = next
    state_changed.emit(previous, state)
    return true
