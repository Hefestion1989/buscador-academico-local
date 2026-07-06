from __future__ import annotations

import hashlib
import os
from pathlib import Path
from typing import Iterable

from app.config import IGNORED_DIR_NAMES, SUPPORTED_EXTENSIONS


def iter_document_files(root: Path) -> Iterable[Path]:
    """Yield supported documents below root without modifying anything."""
    root = root.expanduser().resolve()
    for current_dir, dir_names, file_names in os.walk(root):
        dir_names[:] = [
            name
            for name in dir_names
            if name not in IGNORED_DIR_NAMES and not name.startswith(".")
        ]

        for file_name in file_names:
            if file_name.startswith("~$"):
                continue
            path = Path(current_dir) / file_name
            if path.suffix.lower() in SUPPORTED_EXTENSIONS:
                yield path.resolve()


def stat_signature(path: Path) -> dict:
    stat = path.stat()
    return {
        "size": stat.st_size,
        "mtime_ns": stat.st_mtime_ns,
    }


def sha256_file(path: Path, block_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for block in iter(lambda: file.read(block_size), b""):
            digest.update(block)
    return digest.hexdigest()


def path_is_inside(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False
