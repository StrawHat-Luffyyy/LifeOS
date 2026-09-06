export interface ChunkerOptions {
  maxChunkChars?: number; // default ~2400 chars (~600 tokens)
  overlapChars?: number;  // default ~360 chars (~15% of 2400)
}

/**
 * Paragraph-aware text chunker with overlap (FR-DOC-2).
 * Splits text into coherent paragraph blocks targeting ~500-800 tokens (approx 2000-3200 chars)
 * with ~15% overlap between adjacent chunks to maintain context across boundaries.
 */
export function chunkText(text: string, options: ChunkerOptions = {}): string[] {
  const maxChunkChars = options.maxChunkChars ?? 2400;
  const overlapChars = options.overlapChars ?? Math.floor(maxChunkChars * 0.15);

  const cleanText = text.replace(/\r\n/g, '\n').trim();
  if (!cleanText) {
    return [];
  }

  if (cleanText.length <= maxChunkChars) {
    return [cleanText];
  }

  // Split into paragraphs / headings
  const rawParagraphs = cleanText.split(/\n\s*\n/);
  const sections: string[] = [];

  for (const para of rawParagraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (trimmed.length <= maxChunkChars) {
      sections.push(trimmed);
    } else {
      // If a single paragraph is larger than maxChunkChars, break by sentences
      const sentences = trimmed.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g) || [trimmed];
      let currentSentenceBlock = '';

      for (const sent of sentences) {
        if ((currentSentenceBlock + sent).length > maxChunkChars) {
          if (currentSentenceBlock.trim()) {
            sections.push(currentSentenceBlock.trim());
          }
          currentSentenceBlock = sent;
        } else {
          currentSentenceBlock += sent;
        }
      }
      if (currentSentenceBlock.trim()) {
        sections.push(currentSentenceBlock.trim());
      }
    }
  }

  const chunks: string[] = [];
  let currentChunk = '';

  for (const section of sections) {
    if ((currentChunk + '\n\n' + section).trim().length > maxChunkChars) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());

        // Extract overlap from the end of currentChunk
        if (overlapChars > 0 && currentChunk.length > overlapChars) {
          const overlapCandidate = currentChunk.slice(-overlapChars);
          // Find a sensible word/sentence boundary within the overlap candidate
          const lastBreak = overlapCandidate.search(/(\.\s+|\n+)/);
          if (lastBreak !== -1) {
            currentChunk = overlapCandidate.slice(lastBreak).trim() + '\n\n' + section;
          } else {
            currentChunk = overlapCandidate.trim() + '\n\n' + section;
          }
        } else {
          currentChunk = section;
        }
      } else {
        currentChunk = section;
      }
    } else {
      currentChunk = currentChunk ? currentChunk + '\n\n' + section : section;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}
