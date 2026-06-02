import uuid
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.storage import Storage

router = APIRouter(prefix="/api/resources", tags=["resources"])
_store = Storage("resources.json")


def _load() -> list:
    data = _store.read()
    return data if isinstance(data, list) else []


class ResourceCreate(BaseModel):
    title: str
    content: str = ""
    type: str = "text"


class ResourceUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    type: Optional[str] = None


class TagsAssign(BaseModel):
    tag_ids: List[str]


@router.get("")
def list_resources(tag: Optional[str] = None):
    resources = _load()
    if tag:
        resources = [r for r in resources if tag in r.get("tag_ids", [])]
    return resources


@router.post("", status_code=201)
def create_resource(body: ResourceCreate):
    resources = _load()
    res = {
        "id": str(uuid.uuid4()),
        "title": body.title,
        "content": body.content,
        "type": body.type,
        "tag_ids": [],
    }
    resources.append(res)
    _store.write(resources)
    return res


@router.put("/{res_id}")
def update_resource(res_id: str, body: ResourceUpdate):
    resources = _load()
    for res in resources:
        if res["id"] == res_id:
            if body.title is not None:
                res["title"] = body.title
            if body.content is not None:
                res["content"] = body.content
            if body.type is not None:
                res["type"] = body.type
            _store.write(resources)
            return res
    raise HTTPException(status_code=404, detail="Resource not found")


@router.delete("/{res_id}", status_code=204)
def delete_resource(res_id: str):
    resources = _load()
    filtered = [r for r in resources if r["id"] != res_id]
    if len(filtered) == len(resources):
        raise HTTPException(status_code=404, detail="Resource not found")
    _store.write(filtered)


@router.post("/{res_id}/tags")
def assign_tags(res_id: str, body: TagsAssign):
    resources = _load()
    for res in resources:
        if res["id"] == res_id:
            res["tag_ids"] = body.tag_ids
            _store.write(resources)
            return res
    raise HTTPException(status_code=404, detail="Resource not found")
