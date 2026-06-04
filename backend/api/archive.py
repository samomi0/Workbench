from typing import List

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from services.archive_service import archive_by_tags, archive_notes

router = APIRouter(prefix="/api/archive", tags=["archive"])


class ArchiveRequest(BaseModel):
    tag_ids: List[str]
    filename: str = "archive.zip"


class ArchiveNotesRequest(BaseModel):
    note_ids: List[str]
    filename: str = "archive.zip"


@router.post("")
def create_archive(body: ArchiveRequest):
    if not body.tag_ids:
        raise HTTPException(status_code=400, detail="tag_ids must not be empty")

    zip_bytes = archive_by_tags(body.tag_ids)

    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{body.filename}"'
        },
    )


@router.post("/notes")
def create_notes_archive(body: ArchiveNotesRequest):
    if not body.note_ids:
        raise HTTPException(status_code=400, detail="note_ids must not be empty")

    zip_bytes = archive_notes(body.note_ids)

    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{body.filename}"'
        },
    )
