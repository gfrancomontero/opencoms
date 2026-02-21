import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { loadConfig, saveConfig } from './config.js';
import { log, onLog } from './logger.js';
import { isOllamaRunning } from './services/ollama.js';
import { openFolderPicker } from './services/folder-picker.js';
import { indexFolder, indexEvents } from './services/indexer.js';
import { answerQuery } from './services/retrieval.js';
import { startWatching, stopWatching } from './services/watcher.js';
import { getFileCount, getChunkCount, getAllFiles } from './services/database.js';
import { isModelDownloaded } from './services/embeddings.js';

export function createServer(port: number): express.Application {
  const app = express();

  // Security: bind to localhost only, restrict CORS
  app.use(cors({
    origin: [`http://127.0.0.1:${port}`, `http://localhost:${port}`],
    credentials: false,
  }));

  app.use(express.json());

  // Serve the built frontend
  const webDistPath = path.join(import.meta.dirname, '../../web/dist');
  if (fs.existsSync(webDistPath)) {
    app.use(express.static(webDistPath));
  }

  // ---- SSE endpoint for real-time logs and progress ----
  app.get('/api/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const sendEvent = (event: string, data: any) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Send current status immediately
    const config = loadConfig();
    sendEvent('status', {
      folder: config.folder,
      firstRunComplete: config.firstRunComplete,
      fileCount: getFileCount(),
      chunkCount: getChunkCount(),
    });

    // Forward log events
    const unsubLog = onLog((level, message) => {
      sendEvent('log', { level, message, timestamp: Date.now() });
    });

    // Forward index progress
    const onProgress = (progress: any) => {
      sendEvent('progress', progress);
    };
    indexEvents.on('progress', onProgress);

    req.on('close', () => {
      unsubLog();
      indexEvents.off('progress', onProgress);
    });
  });

  // ---- Status ----
  app.get('/api/status', async (_req, res) => {
    const config = loadConfig();
    const ollamaUp = await isOllamaRunning();
    res.json({
      folder: config.folder,
      port: config.port,
      chatModel: config.chatModel,
      firstRunComplete: config.firstRunComplete,
      privacyMode: config.privacyMode,
      ollamaRunning: ollamaUp,
      embeddingModelReady: isModelDownloaded(),
      fileCount: getFileCount(),
      chunkCount: getChunkCount(),
    });
  });

  // ---- Files ----
  app.get('/api/files', (_req, res) => {
    const files = getAllFiles();
    res.json({ files });
  });

  // ---- Folder selection ----
  app.post('/api/folder', async (req, res) => {
    const { path: manualPath, usePicker } = req.body;

    let folder: string | null = null;

    if (usePicker) {
      folder = openFolderPicker();
      if (!folder) {
        res.json({ success: false, message: 'Folder selection cancelled' });
        return;
      }
    } else if (manualPath) {
      folder = manualPath;
    }

    if (!folder || !fs.existsSync(folder)) {
      res.status(400).json({ success: false, message: 'Invalid folder path' });
      return;
    }

    saveConfig({ folder });
    res.json({ success: true, folder });

    // Start indexing in background
    stopWatching();
    indexFolder(folder)
      .then(() => {
        startWatching(folder!);
      })
      .catch((err) => {
        log.error(`Indexing failed: ${err.message}`);
      });
  });

  // ---- First run acknowledgement ----
  app.post('/api/acknowledge-security', (_req, res) => {
    saveConfig({ firstRunComplete: true });
    res.json({ success: true });
  });

  // ---- Privacy mode toggle ----
  app.post('/api/privacy-mode', (req, res) => {
    const { enabled } = req.body;
    saveConfig({ privacyMode: !!enabled });
    res.json({ success: true, privacyMode: !!enabled });
  });

  // ---- Reindex ----
  app.post('/api/reindex', async (_req, res) => {
    const config = loadConfig();
    if (!config.folder) {
      res.status(400).json({ success: false, message: 'No folder selected' });
      return;
    }

    res.json({ success: true, message: 'Reindexing started' });

    stopWatching();
    try {
      await indexFolder(config.folder);
      startWatching(config.folder);
    } catch (err: any) {
      log.error(`Reindex failed: ${err.message}`);
    }
  });

  // ---- Chat (streaming SSE) ----
  app.post('/api/chat', async (req, res) => {
    const { message, history = [] } = req.body;

    if (!message) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    try {
      for await (const event of answerQuery(message, history)) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (err: any) {
      res.write(`data: ${JSON.stringify({ type: 'error', data: err.message })}\n\n`);
    }

    res.end();
  });

  // ---- SPA fallback ----
  app.get('*', (_req, res) => {
    const indexPath = path.join(webDistPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(200).send('OpenComs server is running. Build the web UI with: npm run build --workspace=web');
    }
  });

  return app;
}
