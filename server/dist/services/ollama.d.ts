export declare function isOllamaRunning(): Promise<boolean>;
export declare function startOllama(): Promise<void>;
export declare function ensureModelAvailable(model?: string): Promise<void>;
export declare function chatStream(messages: Array<{
    role: string;
    content: string;
}>, model?: string): AsyncGenerator<string>;
//# sourceMappingURL=ollama.d.ts.map