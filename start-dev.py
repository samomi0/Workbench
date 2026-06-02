import os
import subprocess
import sys
from pathlib import Path

if __name__ == "__main__":
    project_dir = Path(__file__).parent
    backend_dir = project_dir / "backend"
    data_dir = project_dir / "data"
    data_dir.mkdir(exist_ok=True)

    env = os.environ.copy()
    env["DEV_MODE"] = "true"
    env["DATA_DIR"] = str(data_dir)
    env.setdefault("PORT", "11111")

    subprocess.run(
        [
            sys.executable, "-m", "uvicorn",
            "app:app",
            "--host", "0.0.0.0",
            "--port", env["PORT"],
            "--reload",
        ],
        cwd=backend_dir,
        env=env,
        check=True,
    )
