import { getAllChunksWithEmbeddings } from './database.js';
import { embed, bufferToEmbedding } from './embeddings.js';
import { chatStream } from './ollama.js';
import { TOP_K, CONTEXT_CAP } from '../config.js';
import { log } from '../logger.js';
import path from 'path';

interface RetrievedChunk {
  content: string;
  filePath: string;
  fileName: string;
  metadata: Record<string, any>;
  score: number;
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export async function retrieveChunks(query: string, topK: number = TOP_K): Promise<RetrievedChunk[]> {
  const queryEmbedding = await embed(query);
  const allChunks = getAllChunksWithEmbeddings();

  if (allChunks.length === 0) {
    return [];
  }

  const scored = allChunks.map((chunk) => {
    const chunkEmbedding = bufferToEmbedding(chunk.embedding_blob);
    const score = cosineSimilarity(queryEmbedding, chunkEmbedding);
    let metadata: Record<string, any> = {};
    try {
      metadata = JSON.parse(chunk.metadata_json || '{}');
    } catch { /* ignore */ }

    return {
      content: chunk.content,
      filePath: chunk.file_path,
      fileName: path.basename(chunk.file_path),
      metadata,
      score,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

function buildContext(chunks: RetrievedChunk[]): string {
  const parts: string[] = [];
  let totalLen = 0;

  for (const chunk of chunks) {
    const location = chunk.metadata.page
      ? `(Page ${chunk.metadata.page})`
      : chunk.metadata.sheet
        ? `(Sheet: ${chunk.metadata.sheet})`
        : '';

    const header = `--- Source: ${chunk.fileName} ${location} ---`;
    const section = `${header}\n${chunk.content}\n`;

    if (totalLen + section.length > CONTEXT_CAP) break;
    parts.push(section);
    totalLen += section.length;
  }

  return parts.join('\n');
}

const SYSTEM_PROMPT = `You are a helpful document assistant. Answer the user's question using ONLY the provided document context below.

Rules:
- Only use information from the provided context to answer
- Always cite which document (file name) and location (page/sheet) your answer comes from
- If the answer is not in the context, say "I don't know based on your documents."
- Never make up or hallucinate file names or information
- Be concise and direct
- Format citations like: [Source: filename.pdf, Page X]`;

export async function* answerQuery(
  query: string,
  chatHistory: Array<{ role: string; content: string }> = [],
): AsyncGenerator<{ type: 'sources' | 'token' | 'done'; data: any }> {
  log.info(`Processing query: "${query.slice(0, 80)}..."`);

  const chunks = await retrieveChunks(query);

  if (chunks.length === 0) {
    yield { type: 'token', data: "I don't have any documents indexed yet. Please select a folder and wait for indexing to complete." };
    yield { type: 'done', data: null };
    return;
  }

  // Emit sources
  const sources = chunks.map((c) => ({
    fileName: c.fileName,
    filePath: c.filePath,
    page: c.metadata.page,
    sheet: c.metadata.sheet,
    score: Math.round(c.score * 100) / 100,
  }));
  yield { type: 'sources', data: sources };

  const context = buildContext(chunks);

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...chatHistory.slice(-6), // keep last 3 exchanges
    {
      role: 'user',
      content: `Context from documents:\n${context}\n\nQuestion: ${query}`,
    },
  ];

  for await (const token of chatStream(messages)) {
    yield { type: 'token', data: token };
  }

  yield { type: 'done', data: null };
}
