interface RetrievedChunk {
    content: string;
    filePath: string;
    fileName: string;
    metadata: Record<string, any>;
    score: number;
}
export declare function invalidateChunkCache(): void;
export declare function retrieveChunks(query: string, topK?: number): Promise<RetrievedChunk[]>;
export declare function answerQuery(query: string, chatHistory?: Array<{
    role: string;
    content: string;
}>): AsyncGenerator<{
    type: 'sources' | 'token' | 'done' | 'log';
    data: any;
}>;
export {};
//# sourceMappingURL=retrieval.d.ts.map