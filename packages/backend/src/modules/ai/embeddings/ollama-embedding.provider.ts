import type { EmbeddingProvider } from './embedding-gateway.interface.js';
import { config } from '../../../config/index.js';
import { AppError } from '../../../lib/errors.js';

interface OllamaEmbedResponse {
  model: string;
  embeddings: number[][];
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly modelName: string;
  readonly dimensions: number = 768;
  private readonly baseUrl: string;

  constructor(
    modelName: string = config.OLLAMA_EMBED_MODEL || 'nomic-embed-text',
    baseUrl: string = config.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
  ) {
    this.modelName = modelName;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async embed(text: string): Promise<number[]> {
    const results = await this.embedBatch([text]);
    if (!results[0]) {
      throw new AppError('Failed to generate embedding: empty response from provider', 500, 'EMBEDDING_EMPTY_RESPONSE');
    }
    return results[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/embed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.modelName,
          input: texts,
          options: {
            num_ctx: 8192,
          },
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => response.statusText);
        throw new AppError(
          `Ollama embedding API error (${response.status}): ${errText}`,
          502,
          'OLLAMA_EMBED_ERROR',
        );
      }

      const data = (await response.json()) as OllamaEmbedResponse;

      if (!data.embeddings || !Array.isArray(data.embeddings)) {
        throw new AppError('Invalid response format from Ollama embedding API', 500, 'INVALID_RESPONSE_FORMAT');
      }

      return data.embeddings;
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new AppError(`Failed to reach Ollama embedding service: ${message}`, 502, 'OLLAMA_UNREACHABLE');
    }
  }
}
