import crypto from 'crypto';
import { CHUNK_SIZE, CHUNK_OVERLAP } from '../config.js';

export interface ChunkMetadata {
  file_path: string;
  file_type: string;
  chunk_index: number;
  page?: number;
  sheet?: string;
  section_index?: number;
  content_hash: string;
  last_modified: number;
  extraction_version: string;
}

export interface Chunk {
  content: string;
  metadata: ChunkMetadata;
}

const EXTRACTION_VERSION = '1.0.0';

export function chunkText(
  text: string,
  filePath: string,
  fileType: string,
  lastModified: number,
  pageCount?: number,
): Chunk[] {
  if (!text || text.trim().length === 0) return [];

  const chunks: Chunk[] = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    const content = text.slice(start, end);

    if (content.trim().length === 0) {
      start = end;
      continue;
    }

    const contentHash = crypto.createHash('sha256').update(content).digest('hex');

    const metadata: ChunkMetadata = {
      file_path: filePath,
      file_type: fileType,
      chunk_index: chunkIndex,
      content_hash: contentHash,
      last_modified: lastModified,
      extraction_version: EXTRACTION_VERSION,
    };

    // Estimate page number for PDFs
    if (pageCount && pageCount > 0) {
      const charPosition = start / text.length;
      metadata.page = Math.floor(charPosition * pageCount) + 1;
    }

    chunks.push({ content, metadata });
    chunkIndex++;

    // Move forward by chunk_size minus overlap
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }

  return chunks;
}
