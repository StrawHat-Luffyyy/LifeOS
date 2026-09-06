import fs from 'fs/promises';
import { db } from '../../db/index.js';
import { activityEvents } from '../../db/schema/index.js';
import * as docRepo from './document.repository.js';
import { enqueueDocumentIngestion, type DocumentIngestionJobData } from './document-queue.js';
import { chunkText } from './chunker.js';
import { getEmbeddingProvider } from '../ai/embeddings/index.js';
import { getProject } from '../projects/project.service.js';
import {
  type DocumentDto,
  type DocumentChunkDto,
  type ListDocumentsQuery,
  type PaginatedResponse,
  type EventType,
  type EntityType,
} from '@lifeos/shared';

// ---------------------------------------------------------------------------
// Document Service
// ---------------------------------------------------------------------------

/**
 * Handle document upload, version creation, and queueing for ingestion (FR-DOC).
 */
export async function uploadDocument(
  userId: string,
  file: Express.Multer.File,
  input: { title?: string; projectId?: string },
): Promise<DocumentDto> {
  if (input.projectId) {
    await getProject(userId, input.projectId);
  }

  const ext = file.originalname.split('.').pop()?.toLowerCase() ?? 'txt';
  const fileType = (['pdf', 'txt', 'md'].includes(ext) ? ext : 'txt') as 'pdf' | 'txt' | 'md';
  const title = input.title?.trim() || file.originalname;

  const result = await db.transaction(async (tx) => {
    const doc = await docRepo.insertDocument(
      {
        userId,
        projectId: input.projectId ?? null,
        title,
        fileName: file.originalname,
        fileType,
        fileSize: file.size,
        filePath: file.path,
        status: 'queued',
      },
      tx,
    );

    const version = await docRepo.insertDocumentVersion(
      {
        documentId: doc.id,
        versionNumber: 1,
        filePath: file.path,
        fileSize: file.size,
      },
      tx,
    );

    await tx.insert(activityEvents).values({
      userId,
      eventType: 'DOCUMENT_QUEUED' satisfies EventType,
      entityType: 'document' satisfies EntityType,
      entityId: doc.id,
      projectId: doc.projectId,
      summary: `Queued document for ingestion: ${doc.title}`,
      metadata: {
        fileName: doc.fileName,
        fileType: doc.fileType,
        fileSize: doc.fileSize,
      },
    });

    return { doc, version };
  });

  // Enqueue background processing job
  await enqueueDocumentIngestion({
    documentId: result.doc.id,
    versionId: result.version.id,
    userId,
    filePath: file.path,
    fileType,
  });

  return toDocumentDto(result.doc);
}

/**
 * Get document by ID scoped to user.
 */
export async function getDocument(
  userId: string,
  documentId: string,
): Promise<DocumentDto> {
  const doc = await docRepo.findDocumentByIdOrThrow(documentId, userId);
  return toDocumentDto(doc);
}

/**
 * List documents with optional filters and pagination.
 */
export async function listDocuments(
  userId: string,
  query: ListDocumentsQuery,
): Promise<PaginatedResponse<DocumentDto>> {
  const { rows, total } = await docRepo.listDocuments(userId, query);

  return {
    success: true,
    data: rows.map(toDocumentDto),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

/**
 * Soft delete a document.
 */
export async function deleteDocument(
  userId: string,
  documentId: string,
): Promise<DocumentDto> {
  const result = await db.transaction(async (tx) => {
    const doc = await docRepo.softDeleteDocument(documentId, userId, tx);

    await tx.insert(activityEvents).values({
      userId,
      eventType: 'DOCUMENT_DELETED' satisfies EventType,
      entityType: 'document' satisfies EntityType,
      entityId: doc.id,
      projectId: doc.projectId,
      summary: `Deleted document: ${doc.title}`,
    });

    return doc;
  });

  return toDocumentDto(result);
}

/**
 * Get all ingested chunks for a document.
 */
export async function getDocumentChunks(
  userId: string,
  documentId: string,
): Promise<DocumentChunkDto[]> {
  await docRepo.findDocumentByIdOrThrow(documentId, userId);
  const chunks = await docRepo.findDocumentChunks(documentId, userId);

  return chunks.map((c) => ({
    id: c.id,
    documentVersionId: c.documentVersionId,
    documentId: c.documentId,
    userId: c.userId,
    projectId: c.projectId,
    content: c.content,
    chunkIndex: c.chunkIndex,
    createdAt: c.createdAt.toISOString(),
  }));
}

/**
 * Worker job handler: extracts text, chunks, embeds, and writes document_chunks (FR-DOC).
 */
export async function processDocumentIngestion(jobData: DocumentIngestionJobData): Promise<void> {
  const { documentId, versionId, userId, filePath, fileType } = jobData;

  try {
    await docRepo.updateDocumentStatus(documentId, 'processing');

    // 1. Extract text
    let rawText = '';
    if (fileType === 'pdf') {
      const buffer = await fs.readFile(filePath);
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: buffer });
      const res = await parser.getText();
      rawText = res.text ?? '';
    } else {
      rawText = await fs.readFile(filePath, 'utf-8');
    }

    if (!rawText.trim()) {
      throw new Error('Extracted text is empty or could not be parsed');
    }

    // 2. Chunk text
    const chunks = chunkText(rawText);
    if (chunks.length === 0) {
      throw new Error('No valid chunks generated from document content');
    }

    // 3. Generate embeddings
    const provider = getEmbeddingProvider();
    const embeddings = await provider.embedBatch(chunks);

    // 4. Look up document for projectId
    const doc = await docRepo.findDocumentById(documentId, userId);

    // 5. Save chunks transactionally
    await db.transaction(async (tx) => {
      // Clear any prior chunks for this version
      await docRepo.deleteDocumentChunksByVersion(versionId, tx);

      const chunkRows = chunks.map((content, idx) => ({
        documentVersionId: versionId,
        documentId,
        userId,
        projectId: doc?.projectId ?? null,
        content,
        chunkIndex: idx,
        embedding: embeddings[idx],
        embeddingModel: provider.modelName,
      }));

      await docRepo.insertDocumentChunks(chunkRows, tx);
      await docRepo.updateDocumentStatus(documentId, 'ready', null, tx);

      await tx.insert(activityEvents).values({
        userId,
        eventType: 'DOCUMENT_INGESTED' satisfies EventType,
        entityType: 'document' satisfies EntityType,
        entityId: documentId,
        projectId: doc?.projectId ?? null,
        summary: `Ingested document: ${doc?.title ?? 'document'} (${chunks.length} chunks)`,
        metadata: {
          chunkCount: chunks.length,
          model: provider.modelName,
        },
      });
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`Document ingestion failed for document ${documentId}:`, errorMsg);

    await docRepo.updateDocumentStatus(documentId, 'failed', errorMsg);

    await db.insert(activityEvents).values({
      userId,
      eventType: 'DOCUMENT_FAILED' satisfies EventType,
      entityType: 'document' satisfies EntityType,
      entityId: documentId,
      summary: `Failed to ingest document: ${errorMsg}`,
      metadata: { error: errorMsg },
    });

    throw err;
  }
}

// ---------------------------------------------------------------------------
// DTO mapping
// ---------------------------------------------------------------------------

export function toDocumentDto(row: docRepo.DocumentRow): DocumentDto {
  return {
    id: row.id,
    userId: row.userId,
    projectId: row.projectId,
    title: row.title,
    fileName: row.fileName,
    fileType: row.fileType as DocumentDto['fileType'],
    fileSize: row.fileSize,
    status: row.status as DocumentDto['status'],
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
