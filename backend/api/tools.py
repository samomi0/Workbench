import json

from fastapi import APIRouter

import config

router = APIRouter(prefix="/api/tools", tags=["tools"])


@router.get("")
def list_tools() -> list:
    tools_dir = config.FRONTEND_DIR / "tools"
    if not tools_dir.exists():
        return []

    tools = []
    for tool_dir in sorted(tools_dir.iterdir()):
        if not tool_dir.is_dir() or tool_dir.name.startswith("_"):
            continue
        meta_file = tool_dir / "tool.json"
        if not meta_file.exists():
            continue
        try:
            with open(meta_file, "r", encoding="utf-8") as f:
                meta = json.load(f)
            meta["url"] = f"/tools/{tool_dir.name}/index.html"
            tools.append(meta)
        except Exception:
            continue

    return tools
