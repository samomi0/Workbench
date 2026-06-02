import os
import subprocess
import sys
from pathlib import Path

if __name__ == "__main__":
    project_dir = Path(__file__).parent
    data_dir = project_dir / "data"
    data_dir.mkdir(exist_ok=True)

    env = os.environ.copy()
    env.setdefault("DATA_DIR", str(data_dir))
    env.setdefault("PORT", "11111")
    env.setdefault("DEV_MODE", "false")

    subprocess.run(
        [sys.executable, "backend/main.py"],
        cwd=project_dir,
        env=env,
        check=True,
    )
