import { EventEmitter } from 'events';
export declare const indexEvents: EventEmitter<[never]>;
export interface IndexProgress {
    phase: string;
    current: number;
    total: number;
    file?: string;
    message: string;
}
export declare function indexFolder(folder: string): Promise<void>;
export declare function indexSingleFile(filePath: string, folder: string): Promise<void>;
export declare function removeFileFromIndex(filePath: string, folder: string): void;
//# sourceMappingURL=indexer.d.ts.map