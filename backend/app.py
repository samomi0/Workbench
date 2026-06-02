import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

import config
from api.archive import router as archive_router
from api.notes import router as notes_router
from api.resources import router as resources_router
from api.tags import router as tags_router
from api.tools import router as tools_router
from mock.registry import load_mock_services

if config.DEV_MODE:
    from dev.router import router as dev_router
    from dev import watcher


@asynccontextmanager
async def lifespan(app: FastAPI):
    if config.DEV_MODE:
        asyncio.create_task(watcher.start())
    yield


app = FastAPI(
    title="Workbench",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
)

# ── Static directories (created on first run if absent) ──────────────────────
_fe = config.FRONTEND_DIR
(_fe / "assets").mkdir(parents=True, exist_ok=True)
(_fe / "tools").mkdir(parents=True, exist_ok=True)

app.mount("/assets", StaticFiles(directory=str(_fe / "assets")), name="assets")
app.mount("/tools", StaticFiles(directory=str(_fe / "tools"), html=True), name="tools")


# ── No-cache middleware for static assets (dev convenience) ────────────────────
if config.DEV_MODE:
    from starlette.datastructures import MutableHeaders

    class NoCacheMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request, call_next):
            response = await call_next(request)
            if request.url.path.startswith(("/assets/", "/tools/")):
                response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
                response.headers["Pragma"] = "no-cache"
                response.headers["Expires"] = "0"
            return response

    app.add_middleware(NoCacheMiddleware)


@app.get("/", include_in_schema=False)
def root():
    return FileResponse(str(_fe / "index.html"))


# ── Core API routers ─────────────────────────────────────────────────────────
app.include_router(tools_router)
app.include_router(tags_router)
app.include_router(notes_router)
app.include_router(resources_router)
app.include_router(archive_router)

# To register a new API module, add two lines here:
#   from api.my_module import router as my_router
#   app.include_router(my_router)

# ── Auto-discovered mock services ────────────────────────────────────────────
load_mock_services(app)

# ── Dev extras (SSE hot reload) ───────────────────────────────────────────────
if config.DEV_MODE:
    app.include_router(dev_router)
