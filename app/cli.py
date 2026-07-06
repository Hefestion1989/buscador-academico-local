from __future__ import annotations

import argparse
import sys
from pathlib import Path

from app.answer import answer_question
from app.embeddings import warm_up_model
from app.indexer import sync_index
from app.search import semantic_search


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Buscador semantico local para materiales academicos."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    index_parser = subparsers.add_parser("index", help="Actualizar el indice local.")
    index_parser.add_argument("--root", required=True, help="Carpeta a recorrer.")
    index_parser.add_argument(
        "--reindex",
        action="store_true",
        help="Borrar el indice actual y volver a indexar todo.",
    )

    search_parser = subparsers.add_parser("search", help="Buscar en el indice local.")
    search_parser.add_argument("--query", required=True, help="Consulta conceptual.")
    search_parser.add_argument("--top-k", type=int, default=8, help="Cantidad de resultados.")
    search_parser.add_argument(
        "--min-relevance",
        type=float,
        default=0.32,
        help="Relevancia minima local.",
    )

    answer_parser = subparsers.add_parser(
        "answer",
        help="Responder con fuentes del indice local.",
    )
    answer_parser.add_argument("--query", required=True, help="Pregunta o tarea.")
    answer_parser.add_argument("--top-k", type=int, default=8, help="Cantidad de fuentes.")
    answer_parser.add_argument(
        "--no-local-llm",
        action="store_true",
        help="No intentar usar un modelo local abierto en localhost.",
    )

    subparsers.add_parser("warmup", help="Preparar el modelo local en memoria.")

    args = parser.parse_args()

    if args.command == "index":
        result = sync_index(
            Path(args.root),
            reindex_all=args.reindex,
            progress=lambda message: print(message),
        )
        print(
            "Listo: "
            f"{result.scanned} revisados, "
            f"{result.indexed} indexados, "
            f"{result.skipped} sin cambios, "
            f"{result.removed} removidos, "
            f"{result.empty} sin texto, "
            f"{result.chunks_added} fragmentos agregados."
        )
        if result.errors:
            print("\nErrores:")
            for error in result.errors:
                print(f"- {error}")

    if args.command == "search":
        results = semantic_search(
            args.query,
            top_k=args.top_k,
            min_relevance=args.min_relevance,
        )
        for index, item in enumerate(results, start=1):
            print(f"\n[{index}] {item.file_name} ({item.relevance:.0%})")
            print(f"    {item.relative_path} - {item.location}")
            print(f"    {item.snippet}")

    if args.command == "answer":
        answer = answer_question(
            args.query,
            top_k=args.top_k,
            use_local_llm=not args.no_local_llm,
        )
        print(answer.text)
        if answer.sources:
            print("\nFuentes:")
            for source in answer.sources:
                print(
                    f"[{source.index}] {source.file_name} "
                    f"({source.location}, {source.relevance:.0%})"
                )
                print(f"    {source.relative_path}")

    if args.command == "warmup":
        warm_up_model()
        print("Motor local preparado.")


if __name__ == "__main__":
    main()
