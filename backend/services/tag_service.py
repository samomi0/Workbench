import uuid
from typing import List, Optional

from services.storage import Storage

_store = Storage("tags.json")


def _load() -> List[dict]:
    data = _store.read()
    return data if isinstance(data, list) else []


def list_tags() -> List[dict]:
    return _load()


def create_tag(name: str, color: str = "#2563eb") -> dict:
    tags = _load()
    tag = {"id": str(uuid.uuid4()), "name": name, "color": color}
    tags.append(tag)
    _store.write(tags)
    return tag


def delete_tag(tag_id: str) -> bool:
    tags = _load()
    filtered = [t for t in tags if t["id"] != tag_id]
    if len(filtered) == len(tags):
        return False
    _store.write(filtered)
    return True


def get_tag(tag_id: str) -> Optional[dict]:
    return next((t for t in _load() if t["id"] == tag_id), None)
