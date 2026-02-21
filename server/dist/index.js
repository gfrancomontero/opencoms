import { createServer } from './server.js';
import { loadConfig, saveConfig, ensureDirs, PID_FILE, DEFAULT_PORT } from './config.js';
import { log, setVerbose } from './logger.js';
import { startOllama, ensureModelAvailable } from './services/ollama.js';
import { downloadEmbeddingModel, isModelDownloaded } from './services/embeddings.js';
import { indexFolder } from './services/indexer.js';
import { startWatching } from './services/watcher.js';
import { getDb, closeDb } from './services/database.js';
import { execSync } from 'child_process';
import fs from 'fs';
import net from 'net';
async function findAvailablePort(startPort) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.listen(startPort, '127.0.0.1', () => {
            server.close(() => resolve(startPort));
        });
        server.on('error', () => {
            resolve(findAvailablePort(startPort + 1));
        });
    });
}
export async function start(options = {}) {
    ensureDirs();
    if (options.verbose) {
        setVerbose(true);
    }
    const config = loadConfig();
    const requestedPort = options.port || config.port || DEFAULT_PORT;
    const port = await findAvailablePort(requestedPort);
    if (options.folder) {
        saveConfig({ folder: options.folder });
    }
    const totalSteps = 5;
    let step = 0;
    // Step 1: Start Ollama
    log.step(++step, totalSteps, 'Starting local AI engine (Ollama)...');
    try {
        await startOllama();
    }
    catch (err) {
        log.error(`Failed to start Ollama: ${err.message}`);
        log.info('Please install Ollama: https://ollama.com');
        process.exit(1);
    }
    // Step 2: Ensure chat model
    log.step(++step, totalSteps, `Ensuring chat model (${config.chatModel})...`);
    try {
        await ensureModelAvailable();
    }
    catch (err) {
        log.error(err.message);
        process.exit(1);
    }
    // Step 3: Ensure embedding model
    log.step(++step, totalSteps, 'Ensuring embedding model...');
    if (!isModelDownloaded()) {
        try {
            await downloadEmbeddingModel();
        }
        catch (err) {
            log.error(`Failed to download embedding model: ${err.message}`);
            process.exit(1);
        }
    }
    else {
        log.info('Embedding model ready');
    }
    // Step 4: Initialize database
    log.step(++step, totalSteps, 'Starting OpenComs...');
    getDb(); // initialize
    // Start the server
    const app = createServer(port);
    const server = app.listen(port, '127.0.0.1', () => {
        saveConfig({ port });
        // Write PID file
        fs.writeFileSync(PID_FILE, String(process.pid));
        log.step(step + 1, totalSteps, `Ready! Open your browser at http://localhost:${port}`);
        console.log(`\n  ✓ OpenComs is running at http://localhost:${port}\n`);
        console.log('  Everything runs locally on your computer.');
        console.log('  Nothing leaves your machine.\n');
        // Open browser unless suppressed
        if (!options.noBrowser) {
            try {
                execSync(`open http://localhost:${port}`);
            }
            catch {
                // ignore if open fails
            }
        }
    });
    // Start indexing if folder is configured
    const currentConfig = loadConfig();
    if (currentConfig.folder && fs.existsSync(currentConfig.folder)) {
        indexFolder(currentConfig.folder)
            .then(() => {
            startWatching(currentConfig.folder);
        })
            .catch((err) => {
            log.error(`Initial indexing failed: ${err.message}`);
        });
    }
    // Graceful shutdown
    const shutdown = () => {
        console.log('');
        console.log('');
        console.log('  \x1b[33mShutting down safely...\x1b[0m');
        server.close();
        closeDb();
        try {
            fs.unlinkSync(PID_FILE);
        }
        catch { /* ignore */ }
        console.log('');
        console.log('  \x1b[32m✓ OpenComs stopped.\x1b[0m');
        console.log('');
        console.log('  Type \x1b[1mopencoms start\x1b[0m in your terminal anytime to launch the app again.');
        console.log('');
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}
// Allow direct execution
const args = process.argv.slice(2);
if (args.includes('--start') || (import.meta.url === `file://${process.argv[1]}`)) {
    const options = {};
    const portIdx = args.indexOf('--port');
    if (portIdx !== -1 && args[portIdx + 1]) {
        options.port = parseInt(args[portIdx + 1]);
    }
    const folderIdx = args.indexOf('--folder');
    if (folderIdx !== -1 && args[folderIdx + 1]) {
        options.folder = args[folderIdx + 1];
    }
    if (args.includes('--verbose')) {
        options.verbose = true;
    }
    if (args.includes('--no-browser')) {
        options.noBrowser = true;
    }
    start(options).catch((err) => {
        console.error('Failed to start:', err.message);
        process.exit(1);
    });
}
//# sourceMappingURL=index.js.map