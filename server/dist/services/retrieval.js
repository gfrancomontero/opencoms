import { getAllChunksWithEmbeddings } from './database.js';
import { embed, bufferToEmbedding } from './embeddings.js';
import { chatStream } from './ollama.js';
import { TOP_K, CONTEXT_CAP, MAX_CHUNKS_PER_FILE } from '../config.js';
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
function dotProduct(a, b) {
    let dot = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
    }
    return dot;
}
// ── Keyword Extraction ──────────────────────────────────
function extractKeywords(query) {
    // Remove common stop words, keep meaningful terms
    const stopWords = new Set([
        'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'it', 'they',
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'is', 'was', 'are', 'were', 'be', 'been',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
        'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those',
        'what', 'which', 'who', 'when', 'where', 'how', 'all', 'each', 'every',
        'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'not',
        'only', 'same', 'so', 'than', 'too', 'very', 'just', 'about', 'if',
        'make', 'list', 'give', 'tell', 'show', 'find', 'get', 'go', 'went',
        'been', 'done', 'any', 'also', 'there', 'then', 'here', 'out', 'up',
        'down', 'off', 'over', 'under', 'again', 'once', 'much', 'many',
        'point', 'bullet', 'please', 'did', 'travelled', 'traveled', 'travel',
        've', 'ever',
    ]);
    return query
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 2 && !stopWords.has(w));
}
// ── Hybrid Retrieval ────────────────────────────────────
export async function retrieveChunks(query, topK = TOP_K) {
    const queryEmbedding = await embed(query);
    const cachedChunks = getChunksFromCache();
    if (cachedChunks.length === 0) {
        return [];
    }
    const keywords = extractKeywords(query);
    // Score every chunk: semantic + keyword boost
    const scored = [];
    for (const chunk of cachedChunks) {
        const semanticScore = dotProduct(queryEmbedding, chunk.embedding);
        let metadata = {};
        try {
            metadata = JSON.parse(chunk.metadata_json || '{}');
        }
        catch { /* ignore */ }
        // Keyword matching: check chunk content AND file path
        let keywordHits = 0;
        if (keywords.length > 0) {
            const searchText = (chunk.file_path + ' ' + chunk.content).toLowerCase();
            for (const kw of keywords) {
                if (searchText.includes(kw)) {
                    keywordHits++;
                }
            }
        }
        // Keyword boost: 0.15 per keyword hit (significant but doesn't override strong semantic matches)
        const keywordScore = keywords.length > 0
            ? (keywordHits / keywords.length) * 0.15
            : 0;
        scored.push({
            content: chunk.content,
            filePath: chunk.file_path,
            fileName: path.basename(chunk.file_path),
            metadata,
            semanticScore,
            keywordScore,
            score: semanticScore + keywordScore,
        });
    }
    // Sort by combined score
    scored.sort((a, b) => b.score - a.score);
    // Enforce per-file diversity: max N chunks per file
    const result = [];
    const fileChunkCounts = new Map();
    for (const item of scored) {
        if (result.length >= topK)
            break;
        const count = fileChunkCounts.get(item.filePath) || 0;
        if (count >= MAX_CHUNKS_PER_FILE)
            continue;
        fileChunkCounts.set(item.filePath, count + 1);
        result.push({
            content: item.content,
            filePath: item.filePath,
            fileName: item.fileName,
            metadata: item.metadata,
            score: item.score,
        });
    }
    return result;
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
    // Retrieve relevant chunks via hybrid search
    const retrievalStart = Date.now();
    const chunks = await retrieveChunks(query);
    const retrievalMs = Date.now() - retrievalStart;
    const uniqueFiles = new Set(chunks.map((c) => c.filePath)).size;
    yield { type: 'log', data: { step: 'retrieval', message: `Retrieved ${chunks.length} chunks from ${uniqueFiles} files in ${retrievalMs}ms`, timestamp: Date.now() } };
    if (chunks.length === 0) {
        yield { type: 'token', data: "I don't have any documents indexed yet. Please select a folder and wait for indexing to complete." };
        yield { type: 'done', data: null };
        return;
    }
    // Log top chunks
    for (const chunk of chunks.slice(0, 10)) {
        yield { type: 'log', data: {
                step: 'chunk',
                message: `Score ${chunk.score.toFixed(3)} | ${chunk.fileName} | ${chunk.content.slice(0, 100).replace(/\n/g, ' ')}...`,
                timestamp: Date.now(),
            } };
    }
    if (chunks.length > 10) {
        yield { type: 'log', data: { step: 'chunk', message: `... and ${chunks.length - 10} more chunks`, timestamp: Date.now() } };
    }
    // Deduplicate sources for the UI: one entry per unique file
    const seenFiles = new Map();
    for (const c of chunks) {
        if (!seenFiles.has(c.filePath)) {
            seenFiles.set(c.filePath, {
                fileName: c.fileName,
                filePath: c.filePath,
                page: c.metadata.page,
                sheet: c.metadata.sheet,
                score: Math.round(c.score * 100) / 100,
            });
        }
    }
    const sources = Array.from(seenFiles.values());
    yield { type: 'sources', data: sources };
    const context = buildContext(chunks);
    yield { type: 'log', data: { step: 'context', message: `Context built: ${context.length} chars from ${chunks.length} chunks across ${uniqueFiles} files`, timestamp: Date.now() } };
    const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...chatHistory.slice(-6),
        {
            role: 'user',
            content: `Here are my personal documents:\n\n${context}\n\nBased on the documents above, answer this question: ${query}\n\nIMPORTANT: You MUST answer using the documents above. Be thorough — go through EVERY document provided and extract ALL relevant information. The folder paths contain dates and trip names — use them. Airport codes like PTY=Panama, MGA=Managua, AGP=Malaga, JFK=New York, MAD=Madrid, LHR=London, etc. Documents may be in any language — translate if needed. Cite sources as [Source: filename]. Do NOT say "I don't know" — the documents above are relevant, use them.`,
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