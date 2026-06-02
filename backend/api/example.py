# How to add a new API module
# ============================================================
#
# Two directories for different purposes:
#
#   api/     -> generic/common APIs (version-controlled)
#               Explicit registration in app.py required.
#               Prefix: /api/xxx
#
#   custom/  -> business-specific APIs (gitignored)
#               Auto-discovered on startup, zero-config.
#               Prefix: /custom/xxx
#
# For generic APIs (api/):
#   1. Copy this file to backend/api/my_module.py
#   2. Define a router with prefix /api/my-module
#   3. In backend/app.py, add two lines:
#        from api.my_module import router as my_router
#        app.include_router(my_router)
#   4. Restart the server
#
# For custom APIs (custom/):
#   1. Create backend/custom/my_feature.py
#   2. Define a router with prefix /custom/my-feature
#   3. Restart the server (auto-discovered, no app.py changes needed)
#
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
