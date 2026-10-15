extends Node

var active_attacker: Node
var max_concurrent_attackers := 0


func reset() -> void:
    active_attacker = null
    max_concurrent_attackers = 0


func request_attack(enemy: Node) -> bool:
    if active_attacker != null and is_instance_valid(active_attacker) and active_attacker != enemy:
        return false
    active_attacker = enemy
    max_concurrent_attackers = maxi(max_concurrent_attackers, 1)
    return true


func release_attack(enemy: Node) -> void:
    if active_attacker == enemy:
        active_attacker = null


func owns_attack(enemy: Node) -> bool:
    return active_attacker == enemy
