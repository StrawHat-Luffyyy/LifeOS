import { type ContinueProjectCitationDto } from '@lifeos/shared';
import {
  type StructuredProjectContext,
  type SemanticProjectContext,
} from '../context/project-context.engine.js';

export type EvidenceItem = ContinueProjectCitationDto;

/**
 * Formats structured and semantic project context into a indexed evidence pool ([E1], [E2], ...) (OD-3).
 */
export function buildEvidencePool(
  structured: StructuredProjectContext,
  semantic: SemanticProjectContext,
): { items: EvidenceItem[]; promptText: string } {
  const items: EvidenceItem[] = [];
  let index = 1;

  // 1. Project metadata
  if (structured.project.name) {
    items.push({
      index,
      text: `Project: ${structured.project.name}. ${structured.project.description || ''} (Status: ${structured.project.status})`,
      entityType: 'project',
      entityId: structured.project.id || 'project',
    });
    index++;
  }

  // 2. Open Tasks
  for (const t of structured.openTasks) {
    const blockedStr = t.isBlocked
      ? ` [BLOCKED by: ${t.blockingTaskTitles.join(', ')}]`
      : '';
    items.push({
      index,
      text: `Task "${t.title}" (Priority: ${t.priority}, Status: ${t.status}${blockedStr})`,
      entityType: 'task',
      entityId: t.id,
    });
    index++;
  }

  // 3. Recent Activity
  for (const a of structured.recentActivity) {
    items.push({
      index,
      text: `Activity: ${a.summary}`,
      entityType: 'activity',
      entityId: a.id,
    });
    index++;
  }

  // 4. Notes
  for (const n of semantic.notes) {
    items.push({
      index,
      text: `Note "${n.title}": ${n.content}`,
      entityType: 'note',
      entityId: n.id,
    });
    index++;
  }

  // 5. Document Chunks
  for (const d of semantic.documents) {
    items.push({
      index,
      text: `Document "${d.title}": ${d.content}`,
      entityType: 'document',
      entityId: d.id,
    });
    index++;
  }

  // 6. Memories
  for (const m of semantic.memories) {
    items.push({
      index,
      text: `Memory: ${m.content}`,
      entityType: 'memory',
      entityId: m.id,
    });
    index++;
  }

  const promptText = items
    .map((item) => `[E${item.index}] ${item.text}`)
    .join('\n');

  return { items, promptText };
}

export interface CitationValidationResult {
  valid: boolean;
  invalidIndices: number[];
  uncitedClaims: string[];
}

function isNonClaim(cleanLine: string): boolean {
  const lower = cleanLine.toLowerCase();
  return (
    lower.startsWith('no ') ||
    lower.startsWith('none') ||
    lower.includes('no recorded') ||
    lower.includes('been recorded') ||
    lower.includes('not recorded') ||
    lower.includes('no progress') ||
    lower.includes('no evidence') ||
    lower.includes('none recorded') ||
    lower.includes('no decisions') ||
    lower.includes('no blockers') ||
    lower.includes('n/a')
  );
}

/**
 * Dual-layer citation verification (OD-3, Addendum B-4):
 * 1. Checks that all cited indices [E(\d+)] exist within [1, maxIndex].
 * 2. Automated sentence-level grounding heuristic: substantive declarative claims (> 25 chars)
 *    must contain at least one citation tag [E\d+].
 */
export function validateCitations(
  summaryText: string,
  maxIndex: number,
): CitationValidationResult {
  const invalidIndices: number[] = [];
  const uncitedClaims: string[] = [];

  // Extract all citations
  const citationRegex = /\[E(\d+)\]/g;
  let match: RegExpExecArray | null;

  while ((match = citationRegex.exec(summaryText)) !== null) {
    const idx = parseInt(match[1]!, 10);
    if (isNaN(idx) || idx < 1 || idx > maxIndex) {
      if (!invalidIndices.includes(idx)) {
        invalidIndices.push(idx);
      }
    }
  }

  // Sentence-level grounding heuristic (B-4)
  const lines = summaryText.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    // Skip markdown headings and section labels
    if (
      line.startsWith('#') ||
      line.startsWith('**') ||
      line.endsWith(':') ||
      line.startsWith('Current State') ||
      line.startsWith('Recent Progress') ||
      line.startsWith('Open Tasks') ||
      line.startsWith('Recent Decisions') ||
      line.startsWith('Blockers') ||
      line.startsWith('Suggested Next Step')
    ) {
      continue;
    }

    // Clean bullet markers
    const cleanLine = line.replace(/^[-*•\d.]+\s*/, '').trim();
    if (isNonClaim(cleanLine)) {
      continue;
    }

    if (cleanLine.length > 25) {
      // Check if line contains at least one [E\d+]
      if (!/\[E\d+\]/.test(cleanLine)) {
        uncitedClaims.push(cleanLine);
      }
    }
  }

  const valid = invalidIndices.length === 0 && uncitedClaims.length === 0;

  return {
    valid,
    invalidIndices,
    uncitedClaims,
  };
}

/**
 * Strips claims that cite non-existent indices or lack grounding citations (OD-3).
 * Appends explicit disclaimer that ungrounded claims were omitted.
 */
export function stripUngroundedClaims(
  summaryText: string,
  maxIndex: number,
): { cleanedText: string; strippedCount: number } {
  const lines = summaryText.split('\n');
  const keptLines: string[] = [];
  let strippedCount = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      keptLines.push(rawLine);
      continue;
    }

    // Always preserve section headers and labels
    if (
      line.startsWith('#') ||
      line.startsWith('**') ||
      line.endsWith(':') ||
      line.startsWith('Current State') ||
      line.startsWith('Recent Progress') ||
      line.startsWith('Open Tasks') ||
      line.startsWith('Recent Decisions') ||
      line.startsWith('Blockers') ||
      line.startsWith('Suggested Next Step')
    ) {
      keptLines.push(rawLine);
      continue;
    }

    const cleanLine = line.replace(/^[-*•\d.]+\s*/, '').trim();
    if (isNonClaim(cleanLine)) {
      keptLines.push(rawLine);
      continue;
    }

    // Check if line has citations
    const citations = Array.from(line.matchAll(/\[E(\d+)\]/g)).map((m) =>
      parseInt(m[1]!, 10),
    );

    // If substantive claim (> 25 chars) has no citation, or has invalid index
    if (cleanLine.length > 25 && citations.length === 0) {
      strippedCount++;
      continue; // strip claim
    }

    const hasInvalidIndex = citations.some((idx) => idx < 1 || idx > maxIndex);
    if (hasInvalidIndex) {
      strippedCount++;
      continue; // strip claim
    }

    keptLines.push(rawLine);
  }

  let cleanedText = keptLines.join('\n').trim();
  if (strippedCount > 0) {
    cleanedText += '\n\n*(Note: Some statements were omitted due to lack of grounding evidence.)*';
  }

  return {
    cleanedText,
    strippedCount,
  };
}
