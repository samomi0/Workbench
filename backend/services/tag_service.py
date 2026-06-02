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

    # Strip this tag from all notes that reference it
    _notes_store = Storage("notes.json")
    notes = _notes_store.read()
    if isinstance(notes, list):
        changed = False
        for note in notes:
            ids = note.get("tag_ids", [])
            if tag_id in ids:
                note["tag_ids"] = [tid for tid in ids if tid != tag_id]
                changed = True
        if changed:
            _notes_store.write(notes)

    return True


def get_tag(tag_id: str) -> Optional[dict]:
    return next((t for t in _load() if t["id"] == tag_id), None)


def update_tag(tag_id: str, name: str = None, color: str = None) -> Optional[dict]:
    tags = _load()
    tag = next((t for t in tags if t["id"] == tag_id), None)
    if tag is None:
        return None
    if name is not None:
        tag["name"] = name
    if color is not None:
        tag["color"] = color
    _store.write(tags)
    return tag
