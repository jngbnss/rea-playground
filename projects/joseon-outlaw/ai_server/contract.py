"""데이터 파일 로더와 JSON Schema 부분집합 검증기.

schemas/*.json 을 그대로 실행 가능한 규칙으로 쓰기 위해, 이 프로젝트 스키마가 쓰는 키워드만 구현한다:
type, enum, const, required, properties, additionalProperties(false), items,
minLength, maxLength, maxItems, minimum, maximum, pattern.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SCHEMA_DIR = PROJECT_ROOT / "schemas"
DATA_DIR = PROJECT_ROOT / "data"

_TYPES = {
    "object": dict,
    "array": list,
    "string": str,
    "boolean": bool,
}


@lru_cache(maxsize=None)
def load_json(relative: str) -> Any:
    with open(PROJECT_ROOT / relative, encoding="utf-8") as f:
        return json.load(f)


def request_schema() -> dict:
    return load_json("schemas/dialogue_request.schema.json")


def response_schema() -> dict:
    return load_json("schemas/dialogue_response.schema.json")


def validate(instance: Any, schema: dict, path: str = "$") -> list[str]:
    """스키마 위반 목록을 돌려준다. 빈 목록이면 통과."""
    errors: list[str] = []

    if "const" in schema and instance != schema["const"]:
        errors.append(f"{path}: {instance!r} != const {schema['const']!r}")
    if "enum" in schema and instance not in schema["enum"]:
        errors.append(f"{path}: {instance!r} not in {schema['enum']}")

    expected = schema.get("type")
    if expected == "integer":
        if not isinstance(instance, int) or isinstance(instance, bool):
            return errors + [f"{path}: expected integer"]
    elif expected:
        py_type = _TYPES[expected]
        if not isinstance(instance, py_type) or (expected != "boolean" and isinstance(instance, bool)):
            return errors + [f"{path}: expected {expected}"]

    if isinstance(instance, str):
        if len(instance) < schema.get("minLength", 0):
            errors.append(f"{path}: shorter than {schema['minLength']}")
        if "maxLength" in schema and len(instance) > schema["maxLength"]:
            errors.append(f"{path}: longer than {schema['maxLength']}")
        if "pattern" in schema and not re.search(schema["pattern"], instance):
            errors.append(f"{path}: does not match {schema['pattern']}")

    if isinstance(instance, int) and not isinstance(instance, bool):
        if "minimum" in schema and instance < schema["minimum"]:
            errors.append(f"{path}: below minimum {schema['minimum']}")
        if "maximum" in schema and instance > schema["maximum"]:
            errors.append(f"{path}: above maximum {schema['maximum']}")

    if isinstance(instance, list):
        if "maxItems" in schema and len(instance) > schema["maxItems"]:
            errors.append(f"{path}: more than {schema['maxItems']} items")
        if "items" in schema:
            for i, item in enumerate(instance):
                errors += validate(item, schema["items"], f"{path}[{i}]")

    if isinstance(instance, dict):
        props = schema.get("properties", {})
        for key in schema.get("required", []):
            if key not in instance:
                errors.append(f"{path}: missing '{key}'")
        if schema.get("additionalProperties") is False:
            for key in instance:
                if key not in props:
                    errors.append(f"{path}: unexpected '{key}'")
        for key, sub in props.items():
            if key in instance:
                errors += validate(instance[key], sub, f"{path}.{key}")

    return errors
