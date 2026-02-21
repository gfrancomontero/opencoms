export interface ExtractionResult {
    text: string;
    pages?: number;
    metadata: Record<string, any>;
}
export declare function extractText(filePath: string): Promise<ExtractionResult>;
//# sourceMappingURL=extractor.d.ts.map