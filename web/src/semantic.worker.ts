/// <reference lib="webworker" />

import { env, pipeline } from "@huggingface/transformers";

const MODEL_NAME = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
const workerScope = self as unknown as DedicatedWorkerGlobalScope;

type FeatureExtractor = (
  texts: string | string[],
  options: { pooling: "mean"; normalize: true },
) => Promise<{ tolist(): unknown }>;

type WorkerRequest =
  | { id: string; type: "prepare" }
  | { id: string; type: "embed"; texts: string[] };

let extractorPromise: Promise<FeatureExtractor> | undefined;

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;

workerScope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  void handleRequest(event.data);
};

async function handleRequest(request: WorkerRequest): Promise<void> {
  try {
    const extractor = await getExtractor(request.id);
    if (request.type === "prepare") {
      workerScope.postMessage({
        id: request.id,
        type: "result",
        value: MODEL_NAME,
      });
      return;
    }

    const embeddings: number[][] = [];
    const batchSize = 8;
    for (let start = 0; start < request.texts.length; start += batchSize) {
      const batch = request.texts.slice(start, start + batchSize);
      const output = await extractor(batch, {
        pooling: "mean",
        normalize: true,
      });
      const values = output.tolist() as number[][];
      embeddings.push(...values);
      workerScope.postMessage({
        id: request.id,
        type: "progress",
        phase: "index",
        current: Math.min(start + batch.length, request.texts.length),
        total: request.texts.length,
      });
    }

    workerScope.postMessage({
      id: request.id,
      type: "result",
      value: embeddings,
    });
  } catch (error) {
    workerScope.postMessage({
      id: request.id,
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function getExtractor(requestId: string): Promise<FeatureExtractor> {
  if (!extractorPromise) {
    extractorPromise = pipeline(
      "feature-extraction",
      MODEL_NAME,
      {
        dtype: "q8",
        progress_callback: (progress: unknown) => {
          const detail = asRecord(progress);
          workerScope.postMessage({
            id: requestId,
            type: "progress",
            phase: "model",
            status: String(detail.status ?? "loading"),
            file: typeof detail.file === "string" ? detail.file : undefined,
            progress:
              typeof detail.progress === "number" ? detail.progress : undefined,
            loaded: typeof detail.loaded === "number" ? detail.loaded : undefined,
            total: typeof detail.total === "number" ? detail.total : undefined,
          });
        },
      },
    ) as unknown as Promise<FeatureExtractor>;
  }
  return extractorPromise;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

export {};
