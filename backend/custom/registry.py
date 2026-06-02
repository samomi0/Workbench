"""Auto-discover and register custom/business-specific routers.

Place .py files with an APIRouter named 'router' in backend/custom/,
and they will be registered automatically — no need to edit app.py.
Files starting with '_' are skipped.
"""
import importlib.util
import sys
from pathlib import Path

from fastapi import FastAPI


def load_custom_routers(app: FastAPI) -> int:
    """Scan custom/ and auto-register every APIRouter named 'router'."""
    custom_dir = Path(__file__).parent
    count = 0

    for py_file in sorted(custom_dir.glob("*.py")):
        if py_file.name.startswith("_"):
            continue

        module_name = f"custom.{py_file.stem}"
        spec = importlib.util.spec_from_file_location(module_name, py_file)
        if spec is None or spec.loader is None:
            continue

        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        try:
            spec.loader.exec_module(module)
        except Exception as exc:
            print(f"[custom] Failed to load {py_file.name}: {exc}")
            continue

        router = getattr(module, "router", None)
        if router is None:
            print(f"[custom] {py_file.name}: no 'router' attribute, skipped")
            continue

        app.include_router(router)
        count += 1
        print(f"[custom] Registered: {py_file.stem}")

    return count
