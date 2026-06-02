from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.tag_service import create_tag, delete_tag, list_tags, update_tag

router = APIRouter(prefix="/api/tags", tags=["tags"])


class TagCreate(BaseModel):
    name: str
    color: str = "#2563eb"


class TagUpdate(BaseModel):
    name: str = None
    color: str = None


@router.get("")
def get_tags():
    return list_tags()


@router.post("", status_code=201)
def post_tag(body: TagCreate):
    return create_tag(body.name, body.color)


@router.put("/{tag_id}")
def put_tag(tag_id: str, body: TagUpdate):
    updated = update_tag(tag_id, body.name, body.color)
    if updated is None:
        raise HTTPException(status_code=404, detail="Tag not found")
    return updated


@router.delete("/{tag_id}", status_code=204)
def remove_tag(tag_id: str):
    if not delete_tag(tag_id):
        raise HTTPException(status_code=404, detail="Tag not found")
