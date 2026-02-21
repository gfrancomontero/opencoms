import Database from 'better-sqlite3';
export declare function getDb(): Database.Database;
export declare function closeDb(): void;
export declare function upsertFile(filePath: string, fileType: string, lastModified: number, status: string, errorMessage?: string): void;
export declare function getFile(filePath: string): {
    file_path: string;
    file_type: string;
    last_modified: number;
    status: string;
    error_message: string | null;
} | undefined;
export declare function getAllFiles(): any[];
export declare function removeFile(filePath: string): void;
export declare function deleteChunksForFile(filePath: string): void;
export declare function insertChunk(filePath: string, chunkIndex: number, content: string, metadataJson: string, contentHash: string, embeddingBlob: Buffer | null): void;
export declare function getAllChunksWithEmbeddings(): Array<{
    id: number;
    file_path: string;
    chunk_index: number;
    content: string;
    metadata_json: string;
    embedding_blob: Buffer;
}>;
export declare function getFileCount(): number;
export declare function getChunkCount(): number;
export declare function getSetting(key: string): string | undefined;
export declare function setSetting(key: string, value: string): void;
//# sourceMappingURL=database.d.ts.map