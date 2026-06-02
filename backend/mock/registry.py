import importlib.util
import sys
from pathlib import Path

from fastapi import FastAPI


def load_mock_services(app: FastAPI) -> int:
    """Scan mock/services/ and auto-register every APIRouter named 'router'."""
    services_dir = Path(__file__).parent / "services"
    if not services_dir.exists():
        return 0

    count = 0
    for py_file in sorted(services_dir.glob("*.py")):
        if py_file.name.startswith("_"):
            continue

        module_name = f"mock.services.{py_file.stem}"
        spec = importlib.util.spec_from_file_location(module_name, py_file)
        if spec is None or spec.loader is None:
            continue

        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        try:
            spec.loader.exec_module(module)
        except Exception as exc:
            print(f"[mock] Failed to load {py_file.name}: {exc}")
            continue

        router = getattr(module, "router", None)
        if router is None:
            print(f"[mock] {py_file.name}: no 'router' attribute, skipped")
            continue

        app.include_router(router)
        count += 1
        print(f"[mock] Registered: {py_file.stem}")

    return count
