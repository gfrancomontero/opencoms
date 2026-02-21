type LogLevel = 'info' | 'warn' | 'error' | 'verbose';

type LogListener = (level: LogLevel, message: string) => void;

const listeners: Set<LogListener> = new Set();
let verboseMode = false;

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
    console.log(`  ${message}`);
    emit('info', message);
  },
  warn(message: string): void {
    console.log(`  ⚠ ${message}`);
    emit('warn', message);
  },
  error(message: string): void {
    console.error(`  ✗ ${message}`);
    emit('error', message);
  },
  verbose(message: string): void {
    if (verboseMode) {
      console.log(`  [verbose] ${message}`);
    }
    emit('verbose', message);
  },
  step(current: number, total: number, message: string): void {
    const line = `[${current}/${total}] ${message}`;
    console.log(`\n  ${line}`);
    emit('info', line);
  },
};
