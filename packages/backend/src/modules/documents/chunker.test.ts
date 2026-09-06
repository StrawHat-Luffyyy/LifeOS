import { describe, it, expect } from 'vitest';
import { chunkText } from './chunker.js';

describe('Document Chunker (FR-DOC-2)', () => {
  it('returns empty array for empty string', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n\n  ')).toEqual([]);
  });

  it('returns a single chunk if text is smaller than maxChunkChars', () => {
    const text = 'LifeOS is a personal productivity platform. It features explicit memory and document ingestion.';
    const chunks = chunkText(text, { maxChunkChars: 1000 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it('splits on paragraph boundaries and respects overlap', () => {
    const p1 = 'First paragraph describing the introduction to the knowledge base system and architecture.';
    const p2 = 'Second paragraph detailing vector search using pgvector and Ollama nomic-embed-text.';
    const p3 = 'Third paragraph explaining hybrid retrieval and reciprocal rank fusion with k=60.';

    const fullText = `${p1}\n\n${p2}\n\n${p3}`;
    const chunks = chunkText(fullText, { maxChunkChars: 120, overlapChars: 30 });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]).toContain(p1);
    // Overlap ensures subsequent chunks retain context
    expect(chunks[1]).toBeDefined();
  });

  it('splits oversized paragraphs by sentences', () => {
    const longSentence1 = 'Sentence one is relatively long and contains detailed architectural context for the system. ';
    const longSentence2 = 'Sentence two continues the discussion with in-depth analysis of memory conflict resolution. ';
    const longSentence3 = 'Sentence three concludes with evaluations of retrieval metrics and provenance tracing. ';

    const giantParagraph = longSentence1 + longSentence2 + longSentence3;
    const chunks = chunkText(giantParagraph, { maxChunkChars: 110, overlapChars: 20 });

    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk) => {
      expect(chunk.length).toBeLessThanOrEqual(130);
    });
  });
});
