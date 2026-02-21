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
export declare function chunkText(text: string, filePath: string, fileType: string, lastModified: number, pageCount?: number): Chunk[];
//# sourceMappingURL=chunker.d.ts.map