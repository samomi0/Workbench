from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.tag_service import create_tag, delete_tag, list_tags

router = APIRouter(prefix="/api/tags", tags=["tags"])


class TagCreate(BaseModel):
    name: str
    color: str = "#2563eb"


@router.get("")
def get_tags():
    return list_tags()


@router.post("", status_code=201)
def post_tag(body: TagCreate):
    return create_tag(body.name, body.color)


@router.delete("/{tag_id}", status_code=204)
def remove_tag(tag_id: str):
    if not delete_tag(tag_id):
        raise HTTPException(status_code=404, detail="Tag not found")
