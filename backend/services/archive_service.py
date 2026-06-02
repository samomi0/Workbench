import io
import json
import zipfile
from typing import List

from services.storage import Storage

_res_store = Storage("resources.json")


def _load_resources() -> list:
    data = _res_store.read()
    return data if isinstance(data, list) else []


def archive_by_tags(tag_ids: List[str]) -> bytes:
    """Return zip bytes for all resources carrying any of the given tag IDs."""
    resources = _load_resources()
    matched = [
        r for r in resources
        if any(tid in r.get("tag_ids", []) for tid in tag_ids)
    ]

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for res in matched:
            safe_title = "".join(
                c if c.isalnum() or c in " ._-" else "_"
                for c in res.get("title", "untitled")
            )
            filename = f"{res['id'][:8]}_{safe_title}.txt"
            zf.writestr(filename, res.get("content", ""))

        zf.writestr(
            "manifest.json",
            json.dumps(matched, ensure_ascii=False, indent=2),
        )

    return buf.getvalue()
