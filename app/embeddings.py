from __future__ import annotations

import os
from functools import lru_cache

from app.config import EMBEDDING_MODEL_NAME


def configure_local_only() -> None:
    if os.environ.get("ACADEMIC_SEARCH_ALLOW_DOWNLOAD") == "1":
        os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
        return
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")


@lru_cache(maxsize=1)
def get_model():
    configure_local_only()
    from sentence_transformers import SentenceTransformer

    allow_download = os.environ.get("ACADEMIC_SEARCH_ALLOW_DOWNLOAD") == "1"

    try:
        return SentenceTransformer(
            EMBEDDING_MODEL_NAME,
            local_files_only=not allow_download,
        )
    except TypeError:
        return SentenceTransformer(EMBEDDING_MODEL_NAME)
    except Exception as exc:
        raise RuntimeError(
            "No encontre el modelo de embeddings en cache local. "
            "Para mantener el buscador 100% local, dejalo descargado una vez "
            f"o cambiá EMBEDDING_MODEL_NAME en app/config.py. Modelo: {EMBEDDING_MODEL_NAME}"
        ) from exc


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    model = get_model()
    embeddings = model.encode(
        texts,
        batch_size=32,
        normalize_embeddings=True,
        show_progress_bar=False,
    )
    return embeddings.tolist()


def warm_up_model() -> None:
    embed_texts(["busqueda academica local"])
