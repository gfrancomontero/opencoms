import fs from 'fs';
import path from 'path';
import { SUPPORTED_EXTENSIONS } from '../config.js';
import { log } from '../logger.js';
import { extractText } from './extractor.js';
import { chunkText } from './chunker.js';
import { embed, embeddingToBuffer, isModelDownloaded } from './embeddings.js';
import {
  upsertFile, deleteChunksForFile, insertChunk,
  getFile, removeFile, getAllFiles,
} from './database.js';
import { EventEmitter } from 'events';
import { invalidateChunkCache } from './retrieval.js';

export const indexEvents = new EventEmitter();
indexEvents.setMaxListeners(50);

// Build the text that gets embedded — includes the file path so that
// folder names (trip destinations, dates, project names) become searchable.
function embeddableText(filePath: string, content: string): string {
  return `File: ${filePath}\n\n${content}`;
}

export interface IndexProgress {
  phase: string;
  current: number;
  total: number;
  file?: string;
  message: string;
}

function emitProgress(progress: IndexProgress): void {
  log.info(progress.message);
  indexEvents.emit('progress', progress);
}

function scanFolder(folder: string): string[] {
  const files: string[] = [];

  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTENSIONS.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  walk(folder);
  return files;
}

export async function indexFolder(folder: string): Promise<void> {
  if (!fs.existsSync(folder)) {
    throw new Error(`Folder not found: ${folder}`);
  }

  if (!isModelDownloaded()) {
    throw new Error('Embedding model not downloaded. Run the installer first.');
  }

  emitProgress({ phase: 'scanning', current: 0, total: 0, message: 'Scanning your folder for documents...' });

  const files = scanFolder(folder);
  emitProgress({ phase: 'scanning', current: 0, total: files.length, message: `Found ${files.length} documents. Starting indexing...` });

  if (files.length === 0) {
    emitProgress({ phase: 'done', current: 0, total: 0, message: 'No supported documents found in this folder.' });
    return;
  }

  // Remove files from DB that no longer exist on disk
  const dbFiles = getAllFiles();
  for (const dbFile of dbFiles) {
    if (!files.includes(dbFile.file_path)) {
      removeFile(dbFile.file_path);
      log.verbose(`Removed deleted file from index: ${dbFile.file_path}`);
    }
  }

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i];
    const relPath = path.relative(folder, filePath);
    const ext = path.extname(filePath).toLowerCase();

    try {
      const stat = fs.statSync(filePath);
      const lastModified = stat.mtimeMs;

      // Check if file needs re-indexing
      const existing = getFile(filePath);
      if (existing && existing.last_modified >= lastModified && existing.status === 'indexed') {
        log.verbose(`Skipping unchanged file: ${relPath}`);
        continue;
      }

      // Insert/update the file record FIRST so chunks can reference it (foreign key)
      upsertFile(filePath, ext, lastModified, 'processing');

      emitProgress({
        phase: 'extracting',
        current: i + 1,
        total: files.length,
        file: relPath,
        message: `Reading: ${relPath}...`,
      });

      const extraction = await extractText(filePath);

      emitProgress({
        phase: 'chunking',
        current: i + 1,
        total: files.length,
        file: relPath,
        message: `Processing: ${relPath}...`,
      });

      const chunks = chunkText(extraction.text, filePath, ext, lastModified, extraction.pages);

      // Remove old chunks for this file
      deleteChunksForFile(filePath);

      // Embed and store each chunk
      for (let j = 0; j < chunks.length; j++) {
        const chunk = chunks[j];

        emitProgress({
          phase: 'embedding',
          current: i + 1,
          total: files.length,
          file: relPath,
          message: `Creating private search index: ${relPath} (chunk ${j + 1}/${chunks.length})...`,
        });

        const embedding = await embed(embeddableText(filePath, chunk.content));
        const embBuffer = embeddingToBuffer(embedding);

        insertChunk(
          filePath,
          chunk.metadata.chunk_index,
          chunk.content,
          JSON.stringify(chunk.metadata),
          chunk.metadata.content_hash,
          embBuffer,
        );
      }

      // Mark file as successfully indexed
      upsertFile(filePath, ext, lastModified, 'indexed');
      log.verbose(`Indexed: ${relPath} (${chunks.length} chunks)`);
    } catch (err: any) {
      const msg = err?.message || 'Unknown error';
      log.warn(`Couldn't read ${relPath} (${msg}). Skipping.`);
      upsertFile(filePath, ext, 0, 'failed', msg);
    }
  }

  invalidateChunkCache();
  emitProgress({ phase: 'done', current: files.length, total: files.length, message: 'Done. You can now ask questions.' });
}

export async function indexSingleFile(filePath: string, folder: string): Promise<void> {
  const ext = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.includes(ext)) return;

  const relPath = path.relative(folder, filePath);

  try {
    const stat = fs.statSync(filePath);
    const lastModified = stat.mtimeMs;

    log.info(`Indexing new/changed file: ${relPath}...`);

    // Insert/update the file record FIRST so chunks can reference it (foreign key)
    upsertFile(filePath, ext, lastModified, 'processing');

    const extraction = await extractText(filePath);
    const chunks = chunkText(extraction.text, filePath, ext, lastModified, extraction.pages);

    deleteChunksForFile(filePath);

    for (const chunk of chunks) {
      const embedding = await embed(embeddableText(filePath, chunk.content));
      const embBuffer = embeddingToBuffer(embedding);
      insertChunk(filePath, chunk.metadata.chunk_index, chunk.content, JSON.stringify(chunk.metadata), chunk.metadata.content_hash, embBuffer);
    }

    // Mark file as successfully indexed
    upsertFile(filePath, ext, lastModified, 'indexed');
    log.info(`Indexed: ${relPath} (${chunks.length} chunks)`);

    invalidateChunkCache();
    indexEvents.emit('progress', {
      phase: 'update',
      current: 1,
      total: 1,
      file: relPath,
      message: `Updated: ${relPath}`,
    });
  } catch (err: any) {
    log.warn(`Couldn't read ${relPath}. Skipping.`);
    upsertFile(filePath, ext, 0, 'failed', err?.message);
  }
}

export function removeFileFromIndex(filePath: string, folder: string): void {
  const relPath = path.relative(folder, filePath);
  removeFile(filePath);
  invalidateChunkCache();
  log.info(`Removed from index: ${relPath}`);
  indexEvents.emit('progress', {
    phase: 'update',
    current: 1,
    total: 1,
    message: `Removed: ${relPath}`,
  });
}
