export declare function isModelDownloaded(): boolean;
export declare function downloadEmbeddingModel(): Promise<void>;
export declare function embed(text: string): Promise<Float32Array>;
export declare function embeddingToBuffer(embedding: Float32Array): Buffer;
export declare function bufferToEmbedding(buf: Buffer): Float32Array;
//# sourceMappingURL=embeddings.d.ts.map