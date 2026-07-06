from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass

from app.search import SearchResult


DEFAULT_LM_STUDIO_URL = "http://127.0.0.1:1234/v1/chat/completions"


@dataclass(frozen=True)
class LocalLLMResponse:
    text: str
    provider: str


def generate_local_answer(
    query: str,
    sources: list[SearchResult],
    *,
    timeout_seconds: float = 1.5,
) -> LocalLLMResponse | None:
    url = os.environ.get("ACADEMIC_SEARCH_LLM_URL", DEFAULT_LM_STUDIO_URL)
    if not is_local_url(url):
        return None

    payload = {
        "model": os.environ.get("ACADEMIC_SEARCH_LLM_MODEL", "local-model"),
        "temperature": 0.15,
        "max_tokens": 900,
        "messages": [
            {
                "role": "system",
                "content": (
                    "Responde en espanol rioplatense claro. Usa solo las fuentes "
                    "incluidas por el usuario. Si no alcanza, decilo. Cita cada idea "
                    "con [1], [2], etc. No inventes bibliografia ni datos externos. "
                    "Si la consulta es un termino o concepto, no enumeres solo "
                    "apariciones: defini el concepto, sus rasgos y una definicion "
                    "de trabajo basada en las fuentes."
                ),
            },
            {
                "role": "user",
                "content": build_prompt(query, sources),
            },
        ],
    }

    try:
        response = post_json(url, payload, timeout_seconds=timeout_seconds)
    except (OSError, urllib.error.URLError, TimeoutError):
        return None

    choices = response.get("choices", [])
    if not choices:
        return None
    message = choices[0].get("message", {})
    text = str(message.get("content", "")).strip()
    if not text:
        return None
    return LocalLLMResponse(text=text, provider="modelo local")


def build_prompt(query: str, sources: list[SearchResult]) -> str:
    blocks = []
    for index, source in enumerate(sources, start=1):
        blocks.append(
            "\n".join(
                [
                    f"[{index}] {source.file_name} | {source.location}",
                    f"Ruta: {source.relative_path}",
                    source.snippet[:1200],
                ]
            )
        )
    return (
        f"Consulta o tarea: {query}\n\n"
        "Fuentes recuperadas del Drive local:\n\n"
        + "\n\n".join(blocks)
        + "\n\nResponde con una sintesis util para trabajar, no con una lista mecanica."
    )


def post_json(url: str, payload: dict, *, timeout_seconds: float) -> dict:
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
        return json.loads(response.read().decode("utf-8"))


def is_local_url(url: str) -> bool:
    parsed = urllib.parse.urlparse(url)
    return parsed.scheme in {"http", "https"} and parsed.hostname in {
        "127.0.0.1",
        "::1",
        "localhost",
    }
