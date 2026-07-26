import { describe, expect, it } from "vitest";

import {
  buildEvidenceAnswer,
  cosineSimilarity,
  lexicalScore,
  normalizeText,
  searchChunks,
  selectEvidence,
} from "../src/search";
import { normalizeOcrText, pageNeedsOcr } from "../src/ocr";
import { sourceFromPastedText } from "../src/parser";
import type { SourceChunk } from "../src/types";

const chunks: SourceChunk[] = [
  {
    id: "1",
    sourceId: "historia",
    sourceName: "Historia del aprendizaje observacional",
    sourceType: "pdf",
    location: "página 121",
    text:
      "Albert Bandura dirigió el estudio. El 12 de noviembre de 1961, el equipo presentó los resultados sobre aprendizaje observacional y conducta imitativa.",
    embedding: [1, 0],
  },
  {
    id: "2",
    sourceId: "manual",
    sourceName: "Manual de memoria",
    sourceType: "pdf",
    location: "página 10",
    text:
      "La práctica distribuida y el sueño ayudan a consolidar información en la memoria de largo plazo.",
    embedding: [0, 1],
  },
];

describe("normalización y búsqueda literal", () => {
  it("normaliza tildes y premia las coincidencias relevantes", () => {
    expect(normalizeText("Psicología—COMUNITARIA")).toBe(
      "psicologia comunitaria",
    );
    expect(
      lexicalScore(
        "práctica memoria",
        "La práctica distribuida favorece la memoria de largo plazo.",
      ),
    ).toBeGreaterThan(lexicalScore("práctica memoria", "Revisión clínica."));
  });

  it("lleva la fecha y la persona a la respuesta respaldada", () => {
    const query =
      "¿Cuándo presentó Bandura el estudio y quién dirigió el equipo?";
    const hits = searchChunks(query, chunks, "literal");
    const answer = buildEvidenceAnswer(query, hits);

    expect(hits[0]?.sourceName).toBe("Historia del aprendizaje observacional");
    expect(answer.passages[0]?.text).toContain("12 de noviembre de 1961");
    expect(answer.passages.some((passage) => passage.text.includes("Bandura"))).toBe(
      true,
    );
  });

  it("conserva la línea inicial de cada bloque pegado", () => {
    const source = sourceFromPastedText(
      "Notas",
      "Primer bloque\nen dos líneas.\n\nSegundo bloque.",
    );

    expect(source.segments.map((segment) => segment.location)).toEqual([
      "línea 1",
      "línea 4",
    ]);
  });
});

describe("búsqueda conceptual", () => {
  it("combina coseno y palabras en modo híbrido", () => {
    const hits = searchChunks(
      "aprendizaje por observación e imitación",
      chunks,
      "hybrid",
      [0.98, 0.02],
    );

    expect(hits[0]?.id).toBe("1");
    expect(hits[0]?.semanticScore).toBeGreaterThan(0.9);
  });

  it("calcula similitud coseno defensivamente", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1], [1, 0])).toBe(0);
    expect(cosineSimilarity(undefined, [1, 0])).toBe(0);
  });

  it("elige una ventana centrada en la evidencia", () => {
    const filler = "Introducción general sin datos concretos. ".repeat(30);
    const text = `${filler}El 12 de noviembre de 1961, Bandura presentó los resultados del aprendizaje observacional. ${filler}`;
    expect(selectEvidence(text, "cuando presentó Bandura aprendizaje")).toContain(
      "12 de noviembre de 1961",
    );
  });
});

describe("detección y normalización para OCR", () => {
  it("detecta páginas sin suficiente texto seleccionable", () => {
    expect(pageNeedsOcr("12")).toBe(true);
    expect(
      pageNeedsOcr(
        "Este párrafo contiene suficiente texto seleccionable para buscarlo sin aplicar reconocimiento óptico.",
      ),
    ).toBe(false);
  });

  it("limpia espacios sin destruir la separación entre párrafos", () => {
    expect(normalizeOcrText("Primera   línea\r\n\r\n\r\nSegunda línea  ")).toBe(
      "Primera línea\n\nSegunda línea",
    );
  });
});
