import { getAllChunksWithEmbeddings } from './database.js';
import { embed, bufferToEmbedding } from './embeddings.js';
import { chatStream } from './ollama.js';
import { TOP_K, CONTEXT_CAP } from '../config.js';
import { log } from '../logger.js';
import path from 'path';
let chunkCache = null;
export function invalidateChunkCache() {
    chunkCache = null;
    log.verbose('Embedding cache invalidated');
}
function getChunksFromCache() {
    if (chunkCache)
        return chunkCache;
    const t0 = Date.now();
    const allChunks = getAllChunksWithEmbeddings();
    chunkCache = allChunks.map((chunk) => ({
        id: chunk.id,
        file_path: chunk.file_path,
        chunk_index: chunk.chunk_index,
        content: chunk.content,
        metadata_json: chunk.metadata_json,
        embedding: bufferToEmbedding(chunk.embedding_blob),
    }));
    log.info(`Embedding cache loaded: ${chunkCache.length} chunks in ${Date.now() - t0}ms`);
    return chunkCache;
}
// Dot product — equivalent to cosine similarity when vectors are L2-normalized
// (our embeddings are normalized in meanPooling), so we skip the sqrt divisions.
function dotProduct(a, b) {
    let dot = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
    }
    return dot;
}
// ── Retrieval ────────────────────────────────────────────
export async function retrieveChunks(query, topK = TOP_K) {
    const queryEmbedding = await embed(query);
    const cachedChunks = getChunksFromCache();
    if (cachedChunks.length === 0) {
        return [];
    }
    const scored = cachedChunks.map((chunk) => {
        const score = dotProduct(queryEmbedding, chunk.embedding);
        let metadata = {};
        try {
            metadata = JSON.parse(chunk.metadata_json || '{}');
        }
        catch { /* ignore */ }
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
// ── Context Building ─────────────────────────────────────
function buildContext(chunks) {
    const parts = [];
    let totalLen = 0;
    for (const chunk of chunks) {
        const location = chunk.metadata.page
            ? `(Page ${chunk.metadata.page})`
            : chunk.metadata.sheet
                ? `(Sheet: ${chunk.metadata.sheet})`
                : '';
        // Include the full file path — folder names often contain dates and trip info
        const header = `--- Source: ${chunk.filePath} ${location} ---`;
        const section = `${header}\n${chunk.content}\n`;
        if (totalLen + section.length > CONTEXT_CAP)
            break;
        parts.push(section);
        totalLen += section.length;
    }
    return parts.join('\n');
}
// ── Answer Generation ────────────────────────────────────
const SYSTEM_PROMPT = `You are a helpful document assistant. You answer questions based on the user's personal documents.`;
export async function* answerQuery(query, chatHistory = []) {
    const t0 = Date.now();
    yield { type: 'log', data: { step: 'start', message: `Query: "${query}"`, timestamp: t0 } };
    // Retrieve relevant chunks
    const retrievalStart = Date.now();
    const chunks = await retrieveChunks(query);
    const retrievalMs = Date.now() - retrievalStart;
    yield { type: 'log', data: { step: 'retrieval', message: `Retrieved ${chunks.length} chunks in ${retrievalMs}ms`, timestamp: Date.now() } };
    if (chunks.length === 0) {
        yield { type: 'token', data: "I don't have any documents indexed yet. Please select a folder and wait for indexing to complete." };
        yield { type: 'done', data: null };
        return;
    }
    // Log each retrieved chunk
    for (const chunk of chunks) {
        yield { type: 'log', data: {
                step: 'chunk',
                message: `Score ${chunk.score.toFixed(3)} | ${chunk.fileName} | ${chunk.content.slice(0, 100).replace(/\n/g, ' ')}...`,
                timestamp: Date.now(),
            } };
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
    yield { type: 'log', data: { step: 'context', message: `Context built: ${context.length} chars from ${chunks.length} chunks`, timestamp: Date.now() } };
    const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...chatHistory.slice(-6), // keep last 3 exchanges
        {
            role: 'user',
            content: `Here are my personal documents:\n\n${context}\n\nBased on the documents above, answer this question: ${query}\n\nIMPORTANT: You MUST answer using the documents above. Summarize what you found. The folder paths contain dates and trip names — use them. Documents may be in any language — translate if needed. Cite sources as [Source: filename]. Do NOT say "I don't know" — the documents above are relevant, use them.`,
        },
    ];
    // Stream LLM response
    const llmStart = Date.now();
    let tokenCount = 0;
    for await (const token of chatStream(messages)) {
        yield { type: 'token', data: token };
        tokenCount++;
    }
    const llmMs = Date.now() - llmStart;
    yield { type: 'log', data: { step: 'llm', message: `LLM generated ${tokenCount} tokens in ${llmMs}ms (${Math.round(tokenCount / (llmMs / 1000))} tok/s)`, timestamp: Date.now() } };
    yield { type: 'log', data: { step: 'complete', message: `Total time: ${Date.now() - t0}ms`, timestamp: Date.now() } };
    yield { type: 'done', data: null };
}
//# sourceMappingURL=retrieval.js.map