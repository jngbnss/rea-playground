class_name QuestObject
extends Node3D

@export_enum("ledger_chest", "village_shortcut") var object_kind := "ledger_chest"
@export var display_name := "장부 궤짝"
@export var village_destination := Vector3(0, 0.05, 5)

@onready var label: Label3D = $Label
@onready var body: MeshInstance3D = $Body


func _ready() -> void:
    add_to_group("interactable")
    label.text = display_name
    if object_kind == "village_shortcut":
        body.scale = Vector3(0.45, 2.4, 3.2)


func prompt() -> String:
    if object_kind == "ledger_chest":
        if QuestManager.state == QuestManager.ITEM_RECOVERED or QuestManager.state == QuestManager.COMPLETED:
            return "장부를 회수했다"
        if not _courier_route_completed():
            return "역참 수레 운송을 먼저 마쳐야 한다"
        if _bandits_defeated() and QuestManager.state == QuestManager.ACCEPTED:
            return "E  장부 궤짝 조사"
        return "도적을 먼저 제압해야 한다"
    if QuestManager.state == QuestManager.ITEM_RECOVERED:
        return "E  마을 지름길 이용"
    return "마을로 통하는 샛길"


func interact() -> Dictionary:
    if object_kind == "ledger_chest":
        if not _courier_route_completed():
            return {"speaker": display_name, "text": "역참 수레로 금빛 관문 셋을 먼저 통과해야 한다."}
        if _bandits_defeated() and QuestManager.recover_ledger():
            return {"speaker": display_name, "text": "빼앗긴 장부를 되찾았다. 윤 행수에게 돌려주자."}
        return {"speaker": display_name, "text": "굳게 잠겨 있다. 주변 도적을 먼저 제압해야 한다."}
    if QuestManager.state == QuestManager.ITEM_RECOVERED:
        var player := get_tree().get_first_node_in_group("player") as PlayerController
        if player != null:
            player.restore_at(village_destination)
        return {"speaker": display_name, "text": "산길 샛길을 따라 마을로 돌아왔다."}
    return {"speaker": display_name, "text": "아직 이 길을 이용할 수 없다."}


func _courier_route_completed() -> bool:
    var cart := get_tree().get_first_node_in_group("courier_cart") as CourierCart
    return cart != null and cart.route_complete


func _bandits_defeated() -> bool:
    var enemies := get_tree().get_nodes_in_group("enemies")
    if enemies.is_empty():
        return false
    for enemy in enemies:
        if enemy.state != BanditController.DEAD:
            return false
    return true
