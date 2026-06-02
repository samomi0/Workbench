import shutil
import uuid
from pathlib import Path
from typing import Any, List, Optional

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel

import config
from services.storage import Storage

router = APIRouter(prefix="/api/notes", tags=["notes"])
_store = Storage("notes.json")

_IMAGE_DIR: Path = config.DATA_DIR / "note_images"
_ALLOWED_CT = {"image/png", "image/jpeg", "image/gif", "image/webp"}
_EXT_MAP = {
    "image/png":  "png",
    "image/jpeg": "jpg",
    "image/gif":  "gif",
    "image/webp": "webp",
}


def _load() -> list:
    data = _store.read()
    return data if isinstance(data, list) else []


# ── Pydantic models ───────────────────────────────────────────────────────────

class NoteCreate(BaseModel):
    type: str = "note"
    x: int = 100
    y: int = 100
    w: Optional[int] = None
    h: Optional[int] = None
    color: str = "#d4c9b5"
    tag_ids: List[str] = []
    text: Optional[str] = None
    items: Optional[List[Any]] = None
    content: Optional[str] = None
    links: Optional[List[Any]] = None
    image_ext: Optional[str] = None
    images: Optional[List[Any]] = None


class NoteUpdate(BaseModel):
    x: Optional[int] = None
    y: Optional[int] = None
    w: Optional[int] = None
    h: Optional[int] = None
    color: Optional[str] = None
    tag_ids: Optional[List[str]] = None
    archived: Optional[bool] = None
    text: Optional[str] = None
    items: Optional[List[Any]] = None
    content: Optional[str] = None
    links: Optional[List[Any]] = None
    image_ext: Optional[str] = None
    images: Optional[List[Any]] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
def list_notes(archived: bool = False):
    notes = _load()
    return [n for n in notes if n.get("archived", False) == archived]


@router.post("", status_code=201)
def create_note(body: NoteCreate):
    notes = _load()
    note: dict = {
        "id":       str(uuid.uuid4()),
        "type":     body.type,
        "x":        body.x,
        "y":        body.y,
        "color":    body.color,
        "tag_ids":  body.tag_ids,
        "archived": False,
    }
    if body.w is not None: note["w"] = body.w
    if body.h is not None: note["h"] = body.h
    if body.type == "note":
        note["text"]   = body.text or ""
        note["images"] = body.images or []
    elif body.type == "todo":
        note["items"] = body.items or []
    elif body.type == "ticket":
        note["content"] = body.content or ""
        note["links"]   = body.links or []
    elif body.type == "image":
        note["image_ext"] = body.image_ext or "png"

    notes.append(note)
    _store.write(notes)
    return note


@router.put("/{note_id}")
def update_note(note_id: str, body: NoteUpdate):
    notes = _load()
    for note in notes:
        if note["id"] == note_id:
            for field in ("x", "y", "w", "h", "color", "tag_ids", "archived",
                          "text", "items", "content", "links", "image_ext", "images"):
                val = getattr(body, field)
                if val is not None:
                    note[field] = val
            _store.write(notes)
            return note
    raise HTTPException(status_code=404, detail="Note not found")


@router.delete("/{note_id}", status_code=204)
def delete_note(note_id: str):
    notes = _load()
    new_notes = [n for n in notes if n["id"] != note_id]
    if len(new_notes) == len(notes):
        raise HTTPException(status_code=404, detail="Note not found")
    _store.write(new_notes)
    # Clean up legacy single-image file
    for ext in _EXT_MAP.values():
        p = _IMAGE_DIR / f"{note_id}.{ext}"
        if p.exists():
            try:
                p.unlink()
            except OSError:
                pass
    # Clean up per-note images subdirectory
    note_img_dir = _IMAGE_DIR / note_id
    if note_img_dir.is_dir():
        shutil.rmtree(note_img_dir, ignore_errors=True)


@router.post("/{note_id}/image", status_code=201)
async def upload_image(note_id: str, file: UploadFile = File(...)):
    notes = _load()
    note = next((n for n in notes if n["id"] == note_id), None)
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")

    ct = (file.content_type or "").split(";")[0].strip()
    if ct not in _ALLOWED_CT:
        raise HTTPException(status_code=400, detail="Unsupported image type")

    ext = _EXT_MAP[ct]
    _IMAGE_DIR.mkdir(parents=True, exist_ok=True)

    # Remove old images for this note (in case format changed)
    for old_ext in _EXT_MAP.values():
        p = _IMAGE_DIR / f"{note_id}.{old_ext}"
        if p.exists():
            try:
                p.unlink()
            except OSError:
                pass

    img_path = _IMAGE_DIR / f"{note_id}.{ext}"
    img_path.write_bytes(await file.read())

    note["type"]      = "image"
    note["image_ext"] = ext
    _store.write(notes)
    return {"image_ext": ext}


@router.get("/{note_id}/image")
def get_image(note_id: str):
    notes = _load()
    note = next((n for n in notes if n["id"] == note_id), None)
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")

    ext      = note.get("image_ext", "png")
    img_path = _IMAGE_DIR / f"{note_id}.{ext}"
    if not img_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")

    media_map = {
        "png":  "image/png",
        "jpg":  "image/jpeg",
        "gif":  "image/gif",
        "webp": "image/webp",
    }
    return FileResponse(str(img_path), media_type=media_map.get(ext, "image/png"))


# ── Per-note image list (note type with multiple images) ──────────────────────

@router.post("/{note_id}/images", status_code=201)
async def upload_note_image(note_id: str, file: UploadFile = File(...)):
    notes = _load()
    note = next((n for n in notes if n["id"] == note_id), None)
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")

    ct = (file.content_type or "").split(";")[0].strip()
    if ct not in _ALLOWED_CT:
        raise HTTPException(status_code=400, detail="Unsupported image type")

    ext    = _EXT_MAP[ct]
    img_id = str(uuid.uuid4())

    note_img_dir = _IMAGE_DIR / note_id
    note_img_dir.mkdir(parents=True, exist_ok=True)

    img_path = note_img_dir / f"{img_id}.{ext}"
    img_path.write_bytes(await file.read())

    if not isinstance(note.get("images"), list):
        note["images"] = []
    note["images"].append({"img_id": img_id, "ext": ext})
    _store.write(notes)
    return {"img_id": img_id, "ext": ext}


@router.get("/{note_id}/images/{img_id}")
def get_note_image_by_id(note_id: str, img_id: str):
    notes = _load()
    note = next((n for n in notes if n["id"] == note_id), None)
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")

    images = note.get("images") or []
    img_def = next((i for i in images if i.get("img_id") == img_id), None)
    if img_def is None:
        raise HTTPException(status_code=404, detail="Image not found")

    ext      = img_def["ext"]
    img_path = _IMAGE_DIR / note_id / f"{img_id}.{ext}"
    if not img_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found")

    media_map = {
        "png":  "image/png",
        "jpg":  "image/jpeg",
        "gif":  "image/gif",
        "webp": "image/webp",
    }
    return FileResponse(str(img_path), media_type=media_map.get(ext, "image/png"))


@router.delete("/{note_id}/images/{img_id}", status_code=204)
def delete_note_image_by_id(note_id: str, img_id: str):
    notes = _load()
    note = next((n for n in notes if n["id"] == note_id), None)
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")

    images = note.get("images") or []
    img_def = next((i for i in images if i.get("img_id") == img_id), None)
    if img_def is None:
        raise HTTPException(status_code=404, detail="Image not found")

    note["images"] = [i for i in images if i.get("img_id") != img_id]
    _store.write(notes)

    ext      = img_def["ext"]
    img_path = _IMAGE_DIR / note_id / f"{img_id}.{ext}"
    if img_path.exists():
        try:
            img_path.unlink()
        except OSError:
            pass

