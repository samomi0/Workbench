# How to add a new Mock service
# ============================================================
# 1. Copy this file to backend/mock/services/my_service.py
#    (the name must NOT start with underscore)
# 2. Set prefix to /mock/your-service-name
# 3. Define your route handlers below
# 4. Restart the server - routes are auto-registered, no other files to edit
#
# This template file starts with _ so it is ignored by the registry.
# ============================================================

from fastapi import APIRouter, Request

router = APIRouter(prefix="/mock/template", tags=["mock"])


@router.get("/ping")
def ping():
    return {"status": "ok", "service": "template"}


@router.post("/echo")
async def echo(request: Request):
    try:
        body = await request.json()
    except Exception:
        body = None
    return {
        "echo": body,
        "method": request.method,
        "path": str(request.url.path),
    }


@router.get("/data/{item_id}")
def get_item(item_id: str, q: str = None):
    return {"id": item_id, "query": q, "data": f"mock data for {item_id}"}
