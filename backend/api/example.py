# How to add a new API module
# ============================================================
# 1. Copy this file to backend/api/my_module.py
# 2. Define a router with a unique prefix
# 3. In backend/app.py, add two lines:
#      from api.my_module import router as my_router
#      app.include_router(my_router)
# 4. Restart the server
#
# Difference from mock/services/:
#   api/    -> explicit registration in app.py (stable, version-controlled)
#   mock/   -> auto-discovered on startup (zero-config, good for ad-hoc mocks)
# ============================================================

from fastapi import APIRouter
from pydantic import BaseModel

from services.storage import Storage

router = APIRouter(prefix="/api/example", tags=["example"])
_store = Storage("example.json")


class ExampleItem(BaseModel):
    name: str
    value: str


@router.get("")
def list_items():
    data = _store.read()
    return data if isinstance(data, list) else []


@router.post("", status_code=201)
def create_item(body: ExampleItem):
    items = _store.read()
    if not isinstance(items, list):
        items = []
    items.append({"name": body.name, "value": body.value})
    _store.write(items)
    return {"name": body.name, "value": body.value}
