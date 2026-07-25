from __future__ import annotations

from dataclasses import dataclass

from app.config import CHUNK_OVERLAP, CHUNK_SIZE
from app.extractors import TextSegment


@dataclass(frozen=True)
class TextChunk:
    text: str
    location: str
    chunk_index: int


def make_chunks(
    segments: list[TextSegment],
    chunk_size: int = CHUNK_SIZE,
    overlap: int = CHUNK_OVERLAP,
) -> list[TextChunk]:
    validate_chunk_settings(chunk_size, overlap)
    chunks: list[TextChunk] = []
    current_parts: list[str] = []
    current_length = 0
    current_location = ""

    def flush() -> None:
        nonlocal current_parts, current_length, current_location
        text = "\n".join(current_parts).strip()
        if text:
            chunks.append(
                TextChunk(
                    text=text,
                    location=current_location or "ubicacion aproximada desconocida",
                    chunk_index=len(chunks),
                )
            )
        current_parts = []
        current_length = 0
        current_location = ""

    for segment in segments:
        text = segment.text.strip()
        if not text:
            continue

        if len(text) > chunk_size:
            flush()
            for part_index, part in enumerate(split_long_text(text, chunk_size, overlap), start=1):
                chunks.append(
                    TextChunk(
                        text=part,
                        location=f"{segment.location}, parte {part_index}",
                        chunk_index=len(chunks),
                    )
                )
            continue

        projected_length = current_length + len(text) + 1
        if current_parts and projected_length > chunk_size:
            flush()

        if not current_parts:
            current_location = segment.location
        current_parts.append(text)
        current_length += len(text) + 1

    flush()
    return chunks


def split_long_text(text: str, chunk_size: int, overlap: int) -> list[str]:
    validate_chunk_settings(chunk_size, overlap)
    parts: list[str] = []
    start = 0
    text = text.strip()

    while start < len(text):
        end = min(len(text), start + chunk_size)
        if end < len(text):
            natural_break = max(text.rfind(". ", start, end), text.rfind("\n", start, end))
            if natural_break > start + chunk_size // 2:
                end = natural_break + 1
        parts.append(text[start:end].strip())
        if end >= len(text):
            break
        start = max(0, end - overlap)

    return [part for part in parts if part]


def validate_chunk_settings(chunk_size: int, overlap: int) -> None:
    if chunk_size <= 0:
        raise ValueError("chunk_size debe ser mayor que cero")
    if overlap < 0:
        raise ValueError("overlap no puede ser negativo")
    if overlap >= chunk_size:
        raise ValueError("overlap debe ser menor que chunk_size")
