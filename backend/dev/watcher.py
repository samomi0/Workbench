import asyncio
import os
from typing import Dict, Set

import config

_version: int = 0
_subscribers: Set[asyncio.Queue] = set()


def get_version() -> int:
    return _version


def subscribe() -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=1)
    _subscribers.add(q)
    return q


def unsubscribe(q: asyncio.Queue) -> None:
    _subscribers.discard(q)


async def _notify() -> None:
    global _version
    _version += 1
    for q in list(_subscribers):
        try:
            q.put_nowait(_version)
        except asyncio.QueueFull:
            pass  # client is slow; it will reload on reconnect


async def start() -> None:
    """Background coroutine: poll frontend/ for file mtime changes every second."""
    watch_dir = config.FRONTEND_DIR
    mtimes: Dict[str, float] = {}

    def scan() -> bool:
        changed = False
        try:
            for root, _, files in os.walk(watch_dir):
                for fname in files:
                    path = os.path.join(root, fname)
                    try:
                        mtime = os.stat(path).st_mtime
                    except OSError:
                        continue
                    if mtimes.get(path) != mtime:
                        mtimes[path] = mtime
                        changed = True
        except Exception:
            pass
        return changed

    scan()  # populate baseline without triggering reload

    while True:
        await asyncio.sleep(1)
        if scan():
            await _notify()
