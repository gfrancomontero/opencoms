import chokidar from 'chokidar';
import path from 'path';
import { SUPPORTED_EXTENSIONS } from '../config.js';
import { log } from '../logger.js';
import { indexSingleFile, removeFileFromIndex } from './indexer.js';

let watcher: chokidar.FSWatcher | null = null;
let debounceTimers = new Map<string, NodeJS.Timeout>();

const DEBOUNCE_MS = 2000;

function isSupportedFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_EXTENSIONS.includes(ext);
}

function debounce(filePath: string, fn: () => void): void {
  const existing = debounceTimers.get(filePath);
  if (existing) clearTimeout(existing);
  debounceTimers.set(
    filePath,
    setTimeout(() => {
      debounceTimers.delete(filePath);
      fn();
    }, DEBOUNCE_MS),
  );
}

export function startWatching(folder: string): void {
  if (watcher) {
    watcher.close();
  }

  log.info('Watching folder for changes...');

  watcher = chokidar.watch(folder, {
    persistent: true,
    ignoreInitial: true,
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    usePolling: false,
    awaitWriteFinish: {
      stabilityThreshold: 1000,
      pollInterval: 200,
    },
  });

  watcher.on('add', (filePath) => {
    if (!isSupportedFile(filePath)) return;
    debounce(filePath, () => {
      indexSingleFile(filePath, folder).catch((err) => {
        log.warn(`Failed to index new file: ${err.message}`);
      });
    });
  });

  watcher.on('change', (filePath) => {
    if (!isSupportedFile(filePath)) return;
    debounce(filePath, () => {
      indexSingleFile(filePath, folder).catch((err) => {
        log.warn(`Failed to re-index file: ${err.message}`);
      });
    });
  });

  watcher.on('unlink', (filePath) => {
    if (!isSupportedFile(filePath)) return;
    removeFileFromIndex(filePath, folder);
  });

  watcher.on('error', (error) => {
    log.error(`File watcher error: ${error.message}`);
  });
}

export function stopWatching(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
    for (const timer of debounceTimers.values()) {
      clearTimeout(timer);
    }
    debounceTimers.clear();
    log.info('Stopped watching folder');
  }
}
