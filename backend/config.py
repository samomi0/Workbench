import json
import os
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parent
_PROJECT_DIR = _BACKEND_DIR.parent

PORT: int = int(os.environ.get("PORT", "8000"))
DEV_MODE: bool = os.environ.get("DEV_MODE", "false").lower() == "true"
DATA_DIR: Path = Path(os.environ.get("DATA_DIR", str(_PROJECT_DIR / "data")))
FRONTEND_DIR: Path = _PROJECT_DIR / "frontend"

# ── Auto-backup settings ─────────────────────────────────────────────────────
BACKUP_DIR: Path = Path(
    os.environ.get("BACKUP_DIR", str(_PROJECT_DIR / "backups"))
)
BACKUP_INTERVAL_HOURS: int = int(
    os.environ.get("BACKUP_INTERVAL_HOURS", "8")
)
BACKUP_RETENTION_HOURS: int = int(
    os.environ.get("BACKUP_RETENTION_HOURS", "72")  # 3 days
)


def _bootstrap() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    (DATA_DIR / "archives").mkdir(parents=True, exist_ok=True)

    (DATA_DIR / "note_images").mkdir(parents=True, exist_ok=True)

    for fname, default in [("tags.json", []), ("resources.json", []), ("notes.json", [])]:
        fpath = DATA_DIR / fname
        if not fpath.exists():
            fpath.write_text(
                json.dumps(default, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )


_bootstrap()
