import type { PDFDocumentProxy } from "pdfjs-dist";

export type OcrLanguage = "spa" | "eng" | "spa+eng";

export interface OcrRequest {
  fileName: string;
  pageNumbers: number[];
  totalPages: number;
}

export interface OcrChoice {
  enabled: boolean;
  language: OcrLanguage;
}

export interface OcrProgress {
  fileName: string;
  pageNumber: number;
  pageIndex: number;
  pageCount: number;
  label: string;
  percent: number;
}

export interface OcrPage {
  pageNumber: number;
  text: string;
  confidence: number;
}

export interface OcrOptions {
  fileName: string;
  language: OcrLanguage;
  signal?: AbortSignal;
  onProgress?: (progress: OcrProgress) => void;
}

const MIN_SEARCHABLE_CHARACTERS = 40;
const OCR_RENDER_SCALE = 2;
const MAX_RENDER_PIXELS = 6_000_000;

export function pageNeedsOcr(text: string): boolean {
  const searchableCharacters = text.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  return searchableCharacters < MIN_SEARCHABLE_CHARACTERS;
}

export function normalizeOcrText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isOcrCancellation(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export async function recognizePdfPages(
  pdfDocument: PDFDocumentProxy,
  pageNumbers: number[],
  options: OcrOptions,
): Promise<OcrPage[]> {
  if (!pageNumbers.length) {
    return [];
  }
  throwIfAborted(options.signal);

  const { createWorker } = await import("tesseract.js");
  let activePageIndex = 0;
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;

  options.onProgress?.({
    fileName: options.fileName,
    pageNumber: pageNumbers[0] ?? 1,
    pageIndex: 0,
    pageCount: pageNumbers.length,
    label: `Preparando OCR para “${options.fileName}”…`,
    percent: 1,
  });

  try {
    worker = await createWorker(options.language, undefined, {
      logger: (message) => {
        const pageNumber = pageNumbers[activePageIndex] ?? 1;
        const withinPage = Math.max(0, Math.min(1, message.progress || 0));
        const percent =
          ((activePageIndex + withinPage) / pageNumbers.length) * 100;
        options.onProgress?.({
          fileName: options.fileName,
          pageNumber,
          pageIndex: activePageIndex,
          pageCount: pageNumbers.length,
          label: progressLabel(
            message.status,
            pageNumber,
            activePageIndex + 1,
            pageNumbers.length,
          ),
          percent,
        });
      },
    });

    const abortWorker = () => {
      void worker?.terminate().catch(() => undefined);
    };
    options.signal?.addEventListener("abort", abortWorker, { once: true });

    try {
      const results: OcrPage[] = [];
      for (let index = 0; index < pageNumbers.length; index += 1) {
        throwIfAborted(options.signal);
        activePageIndex = index;
        const pageNumber = pageNumbers[index];
        if (pageNumber === undefined) {
          continue;
        }
        options.onProgress?.({
          fileName: options.fileName,
          pageNumber,
          pageIndex: index,
          pageCount: pageNumbers.length,
          label: `Preparando página ${pageNumber} para OCR (${index + 1} de ${pageNumbers.length})…`,
          percent: (index / pageNumbers.length) * 100,
        });

        const page = await pdfDocument.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const pixelLimitedScale = Math.sqrt(
          MAX_RENDER_PIXELS / (baseViewport.width * baseViewport.height),
        );
        const scale = Math.max(
          1.2,
          Math.min(OCR_RENDER_SCALE, pixelLimitedScale),
        );
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) {
          throw new Error("El navegador no pudo preparar la imagen para OCR.");
        }
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({
          canvas,
          canvasContext: context,
          viewport,
          background: "white",
        }).promise;
        throwIfAborted(options.signal);

        const result = await worker.recognize(canvas, { rotateAuto: true });
        const text = normalizeOcrText(result.data.text);
        results.push({
          pageNumber,
          text,
          confidence: Math.round(result.data.confidence),
        });
        canvas.width = 1;
        canvas.height = 1;
      }
      options.onProgress?.({
        fileName: options.fileName,
        pageNumber: pageNumbers.at(-1) ?? 1,
        pageIndex: pageNumbers.length - 1,
        pageCount: pageNumbers.length,
        label: `OCR terminado para “${options.fileName}”.`,
        percent: 100,
      });
      return results;
    } finally {
      options.signal?.removeEventListener("abort", abortWorker);
    }
  } catch (error) {
    if (options.signal?.aborted) {
      throw abortError();
    }
    throw error;
  } finally {
    await worker?.terminate().catch(() => undefined);
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw abortError();
  }
}

function abortError(): Error {
  const error = new Error("OCR cancelado. No se incorporó el archivo.");
  error.name = "AbortError";
  return error;
}

function progressLabel(
  status: string,
  pageNumber: number,
  position: number,
  total: number,
): string {
  const translatedStatus: Record<string, string> = {
    "loading tesseract core": "Cargando el motor OCR",
    "initializing tesseract": "Inicializando el motor OCR",
    "loading language traineddata": "Cargando el idioma",
    "initializing api": "Preparando el reconocimiento",
    "recognizing text": "Reconociendo texto",
  };
  const label = translatedStatus[status] ?? "Procesando";
  return `${label} · página ${pageNumber} (${position} de ${total})`;
}
