import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaEmbeddingProvider } from './ollama-embedding.provider.js';
import { MockEmbeddingProvider } from './mock-embedding.provider.js';

describe('Embedding Providers (P3-1, P3-2)', () => {
  describe('MockEmbeddingProvider', () => {
    const provider = new MockEmbeddingProvider();

    it('should generate a 768-dimensional normalized vector', async () => {
      const vec = await provider.embed('test lifeos memory content');
      expect(vec).toHaveLength(768);

      // Verify unit vector normalization (sum of squares ~ 1)
      const sumSq = vec.reduce((acc, v) => acc + v * v, 0);
      expect(sumSq).toBeGreaterThan(0.98);
      expect(sumSq).toBeLessThan(1.02);
    });

    it('should generate identical embeddings for identical text', async () => {
      const vec1 = await provider.embed('deterministic content');
      const vec2 = await provider.embed('deterministic content');
      expect(vec1).toEqual(vec2);
    });

    it('should support batch embedding', async () => {
      const vecs = await provider.embedBatch(['text one', 'text two']);
      expect(vecs).toHaveLength(2);
      expect(vecs[0]).toHaveLength(768);
      expect(vecs[1]).toHaveLength(768);
    });
  });

  describe('OllamaEmbeddingProvider', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('should call Ollama /api/embed with nomic-embed-text and num_ctx: 8192', async () => {
      const mockVector = new Array(768).fill(0.05);
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: 'nomic-embed-text',
          embeddings: [mockVector],
        }),
      } as Response);

      const provider = new OllamaEmbeddingProvider('nomic-embed-text', 'http://127.0.0.1:11434');
      const result = await provider.embed('hello world');

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://127.0.0.1:11434/api/embed',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'nomic-embed-text',
            input: ['hello world'],
            options: {
              num_ctx: 8192,
            },
          }),
        }),
      );

      expect(result).toHaveLength(768);
      expect(result).toEqual(mockVector);
    });

    it('should throw an AppError on provider failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Error',
        text: async () => 'Model not loaded',
      } as Response);

      const provider = new OllamaEmbeddingProvider('nomic-embed-text', 'http://127.0.0.1:11434');
      await expect(provider.embed('hello world')).rejects.toThrow('Ollama embedding API error');
    });
  });
});
