import { OLLAMA_URL, DEFAULT_CHAT_MODEL, loadConfig } from '../config.js';
import { log } from '../logger.js';
import { execSync, exec } from 'child_process';
export async function isOllamaRunning() {
    try {
        const resp = await fetch(`${OLLAMA_URL}/api/tags`);
        return resp.ok;
    }
    catch {
        return false;
    }
}
export async function startOllama() {
    const running = await isOllamaRunning();
    if (running) {
        log.verbose('Ollama is already running');
        return;
    }
    log.info('Starting Ollama...');
    // Start ollama serve in the background
    const child = exec('ollama serve', {
        env: { ...process.env },
    });
    child.unref();
    // Wait for it to be ready
    for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        if (await isOllamaRunning()) {
            log.info('Ollama is ready');
            return;
        }
    }
    throw new Error('Ollama failed to start within 30 seconds. Try running "ollama serve" manually.');
}
export async function ensureModelAvailable(model) {
    const modelName = model || loadConfig().chatModel || DEFAULT_CHAT_MODEL;
    try {
        const resp = await fetch(`${OLLAMA_URL}/api/tags`);
        if (!resp.ok)
            throw new Error('Cannot reach Ollama');
        const data = (await resp.json());
        const installed = data.models.map((m) => m.name.split(':')[0]);
        if (installed.includes(modelName)) {
            log.verbose(`Model ${modelName} is available`);
            return;
        }
    }
    catch {
        // fall through to pull
    }
    log.info(`Downloading model ${modelName}... (this may take a few minutes)`);
    try {
        execSync(`ollama pull ${modelName}`, { stdio: 'inherit' });
        log.info(`Model ${modelName} is ready`);
    }
    catch {
        throw new Error(`Failed to download model ${modelName}. Check your internet connection.`);
    }
}
export async function* chatStream(messages, model) {
    const modelName = model || loadConfig().chatModel || DEFAULT_CHAT_MODEL;
    const resp = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: modelName,
            messages,
            stream: true,
        }),
    });
    if (!resp.ok || !resp.body) {
        throw new Error(`Ollama chat failed: ${resp.statusText}`);
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
            if (!line.trim())
                continue;
            try {
                const parsed = JSON.parse(line);
                if (parsed.message?.content) {
                    yield parsed.message.content;
                }
            }
            catch {
                // skip malformed lines
            }
        }
    }
}
//# sourceMappingURL=ollama.js.map