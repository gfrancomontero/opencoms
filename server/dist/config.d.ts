export declare const OPENCOMS_DIR: string;
export declare const APP_DIR: string;
export declare const MODELS_DIR: string;
export declare const DB_PATH: string;
export declare const CONFIG_PATH: string;
export declare const PID_FILE: string;
export declare const DEFAULT_PORT = 4545;
export declare const OLLAMA_URL = "http://127.0.0.1:11434";
export declare const DEFAULT_CHAT_MODEL = "qwen2.5:14b";
export declare const EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2";
export declare const EMBEDDING_DIMS = 384;
export declare const CHUNK_SIZE = 3000;
export declare const CHUNK_OVERLAP = 300;
export declare const TOP_K = 30;
export declare const CONTEXT_CAP = 48000;
export declare const MAX_CHUNKS_PER_FILE = 2;
export declare const OLLAMA_NUM_CTX = 16384;
export declare const OLLAMA_TIMEOUT_MS = 600000;
export declare const SUPPORTED_EXTENSIONS: string[];
export interface AppConfig {
    folder?: string;
    port: number;
    chatModel: string;
    firstRunComplete: boolean;
    privacyMode: boolean;
}
export declare function ensureDirs(): void;
export declare function loadConfig(): AppConfig;
export declare function saveConfig(config: Partial<AppConfig>): AppConfig;
//# sourceMappingURL=config.d.ts.map