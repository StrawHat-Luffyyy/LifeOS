import { config } from '../../../config/index.js';
import type { EmbeddingProvider } from './embedding-gateway.interface.js';
import { OllamaEmbeddingProvider } from './ollama-embedding.provider.js';
import { MockEmbeddingProvider } from './mock-embedding.provider.js';

export * from './embedding-gateway.interface.js';
export * from './ollama-embedding.provider.js';
export * from './mock-embedding.provider.js';

let defaultProvider: EmbeddingProvider | null = null;

export function getEmbeddingProvider(override?: EmbeddingProvider): EmbeddingProvider {
  if (override) {
    return override;
  }

  if (!defaultProvider) {
    if (config.EMBEDDING_PROVIDER === 'mock' || config.NODE_ENV === 'test') {
      defaultProvider = new MockEmbeddingProvider();
    } else {
      defaultProvider = new OllamaEmbeddingProvider(
        config.OLLAMA_EMBED_MODEL,
        config.OLLAMA_BASE_URL,
      );
    }
  }

  return defaultProvider;
}

export function setEmbeddingProvider(provider: EmbeddingProvider | null): void {
  defaultProvider = provider;
}
