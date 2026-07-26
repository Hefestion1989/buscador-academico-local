export const SEMANTIC_MODEL =
  "Xenova/paraphrase-multilingual-MiniLM-L12-v2";

export interface SemanticProgress {
  phase: "model" | "index";
  label: string;
  current?: number;
  total?: number;
  percent?: number;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  onProgress?: (progress: SemanticProgress) => void;
}

type WorkerResponse =
  | {
      id: string;
      type: "result";
      value: unknown;
    }
  | {
      id: string;
      type: "error";
      message: string;
    }
  | {
      id: string;
      type: "progress";
      phase: "model" | "index";
      status?: string;
      file?: string;
      progress?: number;
      loaded?: number;
      total?: number;
      current?: number;
    };

export class SemanticEngine {
  private readonly worker = new Worker(
    new URL("./semantic.worker.ts", import.meta.url),
    { type: "module" },
  );

  private readonly pending = new Map<string, PendingRequest>();

  public constructor() {
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      const pending = this.pending.get(response.id);
      if (!pending) {
        return;
      }
      if (response.type === "progress") {
        pending.onProgress?.(formatProgress(response));
        return;
      }
      this.pending.delete(response.id);
      if (response.type === "error") {
        pending.reject(new Error(response.message));
      } else {
        pending.resolve(response.value);
      }
    };
    this.worker.onerror = (event) => {
      const error = new Error(event.message || "Falló el motor semántico.");
      for (const pending of this.pending.values()) {
        pending.reject(error);
      }
      this.pending.clear();
    };
  }

  public async prepare(
    onProgress?: (progress: SemanticProgress) => void,
  ): Promise<string> {
    return (await this.request(
      { type: "prepare" },
      onProgress,
    )) as string;
  }

  public async embed(
    texts: string[],
    onProgress?: (progress: SemanticProgress) => void,
  ): Promise<number[][]> {
    if (!texts.length) {
      return [];
    }
    return (await this.request(
      { type: "embed", texts },
      onProgress,
    )) as number[][];
  }

  private request(
    payload: { type: "prepare" } | { type: "embed"; texts: string[] },
    onProgress?: (progress: SemanticProgress) => void,
  ): Promise<unknown> {
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress });
      this.worker.postMessage({ id, ...payload });
    });
  }
}

function formatProgress(response: Extract<WorkerResponse, { type: "progress" }>): SemanticProgress {
  if (response.phase === "index") {
    const current = response.current ?? 0;
    const total = response.total ?? 0;
    return {
      phase: "index",
      label: `Representando fragmentos: ${current} de ${total}`,
      current,
      total,
      percent: total ? (current / total) * 100 : undefined,
    };
  }

  const rawPercent =
    response.progress ??
    (response.loaded && response.total
      ? (response.loaded / response.total) * 100
      : undefined);
  return {
    phase: "model",
    label:
      response.status === "ready"
        ? "Modelo conceptual preparado"
        : response.file
          ? `Descargando motor: ${shortFileName(response.file)}`
          : "Preparando motor conceptual",
    percent: rawPercent,
  };
}

function shortFileName(path: string): string {
  const parts = path.split("/");
  return parts.at(-1) ?? path;
}
