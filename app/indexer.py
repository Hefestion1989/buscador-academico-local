from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from app.chunker import make_chunks
from app.config import FILES_METADATA_PATH, METADATA_DIR
from app.embeddings import embed_texts
from app.extractors import extract_segments
from app.scanner import iter_document_files, path_is_inside, sha256_file, stat_signature
from app.vector_store import get_collection, reset_collection


ProgressCallback = Callable[[str], None]


@dataclass
class IndexResult:
    scanned: int = 0
    indexed: int = 0
    skipped: int = 0
    removed: int = 0
    chunks_added: int = 0
    empty: int = 0
    errors: list[str] = field(default_factory=list)


def sync_index(
    root: Path,
    reindex_all: bool = False,
    progress: ProgressCallback | None = None,
) -> IndexResult:
    root = root.expanduser().resolve()
    if not root.exists() or not root.is_dir():
        raise ValueError(f"La carpeta no existe o no es una carpeta: {root}")

    result = IndexResult()
    metadata = fresh_metadata(root) if reindex_all else load_metadata()
    collection = reset_collection() if reindex_all else get_collection()

    current_files = sorted(
        iter_document_files(root),
        key=lambda path: (path.stat().st_size, str(path).lower()),
    )
    current_file_keys = {str(path) for path in current_files}
    result.scanned = len(current_files)
    metadata["root"] = str(root)
    save_metadata(metadata)

    for old_path, old_info in list(metadata.get("files", {}).items()):
        old_path_obj = Path(old_path)
        if path_is_inside(old_path_obj, root) and old_path not in current_file_keys:
            delete_chunks(collection, old_info.get("chunk_ids", []))
            metadata["files"].pop(old_path, None)
            save_metadata(metadata)
            result.removed += 1

    for path in current_files:
        key = str(path)
        if progress:
            progress(f"Revisando {path.name}")

        try:
            basic_signature = stat_signature(path)
            previous = metadata.get("files", {}).get(key)
            if (
                previous
                and previous.get("signature", {}).get("size") == basic_signature["size"]
                and previous.get("signature", {}).get("mtime_ns") == basic_signature["mtime_ns"]
            ):
                result.skipped += 1
                continue

            signature = {
                **basic_signature,
                "sha256": sha256_file(path),
            }

            if previous and previous.get("signature", {}).get("sha256") == signature["sha256"]:
                previous["signature"] = signature
                save_metadata(metadata)
                result.skipped += 1
                continue

            if previous:
                delete_chunks(collection, previous.get("chunk_ids", []))

            segments = extract_segments(path)
            chunks = make_chunks(segments)
            if not chunks:
                metadata["files"][key] = {
                    "signature": signature,
                    "relative_path": safe_relative(path, root),
                    "chunk_ids": [],
                    "status": "sin_texto_extraible",
                }
                save_metadata(metadata)
                result.empty += 1
                continue

            chunk_ids = [
                stable_chunk_id(path, signature["sha256"], chunk.chunk_index)
                for chunk in chunks
            ]
            documents = [chunk.text for chunk in chunks]
            embeddings = embed_texts(documents)
            metadatas = [
                {
                    "source_path": key,
                    "source_name": path.name,
                    "relative_path": safe_relative(path, root),
                    "extension": path.suffix.lower(),
                    "location": chunk.location,
                    "chunk_index": chunk.chunk_index,
                }
                for chunk in chunks
            ]

            add_in_batches(collection, chunk_ids, documents, embeddings, metadatas)
            metadata["files"][key] = {
                "signature": signature,
                "relative_path": safe_relative(path, root),
                "chunk_ids": chunk_ids,
                "status": "indexado",
            }
            result.indexed += 1
            result.chunks_added += len(chunks)
            save_metadata(metadata)

        except Exception as exc:
            result.errors.append(f"{path}: {exc}")
            metadata.setdefault("errors", {})[key] = str(exc)
            save_metadata(metadata)

    metadata["root"] = str(root)
    save_metadata(metadata)
    return result


def stable_chunk_id(path: Path, file_hash: str, chunk_index: int) -> str:
    return uuid.uuid5(
        uuid.NAMESPACE_URL,
        f"{path.resolve()}::{file_hash}::{chunk_index}",
    ).hex


def add_in_batches(collection, ids, documents, embeddings, metadatas, batch_size: int = 64):
    for start in range(0, len(ids), batch_size):
        end = start + batch_size
        collection.upsert(
            ids=ids[start:end],
            documents=documents[start:end],
            embeddings=embeddings[start:end],
            metadatas=metadatas[start:end],
        )


def delete_chunks(collection, chunk_ids: list[str]) -> None:
    if not chunk_ids:
        return
    try:
        collection.delete(ids=chunk_ids)
    except Exception:
        pass


def fresh_metadata(root: Path) -> dict:
    return {
        "version": 1,
        "root": str(root),
        "files": {},
    }


def load_metadata() -> dict:
    if not FILES_METADATA_PATH.exists():
        return fresh_metadata(Path(""))
    try:
        return json.loads(FILES_METADATA_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return fresh_metadata(Path(""))


def save_metadata(metadata: dict) -> None:
    METADATA_DIR.mkdir(parents=True, exist_ok=True)
    FILES_METADATA_PATH.write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def safe_relative(path: Path, root: Path) -> str:
    try:
        return str(path.resolve().relative_to(root.resolve()))
    except ValueError:
        return path.name
