# OpenComs

**Fully local, private document chat for macOS.** Ask questions about your PDFs, Word docs, and spreadsheets — everything runs on your computer.

No accounts. No cloud. No tracking. No paid APIs.

---

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/gfrancomontero/opencoms/main/scripts/install.sh | bash
```

The installer handles everything: Homebrew, Node.js, Ollama, AI models, and the app itself.

# If you want to build + run from your local repo
```bash
# 1. Stop the server if running
opencoms stop 2>/dev/null

# 2. Wipe everything (app + database + config)
rm -rf ~/.opencoms

# 3. Remove the shell alias
sed -i '' '/opencoms/d' ~/.zshrc && source ~/.zshrc

# 4. Build and install from dev
cd "$HOME/code/opencoms"
npm run build
mkdir -p ~/.opencoms/app
cp -r . ~/.opencoms/app/
echo "alias opencoms='node /Users/gonzalofranco/.opencoms/app/bin/opencoms'" >> ~/.zshrc
source ~/.zshrc

# 5. Start
opencoms start

```

## Quick Start

```bash
opencoms start                        # Start and open browser
opencoms start --folder ~/Documents   # Start with a specific folder
opencoms status                       # Check if running
opencoms stop                         # Stop the server
opencoms reindex                      # Re-index all documents
```

---

## Why It's Secure

**For everyone:**
- Your documents never leave your computer
- The AI runs locally on your Mac — no internet needed after setup
- No user accounts, passwords, or sign-ups
- No analytics, tracking, or telemetry
- All data stored in one folder (`~/.opencoms`) that you can delete anytime

**For developers:**
- Server binds to `127.0.0.1` only (not `0.0.0.0`)
- CORS restricted to localhost
- No outbound network calls at runtime
- No third-party analytics or tracking libraries
- SQLite database with no network access
- Embedding model runs in-process via ONNX Runtime
- LLM runs via local Ollama instance
- Privacy Mode available to disable all network after install

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (localhost:4545)               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │ Security │→ │  Folder  │→ │ Indexing │→ │  Chat  │  │
│  │  Screen  │  │  Picker  │  │ Progress │  │   UI   │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP + SSE
┌────────────────────────┴────────────────────────────────┐
│                Express Server (Node.js)                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Extractor│  │ Chunker  │  │Embeddings│              │
│  │ PDF/DOCX │  │ 3000char │  │  ONNX    │              │
│  │ XLS/DOC  │  │ +overlap │  │ MiniLM   │              │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘              │
│       └──────────────┴─────────────┘                    │
│                      │                                   │
│  ┌───────────────────┴───────────────────┐              │
│  │          SQLite (local storage)        │              │
│  │  files │ chunks │ embeddings │ config  │              │
│  └───────────────────────────────────────┘              │
│                      │                                   │
│  ┌───────────────────┴───────────────────┐              │
│  │     Retrieval + RAG Pipeline           │              │
│  │  1. Embed query (ONNX)                │              │
│  │  2. Cosine similarity search          │              │
│  │  3. Build context (top 8, 20k cap)    │              │
│  │  4. Ask LLM with citations            │              │
│  └───────────────────┬───────────────────┘              │
│                      │                                   │
└──────────────────────┼───────────────────────────────────┘
                       │ HTTP (localhost only)
┌──────────────────────┴───────────────────────────────────┐
│              Ollama (localhost:11434)                      │
│              Local LLM: qwen2.5:14b                          │
└──────────────────────────────────────────────────────────┘
```

## Data Flow

1. **User selects a folder** via native macOS folder picker
2. **Scanner** recursively finds `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx` files
3. **Extractor** reads each file (pdf-parse, textutil, mammoth, SheetJS)
4. **Chunker** splits text into 3000-char chunks with 300-char overlap
5. **Embedder** generates 384-dim vectors locally via ONNX (all-MiniLM-L6-v2)
6. **Database** stores chunks + embeddings in SQLite
7. **Watcher** monitors folder for changes, re-indexes incrementally
8. **User asks a question** in the chat UI
9. **Retriever** embeds the query, finds top-8 similar chunks via cosine similarity
10. **LLM** (Ollama/qwen2.5:14b) generates an answer using only the retrieved context
11. **Response** streams back with citations (file name, page number)

## Supported File Types

| Type | Library | Notes |
|------|---------|-------|
| `.pdf` | pdf-parse | Page-by-page extraction, page numbers preserved |
| `.docx` | textutil / mammoth | macOS native conversion preferred |
| `.doc` | textutil | macOS native conversion |
| `.xlsx` | SheetJS (xlsx) | Sheet names + cell coordinates preserved |
| `.xls` | SheetJS (xlsx) | Legacy format support |

## How Retrieval Works

OpenComs uses Retrieval-Augmented Generation (RAG):

1. Your query is converted to a 384-dimensional vector using the same embedding model that indexed your documents
2. This vector is compared against all stored chunk vectors using cosine similarity
3. The top 8 most relevant chunks are selected (configurable via `TOP_K`)
4. These chunks are assembled into a context bundle (capped at 20,000 characters)
5. The context + your question are sent to the local LLM with instructions to:
   - Only answer from the provided context
   - Always cite sources
   - Say "I don't know" if the answer isn't in the context

## How to Add New File Types

1. Add the extension to `SUPPORTED_EXTENSIONS` in `server/src/config.ts`
2. Add an extraction function in `server/src/services/extractor.ts`:
   ```typescript
   async function extractMyType(filePath: string): Promise<ExtractionResult> {
     // Read the file and return { text, metadata }
   }
   ```
3. Add a case in the `extractText` switch statement
4. The chunking, embedding, and retrieval pipeline handles everything else

## How to Swap Models

### Chat Model
```bash
# Pull any Ollama model
ollama pull mistral

# Update config
echo '{"chatModel": "mistral"}' > ~/.opencoms/config.json
```

Or change `DEFAULT_CHAT_MODEL` in `server/src/config.ts`.

### Embedding Model
Requires an ONNX-format model. Download to `~/.opencoms/models/<name>/` and update `EMBEDDING_MODEL_NAME` and `EMBEDDING_DIMS` in `config.ts`.

## Security Model & Threat Model

### What's Protected
- Document content never transmitted over network
- No third-party services receive your data
- Server only accessible from your machine (127.0.0.1)
- No persistent cookies, sessions, or authentication tokens
- Privacy Mode disables all network after initial setup

### What's NOT Protected
- Other processes on your Mac can access the SQLite database
- Anyone with physical access to your Mac can read `~/.opencoms/`
- The LLM may produce inaccurate summaries (verify against source)
- No encryption at rest (relies on macOS FileVault)

### Recommendations
- Enable FileVault for disk encryption
- Use macOS user account protection
- Delete `~/.opencoms/` when you no longer need the data

## Development

If you're working on OpenComs locally, you don't need to push to GitHub or reinstall. Just build and run from the project directory:

```bash
# Install dependencies
npm install

# Build everything (server + web UI) and run
npm run build && node bin/opencoms start

# Rebuild only the server (faster, skip if only backend changes)
npm run build --workspace=server && node bin/opencoms start

# Rebuild only the web UI
npm run build --workspace=web && node bin/opencoms start

# Run with a specific folder
npm run build && node bin/opencoms start --folder ~/Documents

# Run without opening the browser
npm run build && node bin/opencoms start --no-browser

# Run with verbose logging
npm run build && node bin/opencoms start --verbose
```

Ctrl+C to stop. Changes require a rebuild before they take effect.

## Uninstall

```bash
# 1. Stop the server
opencoms stop

# 2. Remove all OpenComs data, models, and app files
rm -rf ~/.opencoms

# 3. Remove the CLI symlink (if it exists)
rm -f /usr/local/bin/opencoms

# 4. Remove the shell alias from your shell config
#    For zsh (default on macOS):
sed -i '' '/opencoms/d' ~/.zshrc
#    For bash:
#    sed -i '' '/opencoms/d' ~/.bashrc

# 5. (Optional) Remove Ollama if you don't use it for anything else
brew uninstall ollama
```

Step 2 wipes everything: the SQLite database (all indexed content and embeddings), downloaded AI models, config, and PID files. No trace of your documents or data remains on the system.

## Known Limitations

- macOS only (uses AppleScript for folder picker, textutil for .doc conversion)
- Large document collections (10,000+ files) may take significant time to index
- Embedding model limited to 128 tokens per chunk query
- No support for images within documents
- No OCR for scanned PDFs
- Password-protected files are skipped

## No Paid Services

OpenComs is completely free and open source. It uses:
- **Ollama** (open source) for LLM inference
- **all-MiniLM-L6-v2** (open source, Apache 2.0) for embeddings
- **ONNX Runtime** (open source, MIT) for local model inference
- **SQLite** (public domain) for storage

No API keys. No subscriptions. No usage limits. No cost.

## License

MIT
