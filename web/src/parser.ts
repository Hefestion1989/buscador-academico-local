import Papa from "papaparse";

import type { ParsedSegment, ParsedSource, SourceChunk } from "./types";

const MAX_FILE_BYTES = 45 * 1024 * 1024;
const CHUNK_SIZE = 1_050;
const CHUNK_OVERLAP = 180;
const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "rtf",
  "html",
  "htm",
  "xml",
]);

export async function parseFiles(files: File[]): Promise<ParsedSource[]> {
  const sources: ParsedSource[] = [];
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      throw new Error(
        `${file.name} supera el límite de 45 MB por archivo de la edición web.`,
      );
    }
    sources.push(await parseFile(file));
  }
  return sources;
}

export function chunksFromSources(sources: ParsedSource[]): SourceChunk[] {
  const chunks: SourceChunk[] = [];
  for (const source of sources) {
    for (const segment of source.segments) {
      const parts = splitLongText(segment.text, CHUNK_SIZE, CHUNK_OVERLAP);
      parts.forEach((text, partIndex) => {
        chunks.push({
          id: crypto.randomUUID(),
          sourceId: source.id,
          sourceName: source.name,
          sourceType: source.type,
          location:
            parts.length > 1
              ? `${segment.location}, parte ${partIndex + 1}`
              : segment.location,
          text,
          metadata: segment.metadata,
          url: segment.url,
        });
      });
    }
  }
  return chunks;
}

export function sourceFromPastedText(
  name: string,
  text: string,
): ParsedSource {
  return {
    id: crypto.randomUUID(),
    name: name.trim() || "Texto pegado",
    type: "texto pegado",
    segments: textToSegments(text),
  };
}

async function parseFile(file: File): Promise<ParsedSource> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  let segments: ParsedSegment[];

  if (extension === "pdf") {
    segments = await parsePdf(file);
  } else if (extension === "docx") {
    segments = await parseDocx(file);
  } else if (extension === "csv" || extension === "tsv") {
    segments = parseDelimited(await file.text(), extension === "tsv" ? "\t" : ",");
  } else if (extension === "json") {
    segments = parseJson(await file.text());
  } else if (extension === "jsonl" || extension === "ndjson") {
    segments = parseJsonLines(await file.text());
  } else if (TEXT_EXTENSIONS.has(extension)) {
    const rawText = await file.text();
    segments =
      extension === "rtf"
        ? textToSegments(stripRtf(rawText))
        : extension === "html" || extension === "htm" || extension === "xml"
          ? textToSegments(stripMarkup(rawText))
          : textToSegments(rawText);
  } else {
    throw new Error(
      `${file.name}: formato no compatible. Usá PDF, DOCX, TXT, MD, RTF, HTML, CSV, TSV, JSON o JSONL.`,
    );
  }

  return {
    id: crypto.randomUUID(),
    name: file.name,
    type: extension || file.type || "archivo",
    segments,
  };
}

async function parsePdf(file: File): Promise<ParsedSegment[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const document = await pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  }).promise;
  const segments: ParsedSegment[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) {
      segments.push({ text, location: `página ${pageNumber}` });
    }
  }
  return segments;
}

async function parseDocx(file: File): Promise<ParsedSegment[]> {
  const mammoth = await import("mammoth/mammoth.browser");
  const result = await mammoth.extractRawText({
    arrayBuffer: await file.arrayBuffer(),
  });
  return textToSegments(result.value);
}

function parseDelimited(text: string, delimiter: string): ParsedSegment[] {
  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    delimiter,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim() || "columna",
  });
  if (result.errors.length && !result.data.length) {
    throw new Error(result.errors[0]?.message ?? "No se pudo leer la tabla.");
  }
  return recordsToSegments(result.data, 2);
}

function parseJson(text: string): ParsedSegment[] {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("El JSON no es válido.");
  }

  if (Array.isArray(value)) {
    return recordsToSegments(value, 1);
  }
  if (isRecord(value)) {
    const firstArray = Object.values(value).find(Array.isArray);
    if (firstArray) {
      return recordsToSegments(firstArray, 1);
    }
    return recordsToSegments([value], 1);
  }
  return [{ text: String(value), location: "valor JSON" }];
}

function parseJsonLines(text: string): ParsedSegment[] {
  const records = text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line) as unknown;
      } catch {
        throw new Error(`JSONL inválido en la línea ${index + 1}.`);
      }
    });
  return recordsToSegments(records, 1);
}

function recordsToSegments(
  records: unknown[],
  rowOffset: number,
): ParsedSegment[] {
  return records
    .map((record, index): ParsedSegment | null => {
      const flattened = flattenValue(record);
      const entries = Object.entries(flattened).filter(
        ([, value]) => value.trim().length > 0,
      );
      if (!entries.length) {
        return null;
      }
      const urlEntry = entries.find(([key, value]) => {
        const normalizedKey = key.toLowerCase();
        return (
          (normalizedKey.includes("url") ||
            normalizedKey.includes("link") ||
            normalizedKey.includes("enlace")) &&
          /^https?:\/\//i.test(value)
        );
      });
      const metadata = Object.fromEntries(entries.slice(0, 18));
      return {
        text: entries.map(([key, value]) => `${key}: ${value}`).join("\n"),
        location: `fila ${index + rowOffset}`,
        metadata,
        url: urlEntry?.[1],
      };
    })
    .filter((segment): segment is ParsedSegment => Boolean(segment));
}

function flattenValue(
  value: unknown,
  prefix = "",
  output: Record<string, string> = {},
): Record<string, string> {
  if (value === null || value === undefined) {
    return output;
  }
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item !== "object" || item === null)) {
      output[prefix || "valor"] = value.map(String).join("; ");
    } else {
      value.forEach((item, index) =>
        flattenValue(item, `${prefix || "item"}[${index}]`, output),
      );
    }
    return output;
  }
  if (isRecord(value)) {
    for (const [key, nested] of Object.entries(value)) {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      flattenValue(nested, nextPrefix, output);
    }
    return output;
  }
  output[prefix || "valor"] = String(value);
  return output;
}

function textToSegments(text: string): ParsedSegment[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }
  const blocks = normalized.split(/\n\s*\n/);
  let line = 1;
  const segments: ParsedSegment[] = [];
  for (const rawBlock of blocks) {
    const text = rawBlock.replace(/\s+/g, " ").trim();
    if (text) {
      segments.push({ text, location: `línea ${line}` });
    }
    line += (rawBlock.match(/\n/g)?.length ?? 0) + 2;
  }
  return segments;
}

function splitLongText(
  text: string,
  chunkSize: number,
  overlap: number,
): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }
  if (normalized.length <= chunkSize) {
    return [normalized];
  }

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(normalized.length, start + chunkSize);
    if (end < normalized.length) {
      const breakAt = Math.max(
        normalized.lastIndexOf(". ", end),
        normalized.lastIndexOf("; ", end),
      );
      if (breakAt > start + chunkSize * 0.55) {
        end = breakAt + 1;
      }
    }
    chunks.push(normalized.slice(start, end).trim());
    if (end >= normalized.length) {
      break;
    }
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

function stripMarkup(text: string): string {
  const document = new DOMParser().parseFromString(text, "text/html");
  return document.body.textContent ?? "";
}

function stripRtf(text: string): string {
  return text
    .replace(/\\'[0-9a-fA-F]{2}/g, " ")
    .replace(/\\[a-zA-Z]+-?\d* ?/g, " ")
    .replace(/[{}]/g, " ")
    .replace(/\s+/g, " ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
