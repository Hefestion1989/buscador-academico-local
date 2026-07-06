from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

from app.config import (
    DEFAULT_CANDIDATE_MULTIPLIER,
    DEFAULT_MAX_RESULTS_PER_FILE,
    DEFAULT_MIN_RELEVANCE,
    DEFAULT_TOP_K,
)
from app.embeddings import embed_texts
from app.vector_store import get_collection


STOPWORDS = {
    "ahi",
    "algo",
    "ante",
    "aqui",
    "cada",
    "como",
    "con",
    "cual",
    "cuando",
    "desde",
    "donde",
    "dos",
    "el",
    "ella",
    "ellas",
    "ellos",
    "en",
    "entre",
    "era",
    "ese",
    "eso",
    "esta",
    "este",
    "estos",
    "hay",
    "la",
    "las",
    "los",
    "mas",
    "muy",
    "para",
    "pero",
    "por",
    "que",
    "sin",
    "sobre",
    "son",
    "sus",
    "tambien",
    "todo",
    "una",
    "uno",
    "unos",
}

LOW_SIGNAL_PHRASES = {
    "adoptar la tecnica de estudio",
    "desarrollar tecnica de estudio",
    "estudio de practica basado",
    "incorporar el estudio basado",
    "participar en actividades que promuevan",
}


@dataclass(frozen=True)
class SearchResult:
    file_name: str
    relative_path: str
    source_path: str
    location: str
    snippet: str
    relevance: float
    semantic_relevance: float
    keyword_score: float
    title_score: float
    distance: float
    low_signal_penalty: float


def semantic_search(
    query: str,
    top_k: int = DEFAULT_TOP_K,
    *,
    candidate_k: int | None = None,
    min_relevance: float = DEFAULT_MIN_RELEVANCE,
    max_results_per_file: int = DEFAULT_MAX_RESULTS_PER_FILE,
    prefer_specific: bool = True,
) -> list[SearchResult]:
    query = query.strip()
    if not query:
        return []

    collection = get_collection()
    collection_count = collection.count()
    if collection_count == 0:
        return []

    candidate_k = candidate_k or max(top_k * DEFAULT_CANDIDATE_MULTIPLIER, top_k)
    candidate_k = max(top_k, min(candidate_k, collection_count))
    query_embedding = embed_texts([query])[0]
    raw = collection.query(
        query_embeddings=[query_embedding],
        n_results=candidate_k,
        include=["documents", "metadatas", "distances"],
    )

    documents = raw.get("documents", [[]])[0]
    metadatas = raw.get("metadatas", [[]])[0]
    distances = raw.get("distances", [[]])[0]

    scored: list[SearchResult] = []
    for document, metadata, distance in zip(documents, metadatas, distances):
        metadata = metadata or {}
        semantic_relevance = clamp01(1.0 - float(distance))
        file_name = str(metadata.get("source_name", ""))
        relative_path = str(metadata.get("relative_path", ""))
        searchable_text = f"{file_name}\n{relative_path}\n{document}"
        keyword_score = keyword_overlap(query, searchable_text)
        title_score = keyword_overlap(query, f"{file_name}\n{relative_path}")
        penalty = low_signal_penalty(document, relative_path) if prefer_specific else 0.0
        duplicate_bonus = 0.04 if title_score >= 0.34 else 0.0
        final_score = (
            semantic_relevance * 0.74
            + keyword_score * 0.18
            + title_score * 0.08
            + duplicate_bonus
            - penalty
        )
        if keyword_score == 0 and title_score == 0 and semantic_relevance < 0.62:
            final_score -= 0.05

        scored.append(
            SearchResult(
                file_name=file_name,
                relative_path=relative_path,
                source_path=str(metadata.get("source_path", "")),
                location=str(metadata.get("location", "")),
                snippet=trim_snippet(document),
                relevance=clamp01(final_score),
                semantic_relevance=semantic_relevance,
                keyword_score=keyword_score,
                title_score=title_score,
                distance=float(distance),
                low_signal_penalty=penalty,
            )
        )

    scored.sort(key=lambda item: item.relevance, reverse=True)
    diverse = diversify_by_file(scored, max_results_per_file=max_results_per_file)
    filtered = [item for item in diverse if item.relevance >= min_relevance]
    if not filtered:
        filtered = diverse
    return filtered[:top_k]


def diversify_by_file(
    results: list[SearchResult],
    *,
    max_results_per_file: int,
) -> list[SearchResult]:
    if max_results_per_file <= 0:
        return results

    seen: dict[str, int] = {}
    selected: list[SearchResult] = []
    deferred: list[SearchResult] = []

    for item in results:
        source_key = canonical_source_key(item)
        count = seen.get(source_key, 0)
        if count < max_results_per_file:
            selected.append(item)
            seen[source_key] = count + 1
        else:
            deferred.append(item)

    return selected + deferred


def canonical_source_key(item: SearchResult) -> str:
    key = item.relative_path or item.source_path or item.file_name
    key = normalize_text(key)
    key = re.sub(r"\b(copia de|copy of)\b", " ", key)
    key = re.sub(r"\b1\b(?=\s*(pdf|docx|txt)?$)", " ", key)
    key = re.sub(r"\s+", " ", key).strip()
    return key or item.file_name


def keyword_overlap(query: str, text: str) -> float:
    query_tokens = set(tokenize(query))
    if not query_tokens:
        return 0.0
    text_tokens = set(tokenize(text))
    if not text_tokens:
        return 0.0

    overlap = query_tokens & text_tokens
    coverage = len(overlap) / len(query_tokens)
    phrase_bonus = 0.0
    normalized_query = normalize_text(query)
    normalized_text = normalize_text(text)
    if len(normalized_query) >= 8 and normalized_query in normalized_text:
        phrase_bonus = 0.22
    return clamp01(coverage + phrase_bonus)


def low_signal_penalty(document: str, relative_path: str) -> float:
    normalized = normalize_text(f"{relative_path}\n{document[:2200]}")
    phrase_hits = sum(1 for phrase in LOW_SIGNAL_PHRASES if phrase in normalized)
    numbered_items = len(re.findall(r"\b\d{2,4}\.", document[:1600]))
    if phrase_hits >= 2:
        return 0.14
    if phrase_hits == 1 and numbered_items >= 2:
        return 0.10
    return 0.0


def tokenize(text: str) -> list[str]:
    normalized = normalize_text(text)
    tokens = []
    for token in normalized.split():
        if len(token) < 3 or token in STOPWORDS:
            continue
        tokens.append(stem_light(token))
    return tokens


def normalize_text(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text)
    ascii_text = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return re.sub(r"[^a-zA-Z0-9]+", " ", ascii_text).lower().strip()


def stem_light(token: str) -> str:
    if len(token) > 6 and token.endswith("ciones"):
        return token[:-5] + "cion"
    if len(token) > 5 and token.endswith("cion"):
        return token
    if len(token) > 5 and token.endswith("es"):
        return token[:-2]
    if len(token) > 4 and token.endswith("s"):
        return token[:-1]
    return token


def trim_snippet(text: str, max_chars: int = 1400) -> str:
    text = text.strip()
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 1].rstrip() + "..."


def clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def display_path(path: str) -> str:
    if not path:
        return ""
    return str(Path(path))
