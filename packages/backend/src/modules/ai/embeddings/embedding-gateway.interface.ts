export interface EmbeddingProvider {
  readonly modelName: string;
  readonly dimensions: number;

  /**
   * Generates an embedding vector for a single string.
   */
  embed(text: string): Promise<number[]>;

  /**
   * Generates embedding vectors for multiple strings in a batch.
   */
  embedBatch(texts: string[]): Promise<number[][]>;
}
