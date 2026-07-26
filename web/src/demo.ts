import type { KnowledgeBase } from "./types";

export const DEMO_BASE_ID = "demo-apa-dsm-v1";

export function createDemoBase(): KnowledgeBase {
  const now = new Date().toISOString();
  return {
    id: DEMO_BASE_ID,
    name: "Ejemplo · APA y DSM",
    createdAt: now,
    updatedAt: now,
    chunks: [
      {
        id: "demo-dsm-change",
        sourceId: "dsm-ii-change",
        sourceName: "DSM-II · cambio de la sexta impresión",
        sourceType: "registro de ejemplo",
        location: "cambio editorial de 1973",
        url: "https://psychiatryonline.org/doi/book/10.1176/appi.books.9780890420362.dsm-ii-6thprintingchange",
        text:
          "En 1973, la sexta impresión del DSM-II eliminó la homosexualidad como trastorno mental y la sustituyó por la categoría más restringida de trastorno de la orientación sexual.",
        metadata: {
          organismo: "American Psychiatric Association",
          año: "1973",
        },
      },
      {
        id: "demo-board-spitzer",
        sourceId: "position-statement",
        sourceName: "Position Statement on Homosexuality and Civil Rights",
        sourceType: "artículo institucional",
        location: "resumen e historia editorial",
        url: "https://psychiatryonline.org/doi/abs/10.1176/ajp.1974.131.4.497",
        text:
          "La Junta de Fideicomisarios de la American Psychiatric Association aprobó la declaración en su reunión del 14 y 15 de diciembre de 1973. Robert L. Spitzer preparó el texto con la aprobación del grupo de trabajo de nomenclatura; la Asamblea ya lo había respaldado en noviembre.",
        metadata: {
          persona: "Robert L. Spitzer",
          fecha: "14–15 de diciembre de 1973",
        },
      },
      {
        id: "demo-activism",
        sourceId: "psychiatric-news-history",
        sourceName: "Courageous Actions Led to Removal of Homosexuality as a Diagnosis",
        sourceType: "historia institucional",
        location: "reconstrucción histórica, 2019",
        url: "https://psychiatryonline.org/doi/10.1176/appi.pn.2019.10b11",
        text:
          "El cambio no fue obra de una sola persona. La investigación de Evelyn Hooker, la presión de activistas como Frank Kameny y Barbara Gittings, el testimonio de John E. Fryer y el trabajo institucional de Robert Spitzer confluyeron en la decisión. La Asamblea aprobó la propuesta en noviembre de 1973 y la Junta la confirmó en diciembre.",
        metadata: {
          actores:
            "Evelyn Hooker; Frank Kameny; Barbara Gittings; John E. Fryer; Robert Spitzer",
        },
      },
      {
        id: "demo-later-history",
        sourceId: "focus-review",
        sourceName: "Queer Diagnoses · revisión histórica del DSM",
        sourceType: "revisión académica",
        location: "sección sobre DSM-II y DSM-III-R",
        url: "https://psychiatryonline.org/doi/abs/10.1176/appi.focus.18302",
        text:
          "La decisión de 1973 fue ratificada por una votación de miembros de la asociación en 1974, con 58 % a favor. Persistió una categoría para personas angustiadas por su orientación; esa categoría, luego llamada homosexualidad egodistónica, desapareció del DSM-III-R en 1987.",
        metadata: {
          precisión:
            "1973 retiró la homosexualidad en sí; 1987 eliminó la categoría residual.",
        },
      },
    ],
  };
}
