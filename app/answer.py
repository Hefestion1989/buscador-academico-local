from __future__ import annotations

import re
from dataclasses import dataclass

from app.config import DEFAULT_MIN_RELEVANCE, DEFAULT_TOP_K
from app.local_llm import generate_local_answer
from app.search import SearchResult, keyword_overlap, semantic_search


@dataclass(frozen=True)
class AnswerSource:
    index: int
    file_name: str
    relative_path: str
    source_path: str
    location: str
    relevance: float
    excerpt: str


@dataclass(frozen=True)
class LocalAnswer:
    text: str
    sources: list[AnswerSource]
    mode: str
    concept: str | None = None


CONCEPT_ALIASES = {
    "territori": "territorio",
    "territor": "territorio",
    "territorialida": "territorialidad",
    "subjetivida": "subjetividad",
    "intervencion": "intervencion",
    "intervencione": "intervencion",
    "comunitari": "comunitario",
}


def answer_question(
    query: str,
    *,
    top_k: int = DEFAULT_TOP_K,
    min_relevance: float = DEFAULT_MIN_RELEVANCE,
    prefer_specific: bool = True,
    use_local_llm: bool = True,
) -> LocalAnswer:
    concept = extract_concept(query)
    search_query = build_concept_search_query(concept, query) if concept else query
    results = semantic_search(
        search_query,
        top_k=top_k,
        candidate_k=max(top_k * 10, 60) if concept else max(top_k * 8, 40),
        min_relevance=min(min_relevance, 0.24) if concept else min_relevance,
        max_results_per_file=3,
        prefer_specific=prefer_specific,
    )
    sources = [
        AnswerSource(
            index=index,
            file_name=result.file_name,
            relative_path=result.relative_path,
            source_path=result.source_path,
            location=result.location,
            relevance=result.relevance,
            excerpt=result.snippet,
        )
        for index, result in enumerate(results, start=1)
    ]

    if not results:
        return LocalAnswer(
            text=(
                "No encontré evidencia fuerte en el índice local para responder. "
                "Probá con otros términos o actualizá el índice si agregaste archivos nuevos."
            ),
            sources=[],
            mode="sin resultados",
            concept=concept,
        )

    if use_local_llm:
        llm_query = build_llm_query(query, concept) if concept else query
        llm_answer = generate_local_answer(llm_query, results, timeout_seconds=35)
        if llm_answer:
            return LocalAnswer(
                text=llm_answer.text,
                sources=sources_for_text(llm_answer.text, sources),
                mode=llm_answer.provider,
                concept=concept,
            )

    if concept:
        text = build_concept_answer(concept, results)
        return LocalAnswer(
            text=text,
            sources=sources_for_text(text, sources),
            mode="concepto local con fuentes",
            concept=concept,
        )

    text = build_extractive_answer(query, results)
    return LocalAnswer(
        text=text,
        sources=sources_for_text(text, sources),
        mode="síntesis local extractiva",
        concept=None,
    )


def extract_concept(query: str) -> str | None:
    normalized = normalize_query(query)
    if not normalized:
        return None
    if "construccion" in normalized and "demanda" in normalized:
        return "construccion de la demanda"

    patterns = [
        r"^(?:que es|que significa|defini|definicion de|concepto de|explica|explicame|desarrolla)\s+(.+)$",
        r"^(?:el concepto de|la idea de|nocion de)\s+(.+)$",
    ]
    for pattern in patterns:
        match = re.match(pattern, normalized)
        if match:
            return normalize_concept_label(match.group(1))

    tokens = [token for token in normalized.split() if len(token) >= 3]
    if 1 <= len(tokens) <= 3:
        return normalize_concept_label(" ".join(tokens))
    return None


def normalize_concept_label(text: str) -> str:
    text = re.sub(r"\b(concepto|definicion|sobre|acerca|segun|fuentes|drive)\b", " ", text)
    text = re.sub(r"\s+", " ", text).strip(" ?.,;:")
    if text in CONCEPT_ALIASES:
        return CONCEPT_ALIASES[text]
    parts = []
    for token in text.split():
        parts.append(CONCEPT_ALIASES.get(token, token))
    label = " ".join(parts).strip()
    if label.endswith("i") and len(label) > 6:
        label = label + "o"
    return label


def build_concept_search_query(concept: str, original_query: str) -> str:
    variants = concept_variants(concept)
    return " ".join([concept, *variants, concept, original_query])


def concept_variants(concept: str) -> list[str]:
    variants = [concept]
    if concept == "territorio":
        variants.extend(
            [
                "territorial",
                "territorialidad",
                "territorios",
                "espacio social",
                "barrio",
                "actores territoriales",
                "organizacion comunitaria",
            ]
        )
    elif concept == "construccion de la demanda":
        variants.extend(
            [
                "demanda barrial",
                "demandas identificadas",
                "demandas circulan",
                "enunciar demandas",
                "actores logran enunciar demandas",
                "necesidades del territorio",
                "problema de intervencion",
                "intervencion comunitaria",
            ]
        )
    elif concept.endswith("cion"):
        variants.extend([concept + "es", concept.replace("cion", "cional")])
    elif concept.endswith("dad"):
        variants.append(concept[:-3] + "des")
    return list(dict.fromkeys(variants))


def build_llm_query(query: str, concept: str) -> str:
    return (
        f"Defini conceptualmente '{concept}' usando solo las fuentes locales. "
        "No te limites a decir donde aparece: explica que significa, sus rasgos, "
        "matices y una definicion de trabajo con citas. "
        f"Consulta original: {query}"
    )


def build_concept_answer(concept: str, results: list[SearchResult]) -> str:
    claims = _rank_claims(concept, results, require_anchor=True)
    if not claims:
        claims = _rank_claims(concept, results, require_anchor=False)
    themes = detect_themes(concept, results)
    if not claims:
        claims = fallback_claims(results)

    definition_parts = []
    for label, words in themes:
        source_index = first_source_for_theme(words, results)
        if source_index:
            definition_parts.append((label, source_index))

    lines = [
        f"**Concepto: {concept}**",
        "",
        build_definition_sentence(concept, definition_parts, claims),
        "",
        "**Rasgos principales en tus fuentes:**",
    ]

    for claim, source_index in claims[:6]:
        lines.append(f"- {claim} [{source_index}]")

    lines.extend(
        [
            "",
            "**Definición de trabajo:**",
            build_working_definition(concept, definition_parts, claims),
        ]
    )
    return "\n".join(lines)


def build_definition_sentence(
    concept: str,
    definition_parts: list[tuple[str, int]],
    claims: list[tuple[str, int]],
) -> str:
    if definition_parts:
        labels = ", ".join(label for label, _ in definition_parts[:4])
        citations = citation_list(source for _, source in definition_parts[:4])
        return (
            f"En tus materiales, **{concept}** no queda como una palabra aislada: "
            f"aparece como una noción que articula {labels}. {citations}"
        )
    source_index = claims[0][1]
    return (
        f"En tus materiales, **{concept}** se reconstruye a partir de varios usos "
        f"y ejemplos, más que como una definición única cerrada. [{source_index}]"
    )


def build_working_definition(
    concept: str,
    definition_parts: list[tuple[str, int]],
    claims: list[tuple[str, int]],
) -> str:
    citations = citation_list(
        [source for _, source in definition_parts[:4]] or [source for _, source in claims[:3]]
    )
    if definition_parts:
        labels = ", ".join(label for label, _ in definition_parts[:4])
        return (
            f"Para usarlo en una tarea, podés tomar **{concept}** como una categoría "
            f"de lectura que permite ordenar {labels}, siempre apoyándote en las "
            f"fuentes recuperadas. {citations}"
        )
    return (
        f"Para usarlo en una tarea, conviene presentar **{concept}** como una categoría "
        f"que se define por los rasgos repetidos en las fuentes recuperadas. {citations}"
    )


def detect_themes(concept: str, results: list[SearchResult]) -> list[tuple[str, set[str]]]:
    concept = normalize_query(concept)
    if concept == "territorio":
        theme_defs = [
            ("espacio social y material", {"espacio", "barrio", "zona", "sector", "ruta", "cuenca"}),
            ("historia y procesos de construcción", {"historia", "historico", "origen", "autoconstruccion", "prolongada"}),
            ("actores y organización comunitaria", {"actores", "vecinal", "comunitaria", "referentes", "organizacion", "comision"}),
            ("demandas y condiciones de vida", {"demandas", "infraestructura", "vulnerabilidad", "carencias", "necesidades"}),
            ("intervenciones e instituciones", {"intervenciones", "institucionales", "programas", "estado", "servicios", "caif"}),
            ("diferencias internas", {"homogeneo", "diferenciacion", "norte", "sur", "distincion", "heterogeneo"}),
        ]
    elif concept == "construccion de la demanda":
        theme_defs = [
            ("necesidades que se vuelven formulables", {"demanda", "demandas", "necesidades", "problema"}),
            ("actores que logran enunciarla", {"actores", "vecinos", "referentes", "comision", "comunitaria"}),
            ("condiciones territoriales que la orientan", {"territorio", "barrio", "infraestructura", "vulnerabilidad"}),
            ("intervencion posible", {"intervencion", "linea", "trabajo", "recursos", "institucional"}),
        ]
    elif concept == "demanda":
        theme_defs = [
            ("necesidad, pedido o reclamo formulado", {"demanda", "demandas", "necesidad", "pedido", "reclamo"}),
            ("actores que pueden enunciarla", {"actores", "vecinos", "referentes", "sujeto", "comunidad"}),
            ("condiciones institucionales que la vuelven atendible", {"institucionales", "intervencion", "programa", "servicios"}),
            ("uso económico del término", {"mercado", "consumo", "precios", "existencias", "produccion"}),
        ]
    else:
        theme_defs = [
            ("definiciones y usos explícitos del término", {concept}),
            ("relaciones con otros conceptos", {"relacion", "articula", "vincula", "asocia"}),
            ("rasgos o dimensiones mencionadas", {"dimensiones", "rasgos", "caracteristicas", "elementos"}),
        ]
    text = normalize_query("\n".join(result.snippet for result in results))
    found = []
    for label, words in theme_defs:
        if any(word in text for word in words):
            found.append((label, words))
    return found


def first_source_for_theme(words: set[str], results: list[SearchResult]) -> int | None:
    for index, result in enumerate(results, start=1):
        text = normalize_query(result.snippet)
        if any(word in text for word in words):
            return index
    return None


def citation_list(indexes: list[int]) -> str:
    unique = []
    for index in indexes:
        if index not in unique:
            unique.append(index)
    return "".join(f"[{index}]" for index in unique)


def sources_for_text(text: str, sources: list[AnswerSource]) -> list[AnswerSource]:
    cited = {int(match) for match in re.findall(r"\[(\d+)\]", text)}
    if not cited:
        return sources
    return [source for source in sources if source.index in cited]


def normalize_query(text: str) -> str:
    replacements = str.maketrans("áéíóúüñ", "aeiouun")
    return text.lower().translate(replacements).strip()


def build_extractive_answer(query: str, results: list[SearchResult]) -> str:
    claims = rank_claims(query, results)
    if not claims:
        claims = [
            (result.snippet[:360].strip(), index)
            for index, result in enumerate(results[:4], start=1)
            if result.snippet.strip()
        ]

    lines = [
        "Con lo que aparece en tus materiales locales, las pistas más fuertes son:",
        "",
    ]
    for claim, source_index in claims[:6]:
        lines.append(f"- {claim} [{source_index}]")

    if len(results) >= 2:
        lines.extend(
            [
                "",
                "La lectura conviene hacerla cruzando esas fuentes, porque el índice encontró coincidencias en más de un documento.",
            ]
        )
    return "\n".join(lines)


def rank_claims(query: str, results: list[SearchResult]) -> list[tuple[str, int]]:
    return _rank_claims(query, results, require_anchor=False)


def _rank_claims(
    query: str,
    results: list[SearchResult],
    *,
    require_anchor: bool,
) -> list[tuple[str, int]]:
    candidates: list[tuple[float, str, int]] = []
    anchors = concept_anchor_terms(query)
    for source_index, result in enumerate(results, start=1):
        for unit in split_units(result.snippet):
            if looks_fragmentary(unit):
                continue
            if require_anchor and not contains_any_anchor(unit, anchors):
                continue
            score = (
                keyword_overlap(query, unit) * 0.52
                + result.relevance * 0.30
                + question_intent_bonus(query, unit)
            )
            if contains_any_anchor(unit, anchors):
                score += 0.18
            if score >= 0.18:
                candidates.append((score, clean_unit(unit), source_index))

    candidates.sort(key=lambda item: item[0], reverse=True)
    selected: list[tuple[str, int]] = []
    seen: set[str] = set()
    for _, claim, source_index in candidates:
        key = normalize_for_dedupe(claim)
        if not key or key in seen:
            continue
        if any(claim_is_too_similar(key, normalize_for_dedupe(existing)) for existing, _ in selected):
            continue
        selected.append((claim, source_index))
        seen.add(key)
        if len(selected) >= 8:
            break
    return selected


def fallback_claims(results: list[SearchResult]) -> list[tuple[str, int]]:
    claims = []
    for index, result in enumerate(results[:5], start=1):
        for unit in split_units(result.snippet):
            if not looks_fragmentary(unit):
                claims.append((clean_unit(unit), index))
                break
    return claims


def concept_anchor_terms(query: str) -> set[str]:
    concept = normalize_concept_label(normalize_query(query))
    terms = set(concept_variants(concept))
    terms.add(concept)
    if concept.endswith("o"):
        terms.add(concept[:-1])
    if concept.endswith("a"):
        terms.add(concept[:-1])
    return {normalize_query(term) for term in terms if len(term) >= 4}


def contains_any_anchor(text: str, anchors: set[str]) -> bool:
    normalized = normalize_query(text)
    return any(anchor in normalized for anchor in anchors)


def split_units(text: str) -> list[str]:
    # PDF extractors preserve visual line wraps. Splitting on every newline turns
    # a complete sentence into several lowercase fragments, which then prevents
    # the most useful evidence from reaching the answer.
    text = re.sub(r"\s+", " ", text).strip()
    units: list[str] = []
    for paragraph in re.split(r"(?<=[.!?])\s+", text):
        paragraph = paragraph.strip(" -\t\r\n")
        if 70 <= len(paragraph) <= 520:
            units.append(paragraph)
        elif len(paragraph) > 520:
            units.extend(chunk_long_unit(paragraph))
    return units


def question_intent_bonus(query: str, text: str) -> float:
    normalized_query = normalize_query(query)
    bonus = 0.0

    if any(term in normalized_query for term in ("cuando", "fecha", "momento", "ano")):
        if re.search(
            r"\b\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+(?:18|19|20)\d{2}\b",
            text,
            flags=re.IGNORECASE,
        ):
            bonus += 0.48
        elif re.search(r"\b(?:18|19|20)\d{2}\b", text):
            bonus += 0.28

    if any(term in normalized_query for term in ("quien", "quienes", "persona", "autor")):
        if re.search(
            r"\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)+\b",
            text,
        ):
            bonus += 0.16

    if any(
        term in normalized_query
        for term in ("saco", "retiro", "elimino", "acepto", "cambio", "dejo")
    ):
        normalized_text = normalize_query(text)
        if any(
            term in normalized_text
            for term in (
                "suprim",
                "retir",
                "elimin",
                "acept",
                "reemplaz",
                "dejo de",
                "cambio",
            )
        ):
            bonus += 0.18

    return bonus


def chunk_long_unit(text: str, size: int = 360) -> list[str]:
    words = text.split()
    chunks: list[str] = []
    current: list[str] = []
    for word in words:
        current.append(word)
        if len(" ".join(current)) >= size:
            chunks.append(" ".join(current))
            current = []
    if current:
        chunks.append(" ".join(current))
    return chunks


def clean_unit(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    return text[:520].rstrip()


def looks_fragmentary(text: str) -> bool:
    text = text.strip()
    words = text.split()
    if len(words) < 8:
        return True
    first = text[:1]
    if first and first.islower():
        return True
    if first in {"(", ")", ",", ";", ":"}:
        return True
    if text.count("(") > text.count(")"):
        return True
    return False


def normalize_for_dedupe(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()[:160]


def claim_is_too_similar(left: str, right: str) -> bool:
    left_tokens = set(left.split())
    right_tokens = set(right.split())
    if not left_tokens or not right_tokens:
        return False
    overlap = len(left_tokens & right_tokens) / min(len(left_tokens), len(right_tokens))
    return overlap >= 0.72
