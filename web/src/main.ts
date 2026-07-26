import "./style.css";

import { createDemoBase, DEMO_BASE_ID } from "./demo";
import {
  chunksFromSources,
  parseFiles,
  sourceFromPastedText,
} from "./parser";
import { buildEvidenceAnswer, searchChunks, tokenize } from "./search";
import {
  SEMANTIC_MODEL,
  SemanticEngine,
  type SemanticProgress,
} from "./semantic";
import {
  deleteKnowledgeBase,
  listKnowledgeBases,
  saveKnowledgeBase,
} from "./storage";
import type {
  KnowledgeBase,
  SearchHit,
  SearchMode,
  SourceChunk,
} from "./types";

const EXAMPLE_QUERY =
  "¿Cuándo sacó la APA la homosexualidad del DSM, quién participó y en qué momento?";
const LAST_BASE_KEY = "rastreador-last-base";
const DEMO_DISMISSED_KEY = "rastreador-demo-dismissed";

interface AppState {
  bases: KnowledgeBase[];
  currentId: string;
  query: string;
  mode: SearchMode;
  hits: SearchHit[];
  searched: boolean;
  busy: boolean;
  notice: string;
  noticeTone: "info" | "success" | "error";
  progress?: SemanticProgress;
}

const rootElement = document.querySelector<HTMLDivElement>("#app");
if (!rootElement) {
  throw new Error("No se encontró el contenedor de la aplicación.");
}
const root: HTMLDivElement = rootElement;

const state: AppState = {
  bases: [],
  currentId: "",
  query: EXAMPLE_QUERY,
  mode: "hybrid",
  hits: [],
  searched: false,
  busy: false,
  notice: "",
  noticeTone: "info",
};

let semanticEngine: SemanticEngine | undefined;

void initialize();

async function initialize(): Promise<void> {
  try {
    state.bases = await listKnowledgeBases();
    const dismissedDemo = localStorage.getItem(DEMO_DISMISSED_KEY) === "1";
    if (
      !dismissedDemo &&
      !state.bases.some((base) => base.id === DEMO_BASE_ID)
    ) {
      const demo = createDemoBase();
      await saveKnowledgeBase(demo);
      state.bases.unshift(demo);
    }
    if (!state.bases.length) {
      const empty = createEmptyBase("Mi primera base");
      await saveKnowledgeBase(empty);
      state.bases.push(empty);
    }
    const remembered = localStorage.getItem(LAST_BASE_KEY);
    state.currentId =
      state.bases.find((base) => base.id === remembered)?.id ??
      state.bases[0]?.id ??
      "";
  } catch (error) {
    const demo = createDemoBase();
    state.bases = [demo];
    state.currentId = demo.id;
    setNotice(
      `El navegador no permitió guardar bases todavía: ${errorMessage(error)}`,
      "error",
    );
  }
  render();
}

function render(): void {
  const base = currentBase();
  const sourceCount = countSources(base.chunks);
  const semanticCount = base.chunks.filter(
    (chunk) => chunk.embedding?.length,
  ).length;
  const semanticReady =
    base.chunks.length > 0 && semanticCount === base.chunks.length;

  root.innerHTML = `
    <div class="site-shell">
      <header class="topbar">
        <a class="brand" href="#" aria-label="Rastreador de Ideas, inicio">
          <span class="brand-mark" aria-hidden="true">
            <span></span><span></span><span></span>
          </span>
          <span>
            <strong>Rastreador de Ideas</strong>
            <small>buscar · ubicar · verificar</small>
          </span>
        </a>
        <div class="topbar-actions">
          <span class="privacy-badge"><i aria-hidden="true"></i> Procesamiento local</span>
          <a
            class="github-link"
            href="https://github.com/Hefestion1989/buscador-academico-local"
            target="_blank"
            rel="noreferrer"
          >Código abierto ↗</a>
        </div>
      </header>

      <main>
        <section class="hero" aria-labelledby="hero-title">
          <div class="hero-copy">
            <p class="eyebrow">TU INFORMACIÓN, CON EVIDENCIA A LA VISTA</p>
            <h1 id="hero-title">Preguntá por una idea.<br />Volvé al pasaje exacto.</h1>
            <p>
              Cargá documentos o tablas, escribí una pregunta normal y encontrá
              <strong>qué dice la base, dónde lo dice y de qué fuente salió</strong>.
            </p>
          </div>

          <form class="search-card" id="search-form">
            <label for="query">Idea, palabra o pregunta</label>
            <textarea
              id="query"
              name="query"
              rows="3"
              placeholder="Ej.: ¿quién tomó la decisión, cuándo y dónde se menciona?"
            >${escapeHtml(state.query)}</textarea>
            <div class="search-controls">
              <label class="mode-control">
                <span>Tipo de búsqueda</span>
                <select id="search-mode" name="mode">
                  <option value="hybrid" ${state.mode === "hybrid" ? "selected" : ""}>Palabras + ideas</option>
                  <option value="literal" ${state.mode === "literal" ? "selected" : ""}>Palabras y frases</option>
                  <option value="semantic" ${state.mode === "semantic" ? "selected" : ""}>Solo ideas</option>
                </select>
              </label>
              <button class="primary-button" type="submit" ${state.busy ? "disabled" : ""}>
                ${state.busy ? '<span class="spinner"></span> Procesando' : "Rastrear en la base"}
              </button>
            </div>
            <div class="example-row">
              <span>Probá:</span>
              <button type="button" class="text-example" id="example-query">
                “¿Cuándo la APA retiró la homosexualidad del DSM?”
              </button>
            </div>
          </form>
        </section>

        ${state.notice ? renderNotice() : ""}

        <section class="workspace">
          <aside class="library-panel" aria-labelledby="library-title">
            <div class="panel-heading">
              <div>
                <p class="section-kicker">01 · PREPARÁ EL CORPUS</p>
                <h2 id="library-title">Tu base</h2>
              </div>
              <button class="icon-button" id="new-base" type="button" title="Crear otra base" aria-label="Crear otra base">+</button>
            </div>

            <label class="field-label" for="base-selector">Base activa</label>
            <select class="base-selector" id="base-selector">
              ${state.bases
                .map(
                  (item) =>
                    `<option value="${escapeAttribute(item.id)}" ${item.id === base.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`,
                )
                .join("")}
            </select>

            <div class="base-stats">
              <div><strong>${sourceCount}</strong><span>fuentes</span></div>
              <div><strong>${base.chunks.length}</strong><span>fragmentos</span></div>
              <div><strong>${semanticCount}</strong><span>con ideas</span></div>
            </div>

            <div
              class="drop-zone"
              id="drop-zone"
              role="button"
              tabindex="0"
              aria-label="Agregar archivos a la base"
            >
              <span class="drop-icon" aria-hidden="true">＋</span>
              <strong>Arrastrá archivos o elegilos</strong>
              <small>PDF, DOCX, TXT, MD, CSV, TSV, JSON, JSONL, RTF, HTML</small>
              <input
                id="file-input"
                type="file"
                multiple
                accept=".pdf,.docx,.txt,.md,.markdown,.csv,.tsv,.json,.jsonl,.ndjson,.rtf,.html,.htm,.xml"
                hidden
              />
            </div>

            <details class="paste-panel">
              <summary>Pegar texto directamente</summary>
              <label for="paste-name">Nombre de la fuente</label>
              <input id="paste-name" type="text" placeholder="Ej.: Entrevista 4" />
              <label for="paste-text">Contenido</label>
              <textarea id="paste-text" rows="5" placeholder="Pegá aquí notas, registros o transcripciones…"></textarea>
              <button class="secondary-button full-width" id="add-pasted-text" type="button">
                Incorporar texto
              </button>
            </details>

            <div class="semantic-card ${semanticReady ? "ready" : ""}">
              <div class="semantic-heading">
                <span class="semantic-orb" aria-hidden="true"></span>
                <div>
                  <strong>${semanticReady ? "Búsqueda por ideas lista" : "Activar búsqueda por ideas"}</strong>
                  <small>
                    ${
                      semanticReady
                        ? "Los fragmentos tienen representación conceptual local."
                        : "Descarga una vez el modelo multilingüe (~135 MB) y lo guarda el navegador."
                    }
                  </small>
                </div>
              </div>
              ${
                state.progress
                  ? `
                    <div class="progress-block" aria-live="polite">
                      <span>${escapeHtml(state.progress.label)}</span>
                      <div class="progress-track"><i style="width:${Math.max(2, Math.min(100, state.progress.percent ?? 8))}%"></i></div>
                    </div>
                  `
                  : ""
              }
              <button
                class="semantic-button"
                id="prepare-semantic"
                type="button"
                ${state.busy || !base.chunks.length ? "disabled" : ""}
              >${semanticReady ? "Revisar índice conceptual" : "Preparar ideas"}</button>
            </div>

            <div class="base-tools">
              <button type="button" id="export-base">Exportar base</button>
              <button type="button" id="restore-base">Importar base</button>
              <button type="button" id="delete-base">Eliminar</button>
              <input id="restore-base-input" type="file" accept=".json" hidden />
            </div>

            <p class="local-note">
              <span aria-hidden="true">⌂</span>
              Los archivos, fragmentos y consultas permanecen en este navegador.
              Al activar ideas, solo se descargan los archivos del modelo.
            </p>
          </aside>

          <section class="results-panel" aria-labelledby="results-title">
            <div class="panel-heading results-heading">
              <div>
                <p class="section-kicker">02 · SEGUÍ LA EVIDENCIA</p>
                <h2 id="results-title">Lo que aparece en la base</h2>
              </div>
              ${
                state.searched
                  ? `<span class="result-count">${state.hits.length} resultado${state.hits.length === 1 ? "" : "s"}</span>`
                  : ""
              }
            </div>
            <div id="results-content">
              ${renderResults(base, semanticReady)}
            </div>
          </section>
        </section>

        <section class="method-strip" aria-label="Cómo funciona">
          <article>
            <span>1</span>
            <div><strong>Fragmenta</strong><p>Conserva archivo, página, fila o línea.</p></div>
          </article>
          <article>
            <span>2</span>
            <div><strong>Compara</strong><p>Combina términos y cercanía conceptual.</p></div>
          </article>
          <article>
            <span>3</span>
            <div><strong>Devuelve evidencia</strong><p>Muestra el pasaje antes de concluir.</p></div>
          </article>
        </section>
      </main>

      <footer>
        <p>
          Rastreador de Ideas no “sabe” más que la base cargada. Su trabajo es
          recuperar evidencia, no fabricar respuestas.
        </p>
        <span>Edición web local · MIT</span>
      </footer>
    </div>
  `;

  bindEvents();
}

function renderResults(base: KnowledgeBase, semanticReady: boolean): string {
  if (!base.chunks.length) {
    return `
      <div class="empty-state">
        <span class="empty-illustration" aria-hidden="true">□</span>
        <h3>Esta base todavía está vacía</h3>
        <p>Agregá documentos, una tabla CSV/JSON o texto pegado. Cada resultado conservará su procedencia.</p>
      </div>
    `;
  }

  if (!state.searched) {
    return `
      <div class="ready-state">
        <div class="ready-line"><i></i><span>${escapeHtml(base.name)}</span></div>
        <h3>La base está lista para una pregunta.</h3>
        <p>
          Podés buscar una expresión exacta o describir una idea. El sistema
          mostrará primero los pasajes que contienen fechas, personas o acciones
          pedidas en la consulta.
        </p>
        ${
          semanticReady
            ? '<span class="status-chip success">✓ Palabras e ideas disponibles</span>'
            : '<span class="status-chip">Palabras listas · ideas opcionales</span>'
        }
        <div class="example-anatomy">
          <span>CONSULTA DE EJEMPLO</span>
          <p>${escapeHtml(EXAMPLE_QUERY)}</p>
          <small>La base de ejemplo distingue la decisión de 1973, sus protagonistas y la categoría residual eliminada en 1987.</small>
        </div>
      </div>
    `;
  }

  if (!state.hits.length) {
    return `
      <div class="empty-state">
        <span class="empty-illustration" aria-hidden="true">?</span>
        <h3>No encontré un pasaje defendible</h3>
        <p>Probá con menos palabras, otro sinónimo o agregá materiales que cubran el tema.</p>
      </div>
    `;
  }

  const answer = buildEvidenceAnswer(state.query, state.hits);
  return `
    <article class="answer-card">
      <div class="answer-label">
        <span>RESPUESTA RESPALDADA</span>
        <small>extractiva · sin completar huecos</small>
      </div>
      <div class="answer-passages">
        ${answer.passages
          .map(
            (passage, index) => `
              <div class="answer-passage">
                <span class="answer-number">${index + 1}</span>
                <div>
                  <p>${highlightHtml(passage.text, state.query)}</p>
                  <a href="#result-${escapeAttribute(passage.hit.id)}">
                    ${escapeHtml(passage.hit.sourceName)} · ${escapeHtml(passage.hit.location)}
                  </a>
                </div>
              </div>
            `,
          )
          .join("")}
      </div>
      <p class="answer-caveat">${escapeHtml(answer.caveat)}</p>
    </article>

    <div class="result-list">
      ${state.hits.map((hit, index) => renderHit(hit, index)).join("")}
    </div>
  `;
}

function renderHit(hit: SearchHit, index: number): string {
  const metadata = Object.entries(hit.metadata ?? {}).slice(0, 5);
  const scorePercent = Math.round(hit.score * 100);
  const kindLabels: Record<SearchHit["matchKind"], string> = {
    frase: "frase",
    palabras: "palabras",
    idea: "idea",
    mixta: "mixta",
  };

  return `
    <article class="result-card" id="result-${escapeAttribute(hit.id)}">
      <div class="result-index">${String(index + 1).padStart(2, "0")}</div>
      <div class="result-body">
        <div class="result-topline">
          <div>
            <span class="source-type">${escapeHtml(hit.sourceType)}</span>
            <h3>${escapeHtml(hit.sourceName)}</h3>
          </div>
          <div class="score" title="Puntaje relativo dentro de esta consulta">
            <strong>${scorePercent}%</strong>
            <span>${kindLabels[hit.matchKind]}</span>
          </div>
        </div>
        <p class="location"><span aria-hidden="true">⌖</span> ${escapeHtml(hit.location)}</p>
        <blockquote>${highlightHtml(hit.evidence, state.query)}</blockquote>
        ${
          metadata.length
            ? `<div class="metadata-row">${metadata
                .map(
                  ([key, value]) =>
                    `<span><b>${escapeHtml(key)}:</b> ${escapeHtml(value)}</span>`,
                )
                .join("")}</div>`
            : ""
        }
        <div class="result-actions">
          ${
            hit.url
              ? `<a href="${escapeAttribute(hit.url)}" target="_blank" rel="noreferrer">Abrir fuente ↗</a>`
              : '<span>Fuente local</span>'
          }
          <details>
            <summary>Ver fragmento completo</summary>
            <p>${escapeHtml(hit.text)}</p>
          </details>
        </div>
      </div>
    </article>
  `;
}

function renderNotice(): string {
  return `
    <div class="notice notice-${state.noticeTone}" role="status">
      <span>${state.noticeTone === "error" ? "!" : state.noticeTone === "success" ? "✓" : "i"}</span>
      <p>${escapeHtml(state.notice)}</p>
      <button id="dismiss-notice" type="button" aria-label="Cerrar aviso">×</button>
    </div>
  `;
}

function bindEvents(): void {
  bind("search-form", "submit", (event) => {
    event.preventDefault();
    void runSearch();
  });
  bind("example-query", "click", () => {
    state.query = EXAMPLE_QUERY;
    const queryInput = document.querySelector<HTMLTextAreaElement>("#query");
    if (queryInput) {
      queryInput.value = state.query;
    }
    void runSearch();
  });
  bind("base-selector", "change", (event) => {
    const select = event.currentTarget as HTMLSelectElement;
    state.currentId = select.value;
    localStorage.setItem(LAST_BASE_KEY, state.currentId);
    state.hits = [];
    state.searched = false;
    state.notice = "";
    render();
  });
  bind("new-base", "click", () => {
    void createBase();
  });
  bind("delete-base", "click", () => {
    void removeCurrentBase();
  });
  bind("export-base", "click", exportCurrentBase);
  bind("restore-base", "click", () => {
    document.querySelector<HTMLInputElement>("#restore-base-input")?.click();
  });
  bind("restore-base-input", "change", (event) => {
    void restoreBase(event);
  });
  bind("file-input", "change", (event) => {
    const files = Array.from((event.currentTarget as HTMLInputElement).files ?? []);
    void importFiles(files);
  });
  bind("drop-zone", "click", () => {
    document.querySelector<HTMLInputElement>("#file-input")?.click();
  });
  bind("drop-zone", "keydown", (event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
      keyboardEvent.preventDefault();
      document.querySelector<HTMLInputElement>("#file-input")?.click();
    }
  });
  const dropZone = document.querySelector<HTMLElement>("#drop-zone");
  if (dropZone) {
    for (const eventName of ["dragenter", "dragover"]) {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropZone.classList.add("dragging");
      });
    }
    for (const eventName of ["dragleave", "drop"]) {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropZone.classList.remove("dragging");
      });
    }
    dropZone.addEventListener("drop", (event) => {
      void importFiles(Array.from(event.dataTransfer?.files ?? []));
    });
  }
  bind("add-pasted-text", "click", () => {
    void importPastedText();
  });
  bind("prepare-semantic", "click", () => {
    void prepareSemanticIndex();
  });
  bind("dismiss-notice", "click", () => {
    state.notice = "";
    render();
  });
}

async function runSearch(): Promise<void> {
  const queryInput = document.querySelector<HTMLTextAreaElement>("#query");
  const modeInput = document.querySelector<HTMLSelectElement>("#search-mode");
  state.query = queryInput?.value.trim() ?? state.query;
  state.mode = (modeInput?.value as SearchMode | undefined) ?? state.mode;
  if (!state.query) {
    setNotice("Escribí una idea, palabra o pregunta para buscar.", "error");
    render();
    return;
  }

  const base = currentBase();
  const semanticCoverage = base.chunks.filter(
    (chunk) => chunk.embedding?.length,
  ).length;
  let queryEmbedding: number[] | undefined;

  state.busy = true;
  state.progress = undefined;
  render();
  try {
    if (state.mode !== "literal" && semanticCoverage > 0) {
      semanticEngine ??= new SemanticEngine();
      await semanticEngine.prepare((progress) => {
        state.progress = progress;
        updateVisibleProgress(progress);
      });
      [queryEmbedding] = await semanticEngine.embed([state.query]);
    }
    state.hits = searchChunks(
      state.query,
      base.chunks,
      state.mode,
      queryEmbedding,
    );
    state.searched = true;
    if (state.mode !== "literal" && semanticCoverage === 0) {
      setNotice(
        "La búsqueda se resolvió por palabras. Activá “Preparar ideas” para sumar similitud conceptual sin enviar tus textos.",
        "info",
      );
    } else {
      state.notice = "";
    }
  } catch (error) {
    setNotice(
      `No pude usar el motor conceptual; mostré coincidencias por palabras. ${errorMessage(error)}`,
      "error",
    );
    state.hits = searchChunks(state.query, base.chunks, "literal");
    state.searched = true;
  } finally {
    state.busy = false;
    state.progress = undefined;
    render();
  }
}

async function importFiles(files: File[]): Promise<void> {
  if (!files.length) {
    return;
  }
  state.busy = true;
  setNotice(`Leyendo ${files.length} archivo${files.length === 1 ? "" : "s"}…`, "info");
  render();
  try {
    const sources = await parseFiles(files);
    const chunks = chunksFromSources(sources);
    const base = currentBase();
    base.chunks.push(...chunks);
    base.semanticModel = undefined;
    base.updatedAt = new Date().toISOString();
    await saveKnowledgeBase(base);
    setNotice(
      `Se incorporaron ${sources.length} fuente${sources.length === 1 ? "" : "s"} y ${chunks.length} fragmentos. Los originales no fueron modificados.`,
      "success",
    );
    state.searched = false;
    state.hits = [];
  } catch (error) {
    setNotice(errorMessage(error), "error");
  } finally {
    state.busy = false;
    render();
  }
}

async function importPastedText(): Promise<void> {
  const name = document.querySelector<HTMLInputElement>("#paste-name")?.value ?? "";
  const text =
    document.querySelector<HTMLTextAreaElement>("#paste-text")?.value.trim() ?? "";
  if (!text) {
    setNotice("Pegá algún contenido antes de incorporarlo.", "error");
    render();
    return;
  }
  const source = sourceFromPastedText(name, text);
  const chunks = chunksFromSources([source]);
  const base = currentBase();
  base.chunks.push(...chunks);
  base.semanticModel = undefined;
  base.updatedAt = new Date().toISOString();
  await saveKnowledgeBase(base);
  state.searched = false;
  state.hits = [];
  setNotice(
    `Texto incorporado como “${source.name}” en ${chunks.length} fragmentos.`,
    "success",
  );
  render();
}

async function prepareSemanticIndex(): Promise<void> {
  const base = currentBase();
  if (!base.chunks.length) {
    return;
  }
  state.busy = true;
  state.progress = {
    phase: "model",
    label: "Preparando motor conceptual",
    percent: 2,
  };
  render();
  try {
    semanticEngine ??= new SemanticEngine();
    await semanticEngine.prepare(handleSemanticProgress);
    const embeddings = await semanticEngine.embed(
      base.chunks.map(chunkTextForEmbedding),
      handleSemanticProgress,
    );
    base.chunks = base.chunks.map((chunk, index) => ({
      ...chunk,
      embedding: embeddings[index],
    }));
    base.semanticModel = SEMANTIC_MODEL;
    base.updatedAt = new Date().toISOString();
    await saveKnowledgeBase(base);
    replaceBase(base);
    setNotice(
      `Búsqueda por ideas preparada para ${base.chunks.length} fragmentos. El modelo y el índice quedaron guardados localmente.`,
      "success",
    );
  } catch (error) {
    setNotice(
      `No pude preparar la búsqueda conceptual: ${errorMessage(error)}. La búsqueda por palabras sigue disponible.`,
      "error",
    );
  } finally {
    state.busy = false;
    state.progress = undefined;
    render();
  }
}

function handleSemanticProgress(progress: SemanticProgress): void {
  state.progress = progress;
  updateVisibleProgress(progress);
}

function updateVisibleProgress(progress: SemanticProgress): void {
  const label = document.querySelector<HTMLElement>(".progress-block span");
  const bar = document.querySelector<HTMLElement>(".progress-track i");
  if (label) {
    label.textContent = progress.label;
  }
  if (bar) {
    bar.style.width = `${Math.max(2, Math.min(100, progress.percent ?? 8))}%`;
  }
}

async function createBase(): Promise<void> {
  const name = window.prompt("Nombre de la nueva base:", "Mi base");
  if (!name?.trim()) {
    return;
  }
  const base = createEmptyBase(name.trim());
  await saveKnowledgeBase(base);
  state.bases.unshift(base);
  state.currentId = base.id;
  localStorage.setItem(LAST_BASE_KEY, base.id);
  state.hits = [];
  state.searched = false;
  setNotice(`Base “${base.name}” creada en este navegador.`, "success");
  render();
}

async function removeCurrentBase(): Promise<void> {
  const base = currentBase();
  if (
    !window.confirm(
      `¿Eliminar “${base.name}” y su índice guardado en este navegador? Los archivos originales no se tocan.`,
    )
  ) {
    return;
  }
  await deleteKnowledgeBase(base.id);
  if (base.id === DEMO_BASE_ID) {
    localStorage.setItem(DEMO_DISMISSED_KEY, "1");
  }
  state.bases = state.bases.filter((item) => item.id !== base.id);
  if (!state.bases.length) {
    const empty = createEmptyBase("Mi primera base");
    await saveKnowledgeBase(empty);
    state.bases = [empty];
  }
  state.currentId = state.bases[0]?.id ?? "";
  localStorage.setItem(LAST_BASE_KEY, state.currentId);
  state.hits = [];
  state.searched = false;
  setNotice("La base local fue eliminada. Los archivos originales no se modificaron.", "success");
  render();
}

function exportCurrentBase(): void {
  const base = currentBase();
  const portableChunks = base.chunks.map(({ embedding: _embedding, ...chunk }) => chunk);
  const payload = {
    schema: "rastreador-de-ideas/v1",
    exportedAt: new Date().toISOString(),
    base: {
      ...base,
      id: crypto.randomUUID(),
      name: `${base.name} · importada`,
      semanticModel: undefined,
      chunks: portableChunks,
    },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeFileName(base.name)}.rastreador.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function restoreBase(event: Event): Promise<void> {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) {
    return;
  }
  try {
    const value = JSON.parse(await file.text()) as unknown;
    const restored = parsePortableBase(value);
    await saveKnowledgeBase(restored);
    state.bases.unshift(restored);
    state.currentId = restored.id;
    localStorage.setItem(LAST_BASE_KEY, restored.id);
    state.searched = false;
    state.hits = [];
    setNotice(`Base “${restored.name}” importada correctamente.`, "success");
  } catch (error) {
    setNotice(`No pude importar esa base: ${errorMessage(error)}`, "error");
  } finally {
    input.value = "";
    render();
  }
}

function parsePortableBase(value: unknown): KnowledgeBase {
  if (
    typeof value !== "object" ||
    value === null ||
    !("schema" in value) ||
    value.schema !== "rastreador-de-ideas/v1" ||
    !("base" in value) ||
    typeof value.base !== "object" ||
    value.base === null
  ) {
    throw new Error("el archivo no tiene el formato rastreador-de-ideas/v1");
  }
  const candidate = value.base as Partial<KnowledgeBase>;
  if (
    typeof candidate.name !== "string" ||
    !Array.isArray(candidate.chunks) ||
    !candidate.chunks.every(isSourceChunk)
  ) {
    throw new Error("faltan el nombre o los fragmentos de la base");
  }
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: candidate.name,
    createdAt: now,
    updatedAt: now,
    chunks: candidate.chunks.map((chunk) => ({
      ...chunk,
      id: crypto.randomUUID(),
      embedding: undefined,
    })),
  };
}

function isSourceChunk(value: unknown): value is SourceChunk {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const chunk = value as Partial<SourceChunk>;
  return (
    typeof chunk.sourceId === "string" &&
    typeof chunk.sourceName === "string" &&
    typeof chunk.sourceType === "string" &&
    typeof chunk.location === "string" &&
    typeof chunk.text === "string"
  );
}

function createEmptyBase(name: string): KnowledgeBase {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
    chunks: [],
  };
}

function currentBase(): KnowledgeBase {
  const base = state.bases.find((item) => item.id === state.currentId);
  if (!base) {
    throw new Error("No hay una base activa.");
  }
  return base;
}

function replaceBase(base: KnowledgeBase): void {
  state.bases = state.bases.map((item) => (item.id === base.id ? base : item));
}

function countSources(chunks: SourceChunk[]): number {
  return new Set(chunks.map((chunk) => chunk.sourceId)).size;
}

function chunkTextForEmbedding(chunk: SourceChunk): string {
  const metadata = Object.entries(chunk.metadata ?? {})
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  return [chunk.sourceName, chunk.location, chunk.text, metadata]
    .filter(Boolean)
    .join("\n")
    .slice(0, 2_400);
}

function setNotice(
  message: string,
  tone: AppState["noticeTone"],
): void {
  state.notice = message;
  state.noticeTone = tone;
}

function bind(
  id: string,
  eventName: string,
  handler: (event: Event) => void,
): void {
  document.getElementById(id)?.addEventListener(eventName, handler);
}

function highlightHtml(text: string, query: string): string {
  const terms = [
    ...new Set(
      query
        .split(/[^\p{L}\p{N}]+/u)
        .filter((term) => term.length >= 3 && tokenize(term).length),
    ),
  ].sort((left, right) => right.length - left.length);
  if (!terms.length) {
    return escapeHtml(text);
  }
  const expression = new RegExp(
    `(?<![\\p{L}\\p{N}])(${terms.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}])`,
    "giu",
  );
  return text
    .split(expression)
    .map((part, index) =>
      index % 2 === 1 ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part),
    )
    .join("");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeFileName(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "base"
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
