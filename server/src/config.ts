import path from 'path';
import os from 'os';
import fs from 'fs';

const HOME = os.homedir();
export const OPENCOMS_DIR = path.join(HOME, '.opencoms');
export const APP_DIR = path.join(OPENCOMS_DIR, 'app');
export const MODELS_DIR = path.join(OPENCOMS_DIR, 'models');
export const DB_PATH = path.join(OPENCOMS_DIR, 'database.sqlite');
export const CONFIG_PATH = path.join(OPENCOMS_DIR, 'config.json');
export const PID_FILE = path.join(OPENCOMS_DIR, 'server.pid');

export const DEFAULT_PORT = 4545;
export const OLLAMA_URL = 'http://127.0.0.1:11434';
export const DEFAULT_CHAT_MODEL = 'qwen2.5:14b';
export const EMBEDDING_MODEL_NAME = 'all-MiniLM-L6-v2';
export const EMBEDDING_DIMS = 384;

export const CHUNK_SIZE = 3000;
export const CHUNK_OVERLAP = 300;
export const TOP_K = 8;
export const CONTEXT_CAP = 20000;

export const SUPPORTED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx'];

export interface AppConfig {
  folder?: string;
  port: number;
  chatModel: string;
  firstRunComplete: boolean;
  privacyMode: boolean;
}

export function ensureDirs(): void {
  for (const dir of [OPENCOMS_DIR, MODELS_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export function loadConfig(): AppConfig {
  const defaults: AppConfig = {
    port: DEFAULT_PORT,
    chatModel: DEFAULT_CHAT_MODEL,
    firstRunComplete: false,
    privacyMode: false,
  };
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      return { ...defaults, ...JSON.parse(raw) };
    }
  } catch {
    // corrupted config, use defaults
  }
  return defaults;
}

export function saveConfig(config: Partial<AppConfig>): AppConfig {
  const current = loadConfig();
  const merged = { ...current, ...config };
  ensureDirs();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2));
  return merged;
}
