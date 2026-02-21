#!/bin/bash
set -e

# ─────────────────────────────────────────────
# OpenComs Installer — Fully Local Document Chat
# ─────────────────────────────────────────────

OPENCOMS_DIR="$HOME/.opencoms"
APP_DIR="$OPENCOMS_DIR/app"
MODELS_DIR="$OPENCOMS_DIR/models"
REPO_URL="https://github.com/gfrancomontero/opencoms.git"
CHAT_MODEL="llama3.2"
EMBEDDING_MODEL="all-MiniLM-L6-v2"
EMBEDDING_BASE_URL="https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color
BOLD='\033[1m'

VERBOSE=0
for arg in "$@"; do
  if [ "$arg" = "--verbose" ] || [ "$arg" = "-v" ]; then
    VERBOSE=1
  fi
done

step() {
  echo ""
  echo -e "  ${BLUE}[$1/7]${NC} ${BOLD}$2${NC}"
}

info() {
  echo -e "  ${GREEN}✓${NC} $1"
}

warn() {
  echo -e "  ${YELLOW}⚠${NC} $1"
}

fail() {
  echo ""
  echo -e "  ${RED}✗ $1${NC}"
  if [ -n "$2" ]; then
    echo -e "  ${YELLOW}Fix:${NC} $2"
  fi
  echo ""
  exit 1
}

verbose() {
  if [ "$VERBOSE" = "1" ]; then
    echo -e "  [verbose] $1"
  fi
}

# ─────────────────────────────────────────────
# Welcome
# ─────────────────────────────────────────────
echo ""
echo -e "  ${BOLD}╔══════════════════════════════════════════════════╗${NC}"
echo -e "  ${BOLD}║                                                  ║${NC}"
echo -e "  ${BOLD}║   OpenComs — Private Document Chat               ║${NC}"
echo -e "  ${BOLD}║   Everything runs locally on your computer.      ║${NC}"
echo -e "  ${BOLD}║   Nothing leaves your machine.                   ║${NC}"
echo -e "  ${BOLD}║                                                  ║${NC}"
echo -e "  ${BOLD}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo "  This installer will set up OpenComs on your Mac."
echo "  It will download open-source AI models for local use."
echo "  No accounts, no tracking, no data sent anywhere."
echo ""

# ─────────────────────────────────────────────
# Step 1: Verify macOS and install prerequisites
# ─────────────────────────────────────────────
step 1 "Installing system prerequisites..."

# Check macOS
if [ "$(uname)" != "Darwin" ]; then
  fail "OpenComs only supports macOS." "Please run this on a Mac."
fi
info "macOS detected"

# Check/install Homebrew
if command -v brew &>/dev/null; then
  info "Homebrew is installed"
else
  warn "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" || \
    fail "Failed to install Homebrew." "Visit https://brew.sh for manual installation."

  # Add brew to PATH for Apple Silicon
  if [ -f "/opt/homebrew/bin/brew" ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  fi
  info "Homebrew installed"
fi

# Check/install Node.js
if command -v node &>/dev/null; then
  NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_VERSION" -ge 18 ]; then
    info "Node.js $(node -v) is installed"
  else
    warn "Node.js is too old ($(node -v)). Installing newer version..."
    brew install node || fail "Failed to install Node.js." "Run: brew install node"
    info "Node.js $(node -v) installed"
  fi
else
  warn "Installing Node.js..."
  brew install node || fail "Failed to install Node.js." "Run: brew install node"
  info "Node.js $(node -v) installed"
fi

# Check Git
if command -v git &>/dev/null; then
  info "Git is installed"
else
  warn "Installing Git..."
  brew install git || fail "Failed to install Git." "Run: brew install git"
  info "Git installed"
fi

# ─────────────────────────────────────────────
# Step 2: Install OpenComs
# ─────────────────────────────────────────────
step 2 "Installing OpenComs..."

mkdir -p "$OPENCOMS_DIR"

if [ -d "$APP_DIR" ]; then
  info "OpenComs directory exists, updating..."
  cd "$APP_DIR"
  git pull --quiet 2>/dev/null || true
else
  verbose "Cloning OpenComs repository..."
  git clone --quiet "$REPO_URL" "$APP_DIR" 2>/dev/null || {
    # If repo doesn't exist yet (during development), copy local files
    if [ -d "$(dirname "$0")/.." ]; then
      warn "Using local development copy..."
      cp -R "$(cd "$(dirname "$0")/.." && pwd)" "$APP_DIR"
    else
      fail "Failed to download OpenComs." "Check your internet connection and try again."
    fi
  }
fi

cd "$APP_DIR"

info "Installing dependencies..."
npm install --quiet 2>/dev/null || npm install || fail "Failed to install dependencies." "Run: cd ~/.opencoms/app && npm install"

info "Building project..."
npm run build 2>/dev/null || npm run build || fail "Failed to build OpenComs." "Run: cd ~/.opencoms/app && npm run build"

info "OpenComs installed"

# ─────────────────────────────────────────────
# Step 3: Install Ollama
# ─────────────────────────────────────────────
step 3 "Installing local AI engine (Ollama)..."

if command -v ollama &>/dev/null; then
  info "Ollama is already installed"
else
  warn "Installing Ollama..."
  brew install ollama 2>/dev/null || {
    # Fallback: direct download
    curl -fsSL https://ollama.com/install.sh | sh || \
      fail "Failed to install Ollama." "Visit https://ollama.com to install manually."
  }
  info "Ollama installed"
fi

# Start Ollama if not running
if ! curl -s http://127.0.0.1:11434/api/tags &>/dev/null; then
  info "Starting Ollama service..."
  ollama serve &>/dev/null &
  OLLAMA_PID=$!

  # Wait up to 30 seconds for Ollama to be ready
  OLLAMA_READY=0
  for i in $(seq 1 30); do
    if curl -s http://127.0.0.1:11434/api/tags &>/dev/null; then
      OLLAMA_READY=1
      break
    fi
    sleep 1
    verbose "Waiting for Ollama to start... ($i/30)"
  done

  if [ "$OLLAMA_READY" = "0" ]; then
    fail "Ollama failed to start within 30 seconds." "Try running 'ollama serve' manually in another terminal, then re-run the installer."
  fi
  info "Ollama is running"
else
  info "Ollama is already running"
fi

# ─────────────────────────────────────────────
# Step 4: Download chat model
# ─────────────────────────────────────────────
step 4 "Downloading local chat model ($CHAT_MODEL)..."

if ollama list 2>/dev/null | grep -q "$CHAT_MODEL"; then
  info "Model $CHAT_MODEL is already available"
else
  ollama pull "$CHAT_MODEL" || fail "Failed to download model $CHAT_MODEL." "Run: ollama pull $CHAT_MODEL"
  info "Model $CHAT_MODEL downloaded"
fi

# ─────────────────────────────────────────────
# Step 5: Download embedding model
# ─────────────────────────────────────────────
step 5 "Downloading local embedding model..."

EMBED_DIR="$MODELS_DIR/$EMBEDDING_MODEL"
mkdir -p "$EMBED_DIR"

download_file() {
  local url=$1
  local dest=$2
  local name=$(basename "$dest")

  if [ -f "$dest" ]; then
    verbose "$name already exists, skipping"
    return 0
  fi

  verbose "Downloading $name..."
  curl -fsSL "$url" -o "$dest" || fail "Failed to download $name." "Check your internet connection."
}

download_file "$EMBEDDING_BASE_URL/onnx/model.onnx" "$EMBED_DIR/model.onnx"
download_file "$EMBEDDING_BASE_URL/tokenizer.json" "$EMBED_DIR/tokenizer.json"
download_file "$EMBEDDING_BASE_URL/config.json" "$EMBED_DIR/config.json"

info "Embedding model ready"

# ─────────────────────────────────────────────
# Step 6: Validate installation
# ─────────────────────────────────────────────
step 6 "Validating installation..."

# Create CLI symlink — try /usr/local/bin first, fall back to shell alias
SYMLINK_PATH="/usr/local/bin/opencoms"
SYMLINK_CREATED=0

if [ -L "$SYMLINK_PATH" ] || [ -f "$SYMLINK_PATH" ]; then
  rm -f "$SYMLINK_PATH" 2>/dev/null || true
fi

mkdir -p /usr/local/bin 2>/dev/null || true
if ln -sf "$APP_DIR/bin/opencoms" "$SYMLINK_PATH" 2>/dev/null; then
  SYMLINK_CREATED=1
  info "CLI symlink created at $SYMLINK_PATH"
fi

# Also add a shell alias/PATH entry so it's always available
SHELL_RC=""
if [ -f "$HOME/.zshrc" ]; then
  SHELL_RC="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
  SHELL_RC="$HOME/.bashrc"
elif [ -f "$HOME/.bash_profile" ]; then
  SHELL_RC="$HOME/.bash_profile"
fi

if [ -n "$SHELL_RC" ]; then
  # Remove any old opencoms entries
  if grep -q "opencoms" "$SHELL_RC" 2>/dev/null; then
    grep -v "opencoms" "$SHELL_RC" > "$SHELL_RC.tmp" && mv "$SHELL_RC.tmp" "$SHELL_RC"
  fi

  # Add alias that always works
  echo "" >> "$SHELL_RC"
  echo "# OpenComs — Private Document Chat" >> "$SHELL_RC"
  echo "alias opencoms='node $APP_DIR/bin/opencoms'" >> "$SHELL_RC"
  info "Shell alias added to $(basename "$SHELL_RC")"
fi

# Make it available in the current session too
alias opencoms="node $APP_DIR/bin/opencoms" 2>/dev/null || true
export PATH="$APP_DIR/bin:$PATH"

# Verify
if command -v opencoms &>/dev/null || [ "$SYMLINK_CREATED" = "1" ]; then
  info "CLI installed: opencoms"
else
  warn "Run with: node $APP_DIR/bin/opencoms start"
fi

# Check all components
ERRORS=0

if ! command -v node &>/dev/null; then
  warn "Node.js not found"
  ERRORS=$((ERRORS + 1))
fi

if ! command -v ollama &>/dev/null; then
  warn "Ollama not found"
  ERRORS=$((ERRORS + 1))
fi

if [ ! -f "$EMBED_DIR/model.onnx" ]; then
  warn "Embedding model not found"
  ERRORS=$((ERRORS + 1))
fi

if [ ! -f "$APP_DIR/server/dist/index.js" ] && [ ! -f "$APP_DIR/server/src/index.ts" ]; then
  warn "Server files not found"
  ERRORS=$((ERRORS + 1))
fi

if [ "$ERRORS" -gt 0 ]; then
  fail "Installation validation found $ERRORS issues." "Try running the installer again."
fi

info "All components verified"

# Write initial config
if [ ! -f "$OPENCOMS_DIR/config.json" ]; then
  cat > "$OPENCOMS_DIR/config.json" <<EOF
{
  "port": 4545,
  "chatModel": "$CHAT_MODEL",
  "firstRunComplete": false,
  "privacyMode": false
}
EOF
fi

# ─────────────────────────────────────────────
# Step 7: Start OpenComs
# ─────────────────────────────────────────────
step 7 "Starting OpenComs..."

echo ""
echo ""
echo -e "  ${GREEN}${BOLD}🎉🎉🎉 INSTALLED SUCCESSFULLY 🎉🎉🎉${NC}"
echo ""
echo -e "  ${BOLD}╔══════════════════════════════════════════════════╗${NC}"
echo -e "  ${BOLD}║                                                  ║${NC}"
echo -e "  ${BOLD}║   OpenComs is ready!                             ║${NC}"
echo -e "  ${BOLD}║                                                  ║${NC}"
echo -e "  ${BOLD}║   You can visit OpenComs at:                     ║${NC}"
echo -e "  ${BOLD}║   ${GREEN}http://localhost:4545${NC}${BOLD}                          ║${NC}"
echo -e "  ${BOLD}║                                                  ║${NC}"
echo -e "  ${BOLD}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo "  Commands:"
echo "    opencoms start    — Start OpenComs"
echo "    opencoms stop     — Stop OpenComs"
echo "    opencoms status   — Check status"
echo "    opencoms reindex  — Reindex documents"
echo ""
echo "  Data location: ~/.opencoms/"
echo "  To uninstall: opencoms stop && rm -rf ~/.opencoms /usr/local/bin/opencoms"
echo ""

# Auto-start
opencoms start 2>/dev/null || node "$APP_DIR/bin/opencoms" start 2>/dev/null || {
  echo ""
  echo "  Run 'opencoms start' to begin."
  echo ""
}
