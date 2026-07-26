import { describe, expect, it } from "vitest";

import {
  buildEvidenceAnswer,
  cosineSimilarity,
  lexicalScore,
  normalizeText,
  searchChunks,
  selectEvidence,
} from "../src/search";
import { sourceFromPastedText } from "../src/parser";
import type { SourceChunk } from "../src/types";

const chunks: SourceChunk[] = [
  {
    id: "1",
    sourceId: "historia",
    sourceName: "Historia del DSM",
    sourceType: "pdf",
    location: "página 121",
    text:
      "Robert L. Spitzer presentó la propuesta. El 15 de diciembre de 1973, la junta directiva de la APA aceptó la recomendación y retiró la homosexualidad como trastorno del DSM-II.",
    embedding: [1, 0],
  },
  {
    id: "2",
    sourceId: "manual",
    sourceName: "DSM-5-TR",
    sourceType: "pdf",
    location: "página 10",
    text:
      "El manual moderno incluye procesos continuos de revisión y varios grupos de trabajo.",
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
        "homosexualidad DSM",
        "La homosexualidad fue retirada del DSM-II.",
      ),
    ).toBeGreaterThan(lexicalScore("homosexualidad DSM", "Revisión clínica."));
  });

  it("lleva la fecha y la persona a la respuesta respaldada", () => {
    const query =
      "¿Cuándo sacó la APA la homosexualidad del DSM y quién impulsó el cambio?";
    const hits = searchChunks(query, chunks, "literal");
    const answer = buildEvidenceAnswer(query, hits);

    expect(hits[0]?.sourceName).toBe("Historia del DSM");
    expect(answer.passages[0]?.text).toContain("15 de diciembre de 1973");
    expect(answer.passages.some((passage) => passage.text.includes("Spitzer"))).toBe(
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
      "momento de despatologización de la orientación sexual",
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
    const text = `${filler}El 15 de diciembre de 1973, la APA confirmó el cambio del DSM-II. ${filler}`;
    expect(selectEvidence(text, "cuando confirmó APA DSM")).toContain(
      "15 de diciembre de 1973",
    );
  });
});
