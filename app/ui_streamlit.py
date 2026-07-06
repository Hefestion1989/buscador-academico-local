from __future__ import annotations

from pathlib import Path

import streamlit as st

from app.answer import answer_question
from app.config import DEFAULT_MIN_RELEVANCE, DEFAULT_TOP_K, FILES_METADATA_PATH
from app.embeddings import warm_up_model
from app.indexer import load_metadata, sync_index
from app.search import semantic_search


st.set_page_config(
    page_title="Buscador academico local",
    page_icon="search",
    layout="wide",
)


def metadata_stats() -> tuple[dict, int, int]:
    metadata = load_metadata()
    files = metadata.get("files", {})
    indexed = sum(1 for info in files.values() if info.get("status") == "indexado")
    empty = sum(
        1 for info in files.values() if info.get("status") == "sin_texto_extraible"
    )
    return metadata, indexed, empty


st.title("Buscador academico local")

metadata, indexed_files, empty_files = metadata_stats()

with st.sidebar:
    st.header("Indice")
    default_root = metadata.get("root", "")
    root_input = st.text_input(
        "Carpeta local de materiales",
        value=default_root,
        placeholder=r"C:\Users\tu_usuario\Documents\Materiales Facultad",
    )
    reindex_all = st.checkbox("Reindexar todo", value=False)
    update_index = st.button("Actualizar indice", type="primary")

    st.divider()
    st.metric("Archivos indexados", indexed_files)
    st.metric("Sin texto extraible", empty_files)
    st.caption("Indice local")
    st.code(str(FILES_METADATA_PATH.parent), language="text")

    st.divider()
    prepare_model = st.checkbox("Preparar motor al abrir", value=True)

if prepare_model:
    with st.spinner("Preparando motor semantico local..."):
        warm_up_model()

if update_index:
    root_path = Path(root_input).expanduser()
    progress_area = st.empty()
    with st.spinner("Leyendo documentos y actualizando el indice..."):
        try:
            result = sync_index(
                root_path,
                reindex_all=reindex_all,
                progress=lambda message: progress_area.info(message),
            )
            progress_area.empty()
            st.success(
                "Indice actualizado: "
                f"{result.scanned} archivos revisados, "
                f"{result.indexed} indexados, "
                f"{result.skipped} sin cambios, "
                f"{result.removed} removidos, "
                f"{result.empty} sin texto, "
                f"{result.chunks_added} fragmentos nuevos."
            )
            if result.errors:
                with st.expander("Ver errores de lectura"):
                    for error in result.errors:
                        st.write(error)
        except Exception as exc:
            progress_area.empty()
            st.error(str(exc))

with st.form("search_form"):
    query = st.text_area(
        "Concepto, pregunta o busqueda",
        placeholder=(
            "Ej: territorio | que es demanda | intervencion comunitaria y territorio"
        ),
        height=95,
    )
    col_a, col_b, col_c, col_d = st.columns([1, 1, 1, 1])
    with col_a:
        top_k = st.slider(
            "Fuentes",
            min_value=3,
            max_value=18,
            value=DEFAULT_TOP_K,
        )
    with col_b:
        min_relevance = st.slider(
            "Relevancia minima",
            min_value=0.10,
            max_value=0.70,
            value=DEFAULT_MIN_RELEVANCE,
            step=0.02,
        )
    with col_c:
        prefer_specific = st.checkbox("Priorizar especificos", value=True)
    with col_d:
        use_local_llm = st.checkbox("Modelo local", value=True)

    submitted = st.form_submit_button("Responder con fuentes", type="primary")

if submitted and query.strip():
    tabs = st.tabs(["Respuesta", "Fragmentos"])
    with st.spinner("Buscando en el indice local..."):
        local_answer = answer_question(
            query,
            top_k=top_k,
            min_relevance=min_relevance,
            prefer_specific=prefer_specific,
            use_local_llm=use_local_llm,
        )
        results = semantic_search(
            query,
            top_k=top_k,
            min_relevance=min_relevance,
            max_results_per_file=2,
            prefer_specific=prefer_specific,
        )

    with tabs[0]:
        st.caption(f"Modo: {local_answer.mode}")
        st.markdown(local_answer.text)
        if local_answer.sources:
            st.subheader("Fuentes")
            for source in local_answer.sources:
                with st.expander(
                    f"[{source.index}] {source.file_name} | {source.location}"
                ):
                    st.caption(f"Relevancia: {source.relevance:.0%}")
                    st.code(source.relative_path, language="text")
                    st.write(source.excerpt)

    with tabs[1]:
        if results:
            for index, item in enumerate(results, start=1):
                header_cols = st.columns([6, 1])
                with header_cols[0]:
                    st.subheader(f"{index}. {item.file_name}")
                    st.caption(f"{item.relative_path} | {item.location}")
                with header_cols[1]:
                    st.metric("Relevancia", f"{item.relevance:.0%}")
                st.write(item.snippet)
                st.divider()
        else:
            st.info("No aparecieron resultados para esa consulta.")
elif not submitted:
    st.info(
        f"Archivos en el indice local: {indexed_files}. "
        "Escribi un concepto o una pregunta y ejecuta la busqueda."
    )
