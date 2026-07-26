export type SearchMode = "hybrid" | "literal" | "semantic";

export interface SourceChunk {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceType: string;
  location: string;
  text: string;
  url?: string;
  metadata?: Record<string, string>;
  embedding?: number[];
}

export interface KnowledgeBase {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  chunks: SourceChunk[];
  semanticModel?: string;
}

export interface ParsedSegment {
  text: string;
  location: string;
  metadata?: Record<string, string>;
  url?: string;
}

export interface ParsedSource {
  id: string;
  name: string;
  type: string;
  segments: ParsedSegment[];
}

export interface SearchHit extends SourceChunk {
  score: number;
  lexicalScore: number;
  semanticScore: number;
  evidence: string;
  matchKind: "frase" | "palabras" | "idea" | "mixta";
}

export interface EvidenceAnswer {
  passages: Array<{
    text: string;
    hit: SearchHit;
    reason: string;
  }>;
  caveat: string;
}
