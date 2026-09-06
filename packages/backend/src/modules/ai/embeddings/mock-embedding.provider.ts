import type { EmbeddingProvider } from './embedding-gateway.interface.js';

export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly modelName: string = 'mock-embed-768';
  readonly dimensions: number = 768;

  async embed(text: string): Promise<number[]> {
    return this.generateDeterministicVector(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.generateDeterministicVector(t));
  }

  private generateDeterministicVector(text: string): number[] {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
    }

    const vec: number[] = new Array(this.dimensions);
    let norm = 0;

    for (let i = 0; i < this.dimensions; i++) {
      // Deterministic pseudo-random generation based on hash and index
      const val = Math.sin((hash + i * 31) * 0.1);
      vec[i] = val;
      norm += val * val;
    }

    // Normalize to unit vector for cosine similarity
    const sqrtNorm = Math.sqrt(norm) || 1;
    for (let i = 0; i < this.dimensions; i++) {
      vec[i] = Number(((vec[i] ?? 0) / sqrtNorm).toFixed(6));
    }

    return vec;
  }
}
