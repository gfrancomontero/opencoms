type LogLevel = 'info' | 'warn' | 'error' | 'verbose';
type LogListener = (level: LogLevel, message: string) => void;
export declare function setVerbose(v: boolean): void;
export declare function onLog(listener: LogListener): () => void;
export declare const log: {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
    verbose(message: string): void;
    step(current: number, total: number, message: string): void;
};
export {};
//# sourceMappingURL=logger.d.ts.map