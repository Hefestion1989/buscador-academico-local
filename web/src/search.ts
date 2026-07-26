import type {
  EvidenceAnswer,
  SearchHit,
  SearchMode,
  SourceChunk,
} from "./types";

const STOPWORDS = new Set([
  "a",
  "al",
  "algo",
  "ante",
  "como",
  "con",
  "cuando",
  "cual",
  "de",
  "del",
  "donde",
  "el",
  "ella",
  "ellas",
  "ellos",
  "en",
  "entre",
  "era",
  "ese",
  "eso",
  "esta",
  "este",
  "fue",
  "ha",
  "hay",
  "la",
  "las",
  "lo",
  "los",
  "mas",
  "momento",
  "para",
  "pero",
  "por",
  "que",
  "quien",
  "quienes",
  "se",
  "sin",
  "sobre",
  "son",
  "su",
  "sus",
  "un",
  "una",
  "y",
]);

const DATE_QUERY_TERMS = ["cuando", "fecha", "momento", "año", "ano"];
const PERSON_QUERY_TERMS = ["quien", "quienes", "persona", "autor", "impulso"];
const CHANGE_QUERY_TERMS = [
  "acepto",
  "cambio",
  "dejo",
  "elimino",
  "retiro",
  "saco",
  "suprimio",
];
const CHANGE_TEXT_TERMS = [
  "acept",
  "cambi",
  "dejo de",
  "elimin",
  "reemplaz",
  "retir",
  "suprim",
];

export function normalizeText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .toLowerCase()
    .trim();
}

export function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token))
    .map(stemLight);
}

function stemLight(token: string): string {
  const endings = [
    "amientos",
    "imientos",
    "aciones",
    "adores",
    "adoras",
    "idades",
    "mente",
    "acion",
    "imiento",
    "adora",
    "ador",
    "idad",
    "icos",
    "icas",
    "ismo",
    "istas",
  ];
  for (const ending of endings) {
    if (token.length > ending.length + 3 && token.endsWith(ending)) {
      return token.slice(0, -ending.length);
    }
  }
  if (token.length > 6 && token.endsWith("es")) {
    return token.slice(0, -2);
  }
  if (token.length > 5 && token.endsWith("s")) {
    return token.slice(0, -1);
  }
  return token;
}

export function lexicalScore(query: string, text: string): number {
  const queryTokens = [...new Set(tokenize(query))];
  if (!queryTokens.length) {
    return 0;
  }

  const textTokens = tokenize(text);
  if (!textTokens.length) {
    return 0;
  }

  const frequencies = new Map<string, number>();
  for (const token of textTokens) {
    frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  }

  const matched = queryTokens.filter((token) => frequencies.has(token));
  const coverage = matched.length / queryTokens.length;
  const density =
    matched.reduce(
      (sum, token) => sum + Math.min(3, frequencies.get(token) ?? 0),
      0,
    ) /
    (queryTokens.length * 3);

  const normalizedQuery = normalizeText(query);
  const normalizedContent = normalizeText(text);
  const phraseBonus =
    normalizedQuery.length >= 8 && normalizedContent.includes(normalizedQuery)
      ? 0.25
      : 0;

  return clamp01(coverage * 0.72 + density * 0.28 + phraseBonus);
}

export function cosineSimilarity(
  left: number[] | undefined,
  right: number[] | undefined,
): number {
  if (!left?.length || !right?.length || left.length !== right.length) {
    return 0;
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }
  if (!leftNorm || !rightNorm) {
    return 0;
  }
  return clamp01(dot / Math.sqrt(leftNorm * rightNorm));
}

export function searchChunks(
  query: string,
  chunks: SourceChunk[],
  mode: SearchMode,
  queryEmbedding?: number[],
  limit = 12,
): SearchHit[] {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return [];
  }

  const hits = chunks.map((chunk): SearchHit => {
    const searchable = [
      chunk.sourceName,
      chunk.location,
      chunk.text,
      Object.entries(chunk.metadata ?? {})
        .map(([key, value]) => `${key}: ${value}`)
        .join(" "),
    ].join("\n");
    const lexical = lexicalScore(normalizedQuery, searchable);
    const semantic = cosineSimilarity(queryEmbedding, chunk.embedding);
    const phrase = normalizeText(searchable).includes(normalizeText(normalizedQuery));
    const intent = evidenceIntentBonus(normalizedQuery, chunk.text);

    let score: number;
    if (mode === "literal") {
      score = lexical;
    } else if (mode === "semantic") {
      score = queryEmbedding && chunk.embedding ? semantic * 0.88 + lexical * 0.12 : lexical;
    } else {
      score =
        queryEmbedding && chunk.embedding
          ? semantic * 0.58 + lexical * 0.42
          : lexical;
    }
    score = clamp01(score + intent);

    let matchKind: SearchHit["matchKind"] = "palabras";
    if (phrase) {
      matchKind = "frase";
    } else if (semantic >= 0.5 && lexical >= 0.2) {
      matchKind = "mixta";
    } else if (semantic >= 0.5) {
      matchKind = "idea";
    }

    return {
      ...chunk,
      score,
      lexicalScore: lexical,
      semanticScore: semantic,
      evidence: selectEvidence(chunk.text, normalizedQuery),
      matchKind,
    };
  });

  return diversifySources(
    hits
      .filter((hit) => hit.score >= 0.08)
      .sort((left, right) => right.score - left.score),
  ).slice(0, limit);
}

export function buildEvidenceAnswer(
  query: string,
  hits: SearchHit[],
): EvidenceAnswer {
  if (!hits.length) {
    return {
      passages: [],
      caveat:
        "No apareció evidencia suficiente. Probá otra formulación o agregá más material a la base.",
    };
  }

  const normalizedQuery = normalizeText(query);
  const wantsDate = DATE_QUERY_TERMS.some((term) => normalizedQuery.includes(term));
  const wantsPerson = PERSON_QUERY_TERMS.some((term) =>
    normalizedQuery.includes(term),
  );
  const candidates: Array<{
    hit: SearchHit;
    reason: string;
    priority: number;
  }> = [];

  if (wantsDate) {
    const dateHit = hits
      .filter((hit) => hasDate(hit.evidence))
      .sort(
        (left, right) =>
          datePrecision(right.evidence) +
          right.score -
          (datePrecision(left.evidence) + left.score),
      )[0];
    if (dateHit) {
      candidates.push({
        hit: dateHit,
        reason: "fecha o momento",
        priority: 4,
      });
    }
  }

  if (wantsPerson) {
    const personHit = hits
      .filter((hit) => hasNamedPerson(hit.evidence))
      .sort(
        (left, right) =>
          namedPersonCount(right.evidence) +
          right.score -
          (namedPersonCount(left.evidence) + left.score),
      )[0];
    if (personHit) {
      candidates.push({
        hit: personHit,
        reason: "persona o actor mencionado",
        priority: 3,
      });
    }
  }

  for (const hit of hits) {
    candidates.push({
      hit,
      reason: hit.matchKind === "idea" ? "coincidencia conceptual" : "pasaje relevante",
      priority: hit.score,
    });
  }

  candidates.sort((left, right) => right.priority - left.priority);
  const passages: EvidenceAnswer["passages"] = [];
  const seenText = new Set<string>();
  const seenSources = new Map<string, number>();

  for (const candidate of candidates) {
    const key = normalizeText(candidate.hit.evidence).slice(0, 180);
    const sourceUses = seenSources.get(candidate.hit.sourceId) ?? 0;
    if (!key || seenText.has(key) || sourceUses >= 2) {
      continue;
    }
    passages.push({
      text: candidate.hit.evidence,
      hit: candidate.hit,
      reason: candidate.reason,
    });
    seenText.add(key);
    seenSources.set(candidate.hit.sourceId, sourceUses + 1);
    if (passages.length === 3) {
      break;
    }
  }

  return {
    passages,
    caveat:
      "La respuesta es extractiva: muestra lo que la base realmente dice y no completa huecos con información inventada.",
  };
}

export function selectEvidence(text: string, query: string, maxLength = 760): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  if (!sentences.length) {
    return `${cleaned.slice(0, maxLength - 1).trim()}…`;
  }

  let bestIndex = 0;
  let bestScore = -1;
  sentences.forEach((sentence, index) => {
    const score = lexicalScore(query, sentence) + evidenceIntentBonus(query, sentence);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  const selected = [sentences[bestIndex] ?? ""];
  let currentLength = selected[0]?.length ?? 0;
  for (const neighbor of [bestIndex - 1, bestIndex + 1]) {
    const sentence = sentences[neighbor];
    if (sentence && currentLength + sentence.length + 1 <= maxLength) {
      if (neighbor < bestIndex) {
        selected.unshift(sentence);
      } else {
        selected.push(sentence);
      }
      currentLength += sentence.length + 1;
    }
  }
  return selected.join(" ");
}

function evidenceIntentBonus(query: string, text: string): number {
  const normalizedQuery = normalizeText(query);
  const normalizedText = normalizeText(text);
  let bonus = 0;

  if (
    DATE_QUERY_TERMS.some((term) => normalizedQuery.includes(term)) &&
    hasDate(text)
  ) {
    bonus += /\b\d{1,2}\s+de\s+\p{L}+\s+de\s+(?:18|19|20)\d{2}\b/iu.test(
      text,
    )
      ? 0.18
      : 0.08;
  }
  if (
    PERSON_QUERY_TERMS.some((term) => normalizedQuery.includes(term)) &&
    hasNamedPerson(text)
  ) {
    bonus += 0.08;
  }
  if (
    CHANGE_QUERY_TERMS.some((term) => normalizedQuery.includes(term)) &&
    CHANGE_TEXT_TERMS.some((term) => normalizedText.includes(term))
  ) {
    bonus += 0.08;
  }
  return bonus;
}

function hasDate(text: string): boolean {
  return /\b(?:18|19|20)\d{2}\b/.test(text);
}

function hasNamedPerson(text: string): boolean {
  return /\b\p{Lu}\p{Ll}+(?:\s+(?:[A-Z]\.\s+)?\p{Lu}\p{Ll}+)+\b/u.test(text);
}

function datePrecision(text: string): number {
  if (
    /\b\d{1,2}\s+(?:y\s+\d{1,2}\s+)?de\s+\p{L}+\s+de\s+(?:18|19|20)\d{2}\b/iu.test(
      text,
    )
  ) {
    return 2;
  }
  return hasDate(text) ? 1 : 0;
}

function namedPersonCount(text: string): number {
  return (
    text.match(
      /\b\p{Lu}\p{Ll}+(?:\s+(?:[A-Z]\.\s+)?\p{Lu}\p{Ll}+)+\b/gu,
    )?.length ?? 0
  );
}

function diversifySources(hits: SearchHit[]): SearchHit[] {
  const primary: SearchHit[] = [];
  const deferred: SearchHit[] = [];
  const counts = new Map<string, number>();
  for (const hit of hits) {
    const count = counts.get(hit.sourceId) ?? 0;
    if (count < 2) {
      primary.push(hit);
      counts.set(hit.sourceId, count + 1);
    } else {
      deferred.push(hit);
    }
  }
  return [...primary, ...deferred];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
