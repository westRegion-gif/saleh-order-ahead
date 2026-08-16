from pathlib import Path
import zipfile

BASE = Path(__file__).resolve().parent
with zipfile.ZipFile(BASE / "v4_bundle.zip", "r") as zf:
    zf.extractall(BASE)

from server import app
