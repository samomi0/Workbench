import io
import json
import zipfile
from pathlib import Path
from typing import List

import config
from services.storage import Storage

_res_store = Storage("resources.json")
_notes_store = Storage("notes.json")
_IMAGE_DIR: Path = config.DATA_DIR / "note_images"


def _load_resources() -> list:
    data = _res_store.read()
    return data if isinstance(data, list) else []


def _load_notes() -> list:
    data = _notes_store.read()
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


def archive_notes(note_ids: List[str]) -> bytes:
    """Return zip bytes containing selected archived notes with their images."""
    notes = _load_notes()
    matched = [n for n in notes if n["id"] in note_ids]

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for note in matched:
            nid = note["id"]
            safe_id = nid[:8]
            note_type = note.get("type", "note")

            # Serialize note metadata as JSON
            note_json = json.dumps(note, ensure_ascii=False, indent=2)
            zf.writestr(f"{safe_id}/note.json", note_json)

            # Include note text / todo / ticket content as readable file
            if note_type == "note" and note.get("text"):
                zf.writestr(f"{safe_id}/content.txt", note["text"])
            elif note_type == "todo":
                items = note.get("items", [])
                lines = [
                    f"{'[x]' if i.get('done') else '[ ]'} {i.get('text', '')}"
                    for i in items
                ]
                zf.writestr(f"{safe_id}/todos.txt", "\n".join(lines))
            elif note_type == "ticket":
                zf.writestr(f"{safe_id}/ticket.txt", note.get("content", ""))
                links = note.get("links", [])
                if links:
                    link_lines = [f"{l.get('label', '')}: {l.get('url', '')}" for l in links]
                    zf.writestr(f"{safe_id}/links.txt", "\n".join(link_lines))

            # Include images (both legacy image note and inline images in text notes)
            image_files = []
            if note_type == "image" and note.get("image_ext"):
                image_files.append(("image", note.get("image_ext", "png")))
            elif note_type == "note":
                for img in note.get("images", []):
                    image_files.append((img.get("img_id"), img.get("ext", "png")))

            for img_id, ext in image_files:
                img_path = _IMAGE_DIR / nid / f"{img_id}.{ext}"
                if img_path.exists():
                    zf.write(img_path, f"{safe_id}/images/{img_id}.{ext}")

        # Write manifest
        manifest = [
            {
                "id": n["id"],
                "type": n.get("type", "note"),
                "color": n.get("color"),
                "tag_ids": n.get("tag_ids", []),
            }
            for n in matched
        ]
        zf.writestr(
            "manifest.json",
            json.dumps(manifest, ensure_ascii=False, indent=2),
        )

    return buf.getvalue()
