/* eslint-disable no-console */
import { eq, ne, or, isNull, and } from 'drizzle-orm';
import { db, closeDb } from '../db/index.js';
import { notes, memories, documentChunks } from '../db/schema/index.js';
import { getEmbeddingProvider } from '../modules/ai/embeddings/index.js';

async function runReembed(): Promise<void> {
  const provider = getEmbeddingProvider();
  const activeModel = provider.modelName;

  console.log(`Starting re-embedding script with model: ${activeModel}`);

  // 1. Notes
  const staleNotes = await db
    .select({
      id: notes.id,
      title: notes.title,
      content: notes.content,
    })
    .from(notes)
    .where(
      and(
        isNull(notes.deletedAt),
        or(isNull(notes.embedding), ne(notes.embeddingModel, activeModel)),
      ),
    );

  console.log(`Found ${staleNotes.length} stale notes to re-embed`);
  for (let i = 0; i < staleNotes.length; i += 10) {
    const batch = staleNotes.slice(i, i + 10);
    const texts = batch.map((n) => `${n.title}\n${n.content}`.trim());
    const embeddings = await provider.embedBatch(texts);

    await db.transaction(async (tx) => {
      for (let j = 0; j < batch.length; j++) {
        const item = batch[j];
        const emb = embeddings[j];
        if (item && emb) {
          await tx
            .update(notes)
            .set({
              embedding: emb,
              embeddingModel: activeModel,
              updatedAt: new Date(),
            })
            .where(eq(notes.id, item.id));
        }
      }
    });
  }

  // 2. Memories
  const staleMemories = await db
    .select({
      id: memories.id,
      content: memories.content,
    })
    .from(memories)
    .where(
      and(
        isNull(memories.deletedAt),
        or(isNull(memories.embedding), ne(memories.embeddingModel, activeModel)),
      ),
    );

  console.log(`Found ${staleMemories.length} stale memories to re-embed`);
  for (let i = 0; i < staleMemories.length; i += 10) {
    const batch = staleMemories.slice(i, i + 10);
    const texts = batch.map((m) => m.content.trim());
    const embeddings = await provider.embedBatch(texts);

    await db.transaction(async (tx) => {
      for (let j = 0; j < batch.length; j++) {
        const item = batch[j];
        const emb = embeddings[j];
        if (item && emb) {
          await tx
            .update(memories)
            .set({
              embedding: emb,
              embeddingModel: activeModel,
              updatedAt: new Date(),
            })
            .where(eq(memories.id, item.id));
        }
      }
    });
  }

  // 3. Document chunks
  const staleChunks = await db
    .select({
      id: documentChunks.id,
      content: documentChunks.content,
    })
    .from(documentChunks)
    .where(or(isNull(documentChunks.embedding), ne(documentChunks.embeddingModel, activeModel)));

  console.log(`Found ${staleChunks.length} stale document chunks to re-embed`);
  for (let i = 0; i < staleChunks.length; i += 10) {
    const batch = staleChunks.slice(i, i + 10);
    const texts = batch.map((c) => c.content.trim());
    const embeddings = await provider.embedBatch(texts);

    await db.transaction(async (tx) => {
      for (let j = 0; j < batch.length; j++) {
        const item = batch[j];
        const emb = embeddings[j];
        if (item && emb) {
          await tx
            .update(documentChunks)
            .set({
              embedding: emb,
              embeddingModel: activeModel,
            })
            .where(eq(documentChunks.id, item.id));
        }
      }
    });
  }

  console.log('Re-embedding completed successfully.');
  await closeDb();
}

runReembed().catch(async (err) => {
  console.error('Re-embedding failed:', err);
  await closeDb();
  process.exit(1);
});
