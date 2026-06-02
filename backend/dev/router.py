import asyncio

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from dev.watcher import subscribe, unsubscribe

router = APIRouter(prefix="/dev", tags=["dev"])


@router.get("/watch", include_in_schema=False)
async def watch():
    """SSE endpoint: pushes a reload signal whenever frontend files change."""
    q = subscribe()

    async def stream():
        try:
            yield "data: connected\n\n"
            while True:
                try:
                    version = await asyncio.wait_for(q.get(), timeout=25)
                    yield f"data: {version}\n\n"
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"
        except (asyncio.CancelledError, GeneratorExit):
            pass
        finally:
            unsubscribe(q)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
