class_name VillageNpc
extends Node3D

@export var npc_id := "merchant_yun"
@export var display_name := "윤 행수"
@export var accent_color := Color("a5402f")

@onready var name_label: Label3D = $NameLabel


func _ready() -> void:
    add_to_group("interactable")
    add_to_group("villagers")
    name_label.text = display_name
    $HumanRig.set_clothing_color(accent_color)


func prompt() -> String:
    return "E  %s와 대화" % display_name


func interact() -> Dictionary:
    if npc_id == "merchant_yun":
        match QuestManager.state:
            QuestManager.NOT_STARTED:
                QuestManager.accept_quest()
                return _dialogue("북쪽 고갯길 도적에게 장부를 빼앗겼소. 역참 수레를 몰아 되찾아 주겠소?")
            QuestManager.ACCEPTED:
                return _dialogue("장터 밖 수레로 금빛 관문 셋을 지나 도적 소굴로 가시오.")
            QuestManager.ITEM_RECOVERED:
                QuestManager.complete_quest()
                return _dialogue("장부를 찾았구려! 약속한 쉰 냥을 받으시오.")
            QuestManager.COMPLETED:
                return _dialogue("큰 은혜를 입었소. 쉰 냥을 잘 쓰시오.")
    match QuestManager.state:
        QuestManager.NOT_STARTED:
            return _dialogue("윤 행수가 근심이 깊어 보이더구나.")
        QuestManager.ACCEPTED:
            return _dialogue("수레를 몰 땐 금빛 관문 셋을 차례로 지나야 한단다.")
        QuestManager.ITEM_RECOVERED:
            return _dialogue("무사히 돌아왔구나. 윤 행수에게 가 보렴.")
        _:
            return _dialogue("오늘 밤은 주막에서 쉬어 가거라.")


func _dialogue(fixed_text: String) -> Dictionary:
    var response := AIClient.dialogue(npc_id, QuestManager.state, {"text": fixed_text})
    response["speaker"] = display_name
    return response
