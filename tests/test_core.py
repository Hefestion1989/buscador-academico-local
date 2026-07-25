from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from app.chunker import make_chunks, split_long_text
from app.extractors import TextSegment, extract_txt
from app.indexer import add_in_batches, safe_relative, stable_chunk_id
from app.local_llm import is_local_url
from app.scanner import iter_document_files, path_is_inside
from app.search import canonical_source_key, keyword_overlap, normalize_text, SearchResult


class ChunkerTests(unittest.TestCase):
    def test_long_text_keeps_overlap_and_stable_indices(self) -> None:
        chunks = make_chunks(
            [TextSegment(text="x" * 125, location="pagina 1")],
            chunk_size=50,
            overlap=10,
        )

        self.assertEqual([chunk.chunk_index for chunk in chunks], [0, 1, 2])
        self.assertTrue(all(len(chunk.text) <= 50 for chunk in chunks))
        self.assertEqual(chunks[0].text[-10:], chunks[1].text[:10])
        self.assertEqual(chunks[1].text[-10:], chunks[2].text[:10])

    def test_invalid_overlap_is_rejected_instead_of_looping(self) -> None:
        for overlap in (50, 60):
            with self.subTest(overlap=overlap):
                with self.assertRaises(ValueError):
                    split_long_text("texto largo", chunk_size=50, overlap=overlap)

    def test_invalid_sizes_are_rejected(self) -> None:
        with self.assertRaises(ValueError):
            make_chunks([], chunk_size=0, overlap=0)
        with self.assertRaises(ValueError):
            make_chunks([], chunk_size=50, overlap=-1)


class FileHandlingTests(unittest.TestCase):
    def test_scanner_includes_supported_files_and_ignores_private_noise(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "notas").mkdir()
            (root / "notas" / "tema.MD").write_text("contenido", encoding="utf-8")
            (root / "notas" / "ignorar.jpg").write_bytes(b"imagen")
            (root / ".privado").mkdir()
            (root / ".privado" / "secreto.txt").write_text("no", encoding="utf-8")
            (root / ".venv").mkdir()
            (root / ".venv" / "paquete.txt").write_text("no", encoding="utf-8")
            (root / "~$temporal.docx").write_bytes(b"temporal")

            files = [path.relative_to(root).as_posix() for path in iter_document_files(root)]

        self.assertEqual(files, ["notas/tema.MD"])

    def test_text_extractor_handles_windows_encoding(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "apunte.txt"
            path.write_bytes("Psicología comunitaria\n\nTerritorio".encode("cp1252"))

            segments = extract_txt(path)

        self.assertEqual(
            [(segment.text, segment.location) for segment in segments],
            [
                ("Psicología comunitaria", "linea 1"),
                ("Territorio", "linea 3"),
            ],
        )

    def test_path_containment_and_relative_path_are_resolved(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            document = root / "materia" / "nota.md"
            document.parent.mkdir()
            document.write_text("texto", encoding="utf-8")

            self.assertTrue(path_is_inside(document, root))
            self.assertEqual(safe_relative(document, root), str(Path("materia") / "nota.md"))
            self.assertFalse(path_is_inside(root.parent / "otro.txt", root))


class IndexHelpersTests(unittest.TestCase):
    def test_chunk_ids_are_stable_and_content_sensitive(self) -> None:
        path = Path("material.md")
        first = stable_chunk_id(path, "hash-a", 0)

        self.assertEqual(first, stable_chunk_id(path, "hash-a", 0))
        self.assertNotEqual(first, stable_chunk_id(path, "hash-b", 0))
        self.assertNotEqual(first, stable_chunk_id(path, "hash-a", 1))

    def test_upserts_are_batched_without_losing_items(self) -> None:
        class FakeCollection:
            def __init__(self) -> None:
                self.calls: list[dict] = []

            def upsert(self, **kwargs) -> None:
                self.calls.append(kwargs)

        collection = FakeCollection()
        ids = [str(index) for index in range(5)]
        documents = [f"doc-{index}" for index in range(5)]
        embeddings = [[float(index)] for index in range(5)]
        metadatas = [{"index": index} for index in range(5)]

        add_in_batches(
            collection,
            ids,
            documents,
            embeddings,
            metadatas,
            batch_size=2,
        )

        self.assertEqual([len(call["ids"]) for call in collection.calls], [2, 2, 1])
        self.assertEqual(
            [item for call in collection.calls for item in call["ids"]],
            ids,
        )


class SearchAndPrivacyTests(unittest.TestCase):
    def test_only_loopback_llm_urls_are_accepted(self) -> None:
        accepted = [
            "http://127.0.0.1:1234/v1/chat/completions",
            "http://localhost:1234/v1/chat/completions",
            "https://[::1]/v1/chat/completions",
        ]
        rejected = [
            "https://example.com/v1/chat/completions",
            "file:///tmp/model",
            "http://localhost.example.com/v1/chat/completions",
        ]

        self.assertTrue(all(is_local_url(url) for url in accepted))
        self.assertTrue(all(not is_local_url(url) for url in rejected))

    def test_search_normalizes_accents_and_rewards_exact_phrase(self) -> None:
        self.assertEqual(normalize_text("Psicología—COMUNITARIA"), "psicologia comunitaria")
        self.assertGreater(
            keyword_overlap(
                "psicología comunitaria",
                "Una introducción a la psicologia comunitaria y el territorio.",
            ),
            keyword_overlap("psicología comunitaria", "Psicología general."),
        )

    def test_canonical_source_key_collapses_copy_suffix(self) -> None:
        def result(path: str) -> SearchResult:
            return SearchResult(
                file_name=Path(path).name,
                relative_path=path,
                source_path=path,
                location="linea 1",
                snippet="texto",
                relevance=1.0,
                semantic_relevance=1.0,
                keyword_score=1.0,
                title_score=1.0,
                distance=0.0,
                low_signal_penalty=0.0,
            )

        self.assertEqual(
            canonical_source_key(result("Materia/Copia de Territorio 1.pdf")),
            canonical_source_key(result("Materia/Territorio.pdf")),
        )


if __name__ == "__main__":
    unittest.main()
