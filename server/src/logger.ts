type LogLevel = 'info' | 'warn' | 'error' | 'verbose';

type LogListener = (level: LogLevel, message: string) => void;

const listeners: Set<LogListener> = new Set();
let verboseMode = false;

const GRAY = '\x1b[90m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const NC = '\x1b[0m';

function timestamp(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export function setVerbose(v: boolean): void {
  verboseMode = v;
}

export function onLog(listener: LogListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(level: LogLevel, message: string): void {
  for (const listener of listeners) {
    try {
      listener(level, message);
    } catch {
      // don't crash on listener errors
    }
  }
}

export const log = {
  info(message: string): void {
    console.log(`  ${GRAY}${timestamp()}${NC}  ${GREEN}✓${NC}  ${message}`);
    emit('info', message);
  },
  warn(message: string): void {
    console.log(`  ${GRAY}${timestamp()}${NC}  ${YELLOW}⚠${NC}  ${message}`);
    emit('warn', message);
  },
  error(message: string): void {
    console.error(`  ${GRAY}${timestamp()}${NC}  ${RED}✗${NC}  ${message}`);
    emit('error', message);
  },
  verbose(message: string): void {
    if (verboseMode) {
      console.log(`  ${GRAY}${timestamp()}${NC}  ${GRAY}·${NC}  ${GRAY}${message}${NC}`);
    }
    emit('verbose', message);
  },
  step(current: number, total: number, message: string): void {
    const line = `[${current}/${total}] ${message}`;
    console.log(`\n  ${GRAY}${timestamp()}${NC}  ${CYAN}${BOLD}${line}${NC}`);
    emit('info', line);
  },
  server(message: string): void {
    console.log(`  ${GRAY}${timestamp()}${NC}  ${CYAN}→${NC}  ${message}`);
    emit('info', message);
  },
  request(method: string, path: string, status: number): void {
    const color = status < 400 ? GREEN : status < 500 ? YELLOW : RED;
    console.log(`  ${GRAY}${timestamp()}${NC}  ${color}${method}${NC} ${path} ${GRAY}${status}${NC}`);
  },
};
