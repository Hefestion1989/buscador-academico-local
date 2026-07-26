import type { KnowledgeBase } from "./types";

export const DEMO_BASE_ID = "demo-psicologia-aprendizaje-v1";
export const LEGACY_DEMO_BASE_IDS = ["demo-apa-dsm-v1"];

export function createDemoBase(): KnowledgeBase {
  const now = new Date().toISOString();
  return {
    id: DEMO_BASE_ID,
    name: "Ejemplo · Psicología del aprendizaje",
    createdAt: now,
    updatedAt: now,
    chunks: [
      {
        id: "demo-memory-consolidation",
        sourceId: "openstax-memory-strategies",
        sourceName: "Psychology 2e · Estrategias para mejorar la memoria",
        sourceType: "manual académico abierto",
        location: "capítulo 8.4 · consolidación",
        url: "https://openstax.org/books/psychology-2e/pages/8-4-ways-to-enhance-memory",
        text:
          "La consolidación de la memoria necesita tiempo. Distribuir el estudio en sesiones breves a lo largo de varios días permite que la información se estabilice mejor que concentrar todo el esfuerzo en una sola sesión extensa.",
        metadata: {
          tema: "práctica distribuida",
          área: "memoria y aprendizaje",
        },
      },
      {
        id: "demo-sleep-memory",
        sourceId: "openstax-memory-strategies",
        sourceName: "Psychology 2e · Estrategias para mejorar la memoria",
        sourceType: "manual académico abierto",
        location: "capítulo 8.4 · sueño",
        url: "https://openstax.org/books/psychology-2e/pages/8-4-ways-to-enhance-memory",
        text:
          "Dormir lo suficiente favorece el aprendizaje: durante el sueño, el cerebro organiza y consolida información para almacenarla en la memoria de largo plazo.",
        metadata: {
          tema: "sueño y consolidación",
          área: "psicología cognitiva",
        },
      },
      {
        id: "demo-retrieval-practice",
        sourceId: "openstax-memory-strategies",
        sourceName: "Psychology 2e · Estrategias para mejorar la memoria",
        sourceType: "manual académico abierto",
        location: "capítulo 8.4 · práctica de recuperación",
        url: "https://openstax.org/books/psychology-2e/pages/8-4-ways-to-enhance-memory",
        text:
          "Repasar de forma espaciada, organizar las notas y realizar preguntas o pruebas de práctica ayuda a recuperar la información. Conviene dedicar más tiempo a aquello que todavía no se puede recordar.",
        metadata: {
          tema: "recuperación activa",
          aplicación: "técnicas de estudio",
        },
      },
      {
        id: "demo-sleep-stages",
        sourceId: "openstax-sleep-stages",
        sourceName: "Psychology 2e · Etapas del sueño",
        sourceType: "manual académico abierto",
        location: "capítulo 4.3 · sueño REM y NREM",
        url: "https://openstax.org/books/psychology-2e/pages/4-3-stages-of-sleep",
        text:
          "Las investigaciones relacionan tanto el sueño REM como el sueño NREM con distintos aspectos del aprendizaje y la memoria. El efecto no se reduce a una única etapa del ciclo del sueño.",
        metadata: {
          tema: "etapas del sueño",
          precisión: "participan procesos REM y NREM",
        },
      },
    ],
  };
}
