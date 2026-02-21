# Contributing to OpenComs

Thanks for your interest in improving OpenComs! This document covers how to get started.

## Development Setup

```bash
# Clone and install
git clone https://github.com/gfrancomontero/opencoms.git
cd opencoms
npm install

# Start in dev mode (hot reload for both server and frontend)
npm run dev

# Or start individually
npm run dev:server   # TypeScript server with tsx watch
npm run dev:web      # Vite dev server with HMR
```

## Project Structure

```
/server          — Node.js + TypeScript backend
  /src
    /services    — Core services (database, embeddings, ollama, etc.)
    /routes      — API route handlers
    server.ts    — Express app setup
    index.ts     — Entry point + startup logic
    config.ts    — Configuration and paths
    logger.ts    — Logging system with SSE support

/web             — React + Vite frontend
  /src
    /components  — React components per screen
    App.tsx      — Main app with screen routing
    api.ts       — API client + SSE helpers

/scripts         — Installation scripts
/bin             — CLI entry point
```

## Adding a New File Type

1. Add the extension to `SUPPORTED_EXTENSIONS` in `server/src/config.ts`
2. Add an extraction function in `server/src/services/extractor.ts`
3. The chunking, embedding, and indexing pipeline handles the rest automatically

## Swapping Models

### Chat Model
Change `DEFAULT_CHAT_MODEL` in `server/src/config.ts` or set it in `~/.opencoms/config.json`. Any model available in Ollama will work.

### Embedding Model
The embedding model requires ONNX format. To swap:
1. Download a new model in ONNX format to `~/.opencoms/models/<model-name>/`
2. Update `EMBEDDING_MODEL_NAME` and `EMBEDDING_DIMS` in `config.ts`
3. Update the tokenizer logic in `embeddings.ts` if the tokenizer format differs

## Code Guidelines

- TypeScript strict mode
- No external API calls at runtime
- All data stays local in `~/.opencoms/`
- User-facing messages should be friendly and non-technical
- Error messages should suggest fixes, not show stack traces

## Testing

```bash
# Build everything
npm run build

# Manual testing
opencoms start --verbose
```

## Pull Requests

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Ensure `npm run build` passes
5. Submit a PR with a clear description

## Reporting Issues

When reporting bugs, include:
- macOS version
- Node.js version (`node -v`)
- Ollama version (`ollama -v`)
- Error messages (run with `--verbose`)
