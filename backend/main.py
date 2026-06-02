import sys
from pathlib import Path

# Ensure backend/ is in sys.path so imports work when invoked from project root
sys.path.insert(0, str(Path(__file__).resolve().parent))

import uvicorn  # noqa: E402
import config   # noqa: E402

if __name__ == "__main__":
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=config.PORT,
        access_log=True,
        reload=False,
    )
