Build this project end-to-end. Make reasonable defaults where unspecified. The result must be macOS-only, fully local (no paid APIs, no external LLM/embedding services), installable via terminal, and usable by non-technical users via a browser UI.

PROJECT: OpenComs (macOS) — Fully Local Private Document Chat

GOAL
OpenComs is a free, open-source macOS app that:
- Indexes a user-selected local folder (recursively)
- Extracts text from local documents (.pdf, .doc/.docx, .xls/.xlsx)
- Generates embeddings locally (no API)
- Runs a local LLM for answering questions (no API)
- Stores all data locally (chunks, embeddings, index)
- Serves a browser-based UI on localhost
- Provides clear, human-readable progress and “what’s happening” logs in both terminal and UI
- Emphasizes privacy/security as the first user-facing message

ABSOLUTE RULES
- No Claude/OpenAI/remote APIs for embeddings or generation.
- No sending document text off-device.
- Network calls are allowed ONLY for first-time installation/download of open-source dependencies (models/binaries), and must be clearly logged for the user.
- The app must work offline after installation completes.
- UX must be understandable to non-technical users.

--------------------------------------------------
USER FLOW (MUST MATCH)
--------------------------------------------------

A) Install in terminal
User runs:

curl -fsSL https://opencoms/install.sh | bash

B) Progress & logs in terminal during install/index bootstrap
- Installer prints friendly progress steps (not raw stack traces).
- Provide a “verbose” flag only for devs, but default output must be human-readable.

C) Once done it opens the browser automatically
- After successful first-run setup, open default browser to:
  http://localhost:<port>

D) Runs on a local port
- Default 4545, auto-increment if taken.

E) First thing user sees in browser: “Why this is secure”
- A dedicated “Security & Privacy” first-run screen explaining in plain language:
  - Nothing leaves your computer
  - Models run locally
  - Data stored locally
  - No accounts
  - No tracking
  - Optional offline mode
- Only after acknowledging, user proceeds to folder selection and indexing.

--------------------------------------------------
INSTALLATION REQUIREMENTS
--------------------------------------------------

The installer must:
- Verify macOS
- Ensure Homebrew exists (install if missing)
- Ensure Node.js >= 18 (install via brew if missing)
- Ensure Git exists
- Install all runtime dependencies that are required for local-only operation, including:
  - Ollama (local LLM runtime)
  - A default local chat model (download after Ollama install)
  - A local embedding model (ONNX) and runtime
- Clone repo to ~/.opencoms/app
- Install npm deps
- Build project
- Create global CLI symlink:
  /usr/local/bin/opencoms
- Print next steps and then automatically run:
  opencoms start

Important:
- During install, show clear steps and progress bars when possible:
  1) Installing system prerequisites
  2) Installing OpenComs
  3) Installing local AI engine (Ollama)
  4) Downloading local chat model
  5) Downloading local embedding model
  6) Validating installation
  7) Starting OpenComs

If any step fails:
- Print a clear reason and a single actionable fix line.

--------------------------------------------------
RUNTIME: LOCAL ONLY AI
--------------------------------------------------

LLM Generation (Local)
- Use Ollama running locally.
- If Ollama is not running, OpenComs starts it (or prompts user).
- Default model: choose a strong general model that is widely available in Ollama.
  - Default: llama3 (choose best available option by name; if model naming differs, implement a config).
- Implement streaming responses in UI if possible.

Ollama endpoints:
- http://localhost:11434 (default)
- Use /api/generate or /api/chat depending on model support.

Embeddings (Local)
- Use ONNX embeddings in-process with onnxruntime-node.
- Default embedding model: all-MiniLM-L6-v2 (384 dims).
- Download model on first install into:
  ~/.opencoms/models/

NO remote embedding calls.

--------------------------------------------------
FOLDER SELECTION
--------------------------------------------------

User can set folder:
- CLI:
  opencoms start --folder "/path"
- UI:
  “Choose Folder” button must open a native macOS folder picker.

Browser cannot do this alone.
Implement one of:
1) AppleScript (osascript) dialog to choose folder
2) A tiny Swift helper binary invoked by backend

Requirement:
- Must work for non-technical users from UI.
- Store selection in ~/.opencoms/config.json
- Index recursively including subfolders.

--------------------------------------------------
INDEXING + WATCHING
--------------------------------------------------

Supported types:
- .pdf
- .doc
- .docx
- .xls
- .xlsx

Discovery:
- Recursive traversal of chosen folder.

Watching:
- Continuous watch mode using chokidar (prefers fsevents on mac).
- On create/modify/delete/rename:
  - Re-extract and re-embed changed chunks only.
- Debounce changes and batch updates.

Human-readable logs (examples):
- “Scanning your folder for documents…”
- “Found 142 documents. Starting indexing…”
- “Reading: Contracts/Lease.pdf (page 3 of 12)…”
- “Creating private search index…”
- “Done. You can now ask questions.”

Error logs must be gentle:
- “Couldn’t read file X (maybe password-protected). Skipping.”

--------------------------------------------------
TEXT EXTRACTION
--------------------------------------------------

PDF:
- Extract page-by-page and preserve page numbers.

DOC/DOCX:
- Use mammoth for .docx
- For .doc (legacy), implement best-effort:
  - either convert via macOS built-in tools (textutil) if available
  - or mark unsupported with a helpful message
Prefer: use macOS `textutil` for .doc and .docx conversion to text when feasible.

XLS/XLSX:
- Use SheetJS (xlsx)
- Extract sheet name + cell coordinates
- Produce text representation that’s searchable.

Chunking:
- chunk_size: 3000 chars
- overlap: 300 chars
- Store metadata:
  - file_path
  - file_type
  - page OR sheet+range OR section index
  - chunk_index
  - content_hash
  - last_modified
  - extraction_version

--------------------------------------------------
LOCAL STORAGE
--------------------------------------------------

Use SQLite for everything:
- ~/.opencoms/database.sqlite

Tables:
files:
- file_path (PK)
- file_type
- last_modified
- status (indexed/failed)
- error_message

chunks:
- id (PK)
- file_path (FK)
- chunk_index
- content
- metadata_json
- content_hash
- embedding_blob (Float32Array as BLOB)
- created_at
- updated_at

Optional:
settings:
- key/value for config

Vector search:
- Load embeddings into memory on startup (or lazy load)
- Cosine similarity in JS
- top_k default: 8

This avoids native vector DB install friction.

--------------------------------------------------
RAG ANSWERING (LOCAL)
--------------------------------------------------

Answering pipeline:
1) Embed user query locally
2) Retrieve top_k chunks via cosine similarity
3) Build a context bundle (cap: 20k chars)
4) Ask local LLM (Ollama) to answer using only the provided context
5) Return answer with citations:
   - file name
   - page/sheet info

Prompt rules:
- If answer not in context: say “I don’t know based on your documents.”
- Always provide citations for claims.
- Do not hallucinate file names.

--------------------------------------------------
SERVER + UI
--------------------------------------------------

Backend:
- Node.js + TypeScript
- Express (or Fastify)
- SSE or WebSocket for:
  - indexing progress
  - logs
  - model download progress
  - chat streaming

Frontend:
- React + Vite
- Localhost UI

Routes:
- GET  /api/status
- GET  /api/logs
- GET  /api/files
- POST /api/folder (triggers folder picker OR sets path)
- POST /api/reindex
- POST /api/chat

UI Pages:
1) First Run: Security & Privacy (must be first screen)
   - Plain-language explanation
   - “Continue” button
2) Setup: Choose Folder
3) Indexing: progress bar + friendly logs
4) Chat: chat UI + sources panel
5) Developer: diagnostics (hidden behind “Advanced”)

UI requirements:
- Non-technical tone
- “What is happening right now” section
- “Nothing leaves your computer” reminders
- Show “Offline ready” once done

--------------------------------------------------
TERMINAL UX (HUMAN LOGS)
--------------------------------------------------

During install and during opencoms start:
- Mirror the same friendly logs that UI shows.
- Provide clear phases:
  - Installing prerequisites
  - Downloading local AI model
  - Starting local server
  - Waiting for first browser open
- Provide a single line URL once ready.

Example terminal output:
[1/6] Installing prerequisites…
[2/6] Installing local AI engine (Ollama)…
[3/6] Downloading local chat model (llama3)…
[4/6] Downloading local embedding model…
[5/6] Starting OpenComs…
[6/6] Ready → Opening your browser at http://localhost:4545

--------------------------------------------------
CLI COMMANDS
--------------------------------------------------

opencoms start [--folder "/path"] [--port 4545] [--verbose]
opencoms status
opencoms stop
opencoms reindex

opencoms start should:
- start/ensure Ollama running
- start server
- open browser
- begin indexing if folder exists
- otherwise prompt user to pick folder via UI

--------------------------------------------------
SECURITY / PRIVACY REQUIREMENTS (MUST IMPLEMENT + DOCUMENT)
--------------------------------------------------

Runtime constraints:
- Server binds to 127.0.0.1 only (not 0.0.0.0)
- Add CORS restrictions for localhost
- No analytics
- No telemetry
- No user accounts
- Data stored under ~/.opencoms only

Explain in UI and README:
- Local-only architecture
- What files are stored
- How to delete data (opencoms stop + delete ~/.opencoms)
- Threat model (what is and isn’t protected)

Add a “Privacy Mode” setting:
- Disable all outbound network access after install
  (Implementation: Do not make network calls at runtime; only allow downloads during install. Log clearly.)

--------------------------------------------------
DEV-FRIENDLY REPO REQUIREMENTS
--------------------------------------------------

Monorepo structure:

/server
/web
/scripts/install.sh
/bin/opencoms
/native (optional swift helper)
/README.md
/LICENSE (MIT)
CONTRIBUTING.md

README must be compelling to third-party developers:
- Clear architecture diagram (ASCII ok)
- Data flow explanation
- Security model and threat model
- How to add new file types
- How to swap models
- How retrieval works
- How to run dev mode
- How to run tests
- Known limitations and roadmap

Also include:
- “Why it’s secure” section (plain language)
- “Why it’s secure” section (technical detail for devs)
- “No paid services” statement

--------------------------------------------------
IMPLEMENTATION ORDER
--------------------------------------------------

1) Repo scaffold (TypeScript server, React Vite web)
2) CLI + local server start/stop/status
3) Installer script that installs brew/node/ollama and downloads models
4) Ollama integration and local chat endpoint
5) Folder picker integration (AppleScript or Swift helper)
6) File scanning + text extraction for pdf/docx/xlsx
7) Chunking + hashing
8) Local embeddings using onnxruntime-node
9) SQLite schema + persistence
10) Retrieval + RAG prompt with citations
11) Indexing progress and friendly logs (terminal + UI via SSE)
12) File watching and incremental updates
13) First-run Security screen + content
14) README + CONTRIBUTING + LICENSE

Build the full working system with all code, scripts, and documentation.