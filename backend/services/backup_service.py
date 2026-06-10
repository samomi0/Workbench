"""
Auto-backup service: periodically zips the project + data directory
and prunes backups older than the retention window.
"""

import asyncio
import logging
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import config

logger = logging.getLogger("workbench.backup")

# Directories / file patterns excluded from backups
_EXCLUDE_NAMES = {
    "__pycache__",
    ".git",
    ".vscode",
    "node_modules",
    ".venv",
    "venv",
    "backups",
}
_EXCLUDE_SUFFIXES = {".pyc", ".pyo"}


def _should_include(file_path: Path) -> bool:
    """Return True if *file_path* should be included in a backup."""
    # Exclude by directory / file name
    for part in file_path.relative_to(config.PROJECT_DIR).parts:
        if part in _EXCLUDE_NAMES:
            return False
    # Exclude by suffix
    if file_path.suffix in _EXCLUDE_SUFFIXES:
        return False
    # Exclude anything inside the backup directory (in case it's nested)
    try:
        file_path.relative_to(config.BACKUP_DIR)
        return False
    except ValueError:
        pass
    return True


def create_backup() -> Path:
    """Create a timestamped .zip of the project, return its path."""
    config.BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    zip_name = f"workbench_backup_{timestamp}.zip"
    zip_path = config.BACKUP_DIR / zip_name

    base = config.PROJECT_DIR

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        count = 0
        for f in base.rglob("*"):
            if not f.is_file():
                continue
            if not _should_include(f):
                continue
            arcname = str(f.relative_to(base))
            zf.write(f, arcname)
            count += 1

    if count == 0:
        zip_path.unlink()
        raise RuntimeError("No files found to back up")

    logger.info(
        "Backup created: %s  (%d files, %d bytes)",
        zip_name,
        count,
        zip_path.stat().st_size,
    )
    return zip_path


def cleanup_old_backups() -> int:
    """Remove backups older than BACKUP_RETENTION_HOURS.  Returns count deleted."""
    if not config.BACKUP_DIR.exists():
        return 0

    now = time.time()
    cutoff = now - config.BACKUP_RETENTION_HOURS * 3600
    deleted = 0

    for f in config.BACKUP_DIR.iterdir():
        if f.is_file() and f.suffix == ".zip" and f.name.startswith("workbench_backup_"):
            if f.stat().st_mtime < cutoff:
                f.unlink()
                deleted += 1
                logger.info("Pruned old backup: %s", f.name)

    return deleted


async def _backup_loop():
    """Run one backup cycle every BACKUP_INTERVAL_HOURS hours."""
    while True:
        await asyncio.sleep(config.BACKUP_INTERVAL_HOURS * 3600)
        try:
            create_backup()
            cleanup_old_backups()
        except Exception:
            logger.exception("Backup cycle failed")


_backup_task = None


def start_backup_scheduler():
    """Launch the periodic backup task.  Idempotent — safe to call more than once."""
    global _backup_task
    if _backup_task is None or _backup_task.done():
        _backup_task = asyncio.ensure_future(_backup_loop())
        logger.info(
            "Backup scheduler started (interval=%dh, retention=%dh)",
            config.BACKUP_INTERVAL_HOURS,
            config.BACKUP_RETENTION_HOURS,
        )
