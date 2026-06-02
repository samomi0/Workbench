import json
import os
import tempfile
from pathlib import Path
from typing import Any

import config


class Storage:
    """Atomic JSON file storage backed by a file in DATA_DIR."""

    def __init__(self, filename: str) -> None:
        self._path: Path = config.DATA_DIR / filename

    def read(self) -> Any:
        if not self._path.exists():
            return []
        with open(self._path, "r", encoding="utf-8") as f:
            return json.load(f)

    def write(self, data: Any) -> None:
        fd, tmp_path = tempfile.mkstemp(dir=self._path.parent, suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            os.replace(tmp_path, self._path)
        except Exception:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise
